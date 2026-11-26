const test = require("node:test");
const assert = require("node:assert/strict");
const { createValidatedTtsEngine } = require("../.test-build/provider-fallback.js");

function createDependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      async create(provider) {
        calls.push(`create:${provider}`);
        return { provider };
      },
      async getSpeakerCount(engine) {
        calls.push(`speakers:${engine.provider}`);
        return 103;
      },
      async destroy(engine) {
        calls.push(`destroy:${engine.provider}`);
      },
      ...overrides,
    },
  };
}

test("keeps Core ML when it initializes the complete speaker table", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await createValidatedTtsEngine("coreml", 103, dependencies);
  assert.equal(result.provider, "coreml");
  assert.equal(result.engine.provider, "coreml");
  assert.deepEqual(calls, ["create:coreml", "speakers:coreml"]);
});

test("falls back to CPU when Core ML creation fails", async () => {
  const { calls, dependencies } = createDependencies({
    async create(provider) {
      calls.push(`create:${provider}`);
      if (provider === "coreml") throw new Error("Core ML init failed");
      return { provider };
    },
  });
  const result = await createValidatedTtsEngine("coreml", 103, dependencies);
  assert.equal(result.provider, "cpu");
  assert.deepEqual(calls, ["create:coreml", "create:cpu", "speakers:cpu"]);
});

test("destroys a Core ML engine and falls back when speaker validation fails", async () => {
  const { calls, dependencies } = createDependencies({
    async getSpeakerCount(engine) {
      calls.push(`speakers:${engine.provider}`);
      return engine.provider === "coreml" ? 80 : 103;
    },
  });
  const result = await createValidatedTtsEngine("coreml", 103, dependencies);
  assert.equal(result.provider, "cpu");
  assert.deepEqual(calls, [
    "create:coreml",
    "speakers:coreml",
    "destroy:coreml",
    "create:cpu",
    "speakers:cpu",
  ]);
});

test("destroys the failed CPU engine and surfaces its validation error", async () => {
  const { calls, dependencies } = createDependencies({
    async getSpeakerCount(engine) {
      calls.push(`speakers:${engine.provider}`);
      return 80;
    },
  });
  await assert.rejects(
    createValidatedTtsEngine("cpu", 103, dependencies),
    /预期至少 103 个音色，实际检测到 80 个/,
  );
  assert.deepEqual(calls, [
    "create:cpu",
    "speakers:cpu",
    "destroy:cpu",
  ]);
});
