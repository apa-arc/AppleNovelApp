const test = require("node:test");
const assert = require("node:assert/strict");
const { encodePcm16Wav } = require("../.test-build/wav-encoder.js");

test("encodes mono PCM16 WAV with a valid RIFF header and sample rate", () => {
  const bytes = encodePcm16Wav([-1, 0, 1], 24000);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(text(12, 4), "fmt ");
  assert.equal(text(36, 4), "data");
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(28, true), 48000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});

test("rejects empty or invalid audio", () => {
  assert.throws(() => encodePcm16Wav([], 24000), /无效/);
  assert.throws(() => encodePcm16Wav([0], 0), /无效/);
});
