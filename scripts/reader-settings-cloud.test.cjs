const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_READER_SETTINGS, normalizeReaderSettings } = require("../.test-build/reader-settings.js");

test("cloud speech endpoint only persists safe HTTPS URLs", () => {
  assert.equal(normalizeReaderSettings({ speechCloudEndpoint: "https://tts.example.com/" }).speechCloudEndpoint, "https://tts.example.com");
  for (const value of ["http://tts.example.com", "https://user:pass@tts.example.com", "javascript:alert(1)", "not a url"]) {
    assert.equal(normalizeReaderSettings({ speechCloudEndpoint: value }).speechCloudEndpoint, "");
  }
});
