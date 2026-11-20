const test = require("node:test");
const assert = require("node:assert/strict");
const manager = require("../.test-build/speech-model-download.js");

test("model download cannot start automatically", () => {
  const initial = manager.createModelDownloadState(147052523);
  assert.equal(manager.requestModelDownload(initial, false).status, "not-downloaded");
  assert.equal(manager.confirmModelDownload(initial).status, "not-downloaded");
});

test("download requires tap and a second explicit confirmation", () => {
  const initial = manager.createModelDownloadState(147052523);
  const prompt = manager.requestModelDownload(initial, true);
  assert.equal(prompt.status, "awaiting-confirmation");
  assert.equal(manager.confirmModelDownload(prompt).status, "downloading");
  assert.equal(manager.cancelModelDownloadConfirmation(prompt).status, "not-downloaded");
});

test("progress is clamped and only changes while downloading", () => {
  const initial = manager.createModelDownloadState(100);
  const started = manager.confirmModelDownload(manager.requestModelDownload(initial, true));
  assert.equal(manager.updateModelDownloadProgress(started, 150).downloadedBytes, 100);
  assert.equal(manager.updateModelDownloadProgress(started, -10).downloadedBytes, 0);
  assert.equal(manager.updateModelDownloadProgress(initial, 50).downloadedBytes, 0);
});

test("pause and resume preserve progress", () => {
  const started = manager.confirmModelDownload(manager.requestModelDownload(manager.createModelDownloadState(100), true));
  const progressed = manager.updateModelDownloadProgress(started, 40);
  const paused = manager.pauseModelDownload(progressed);
  assert.equal(paused.status, "paused");
  assert.equal(manager.resumeModelDownload(paused).downloadedBytes, 40);
  assert.equal(manager.resumeModelDownload(paused).status, "downloading");
});

test("only a running download can become installed", () => {
  const initial = manager.createModelDownloadState(100);
  assert.equal(manager.completeModelDownload(initial).status, "not-downloaded");
  const started = manager.confirmModelDownload(manager.requestModelDownload(initial, true));
  const installed = manager.completeModelDownload(started);
  assert.equal(installed.status, "installed");
  assert.equal(installed.downloadedBytes, 100);
  assert.equal(manager.requestModelDownload(installed, true).status, "installed");
});

test("failed downloads can resume and installed models require explicit deletion", () => {
  const started = manager.confirmModelDownload(manager.requestModelDownload(manager.createModelDownloadState(100), true));
  const failed = manager.failModelDownload(started, "network error");
  assert.equal(failed.status, "failed");
  assert.equal(manager.resumeModelDownload(failed).status, "downloading");
  const installed = manager.completeModelDownload(started);
  assert.equal(manager.removeModelDownload(installed).status, "not-downloaded");
});
