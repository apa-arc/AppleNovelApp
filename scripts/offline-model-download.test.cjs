const test = require("node:test");
const assert = require("node:assert/strict");
const { canStartOfflineModelDownload, canUseOfflineModel } = require("../.test-build/offline-model-download.js");

test("download requires an explicit user action and confirmation", () => {
  assert.equal(canStartOfflineModelDownload({ userInitiated: false, confirmed: true, alreadyDownloaded: false }), false);
  assert.equal(canStartOfflineModelDownload({ userInitiated: true, confirmed: false, alreadyDownloaded: false }), false);
  assert.equal(canStartOfflineModelDownload({ userInitiated: true, confirmed: true, alreadyDownloaded: false }), true);
});

test("an installed model is not downloaded again", () => {
  assert.equal(canStartOfflineModelDownload({ userInitiated: true, confirmed: true, alreadyDownloaded: true }), false);
});

test("offline availability depends only on an installed model", () => {
  assert.equal(canUseOfflineModel(false), false);
  assert.equal(canUseOfflineModel(true), true);
});
