const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveTtsModelPath } = require("../.test-build/tts/model-registry.js");

const modelId = "kokoro-multi-lang-v1_1";

function createDependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      async getInstalledPath() {
        calls.push("getInstalledPath");
        return null;
      },
      async clearModelsCache() {
        calls.push("clearModelsCache");
      },
      async refreshModels(forceRefresh = false) {
        calls.push(forceRefresh ? "refresh:force" : "refresh");
      },
      async ensureModel() {
        calls.push("ensureModel");
        return { localPath: "/models/kokoro" };
      },
      ...overrides,
    },
  };
}

test("uses an installed model directly without refreshing the registry", async () => {
  const { calls, dependencies } = createDependencies({
    async getInstalledPath() {
      calls.push("getInstalledPath");
      return "/offline/models/kokoro";
    },
  });

  const path = await resolveTtsModelPath(modelId, dependencies);

  assert.equal(path, "/offline/models/kokoro");
  assert.deepEqual(calls, ["getInstalledPath"]);
});


test("refreshes the registry when installed-path lookup itself throws Unknown model id", async () => {
  const { calls, dependencies } = createDependencies({
    async getInstalledPath() {
      calls.push("getInstalledPath");
      throw new Error(`Unknown model id: ${modelId}`);
    },
  });

  const path = await resolveTtsModelPath(modelId, dependencies);

  assert.equal(path, "/models/kokoro");
  assert.deepEqual(calls, ["getInstalledPath", "refresh", "ensureModel"]);
});

test("refreshes the registry before the first download", async () => {
  const { calls, dependencies } = createDependencies();

  const path = await resolveTtsModelPath(modelId, dependencies);

  assert.equal(path, "/models/kokoro");
  assert.deepEqual(calls, ["getInstalledPath", "refresh", "ensureModel"]);
});

test("clears stale cache before force-refreshing an unknown model ID", async () => {
  let attempts = 0;
  const { calls, dependencies } = createDependencies({
    async ensureModel() {
      calls.push("ensureModel");
      attempts += 1;
      if (attempts === 1) throw new Error(`Unknown model id: ${modelId}`);
      return { localPath: "/models/kokoro-after-refresh" };
    },
  });

  const path = await resolveTtsModelPath(modelId, dependencies);

  assert.equal(path, "/models/kokoro-after-refresh");
  assert.deepEqual(calls, [
    "getInstalledPath",
    "refresh",
    "ensureModel",
    "clearModelsCache",
    "refresh:force",
    "ensureModel",
  ]);
});

test("surfaces registry network errors instead of falling back to a stale unknown-ID cache", async () => {
  const networkFailure = new Error("Failed to fetch models: 403");
  const { calls, dependencies } = createDependencies({
    async ensureModel() {
      calls.push("ensureModel");
      throw new Error(`Unknown model id: ${modelId}`);
    },
    async refreshModels(forceRefresh = false) {
      calls.push(forceRefresh ? "refresh:force" : "refresh");
      if (forceRefresh) throw networkFailure;
    },
  });

  await assert.rejects(resolveTtsModelPath(modelId, dependencies), networkFailure);
  assert.deepEqual(calls, [
    "getInstalledPath",
    "refresh",
    "ensureModel",
    "clearModelsCache",
    "refresh:force",
  ]);
});

test("does not retry unrelated download or checksum errors", async () => {
  const failure = new Error("SHA-256 checksum mismatch");
  const { calls, dependencies } = createDependencies({
    async ensureModel() {
      calls.push("ensureModel");
      throw failure;
    },
  });

  await assert.rejects(resolveTtsModelPath(modelId, dependencies), failure);
  assert.deepEqual(calls, ["getInstalledPath", "refresh", "ensureModel"]);
});

test("surfaces an unknown-ID error if a successful forced refresh still cannot resolve it", async () => {
  const failure = new Error(`Unknown model id: ${modelId}`);
  const { calls, dependencies } = createDependencies({
    async ensureModel() {
      calls.push("ensureModel");
      throw failure;
    },
  });

  await assert.rejects(resolveTtsModelPath(modelId, dependencies), failure);
  assert.deepEqual(calls, [
    "getInstalledPath",
    "refresh",
    "ensureModel",
    "clearModelsCache",
    "refresh:force",
    "ensureModel",
  ]);
});

test("does not retry non-Error thrown values", async () => {
  const { calls, dependencies } = createDependencies({
    async ensureModel() {
      calls.push("ensureModel");
      throw "network unavailable";
    },
  });

  await assert.rejects(resolveTtsModelPath(modelId, dependencies), (error) => {
    assert.equal(error, "network unavailable");
    return true;
  });
  assert.deepEqual(calls, ["getInstalledPath", "refresh", "ensureModel"]);
});
