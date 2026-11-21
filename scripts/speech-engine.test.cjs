const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSpeechText } = require("../.test-build/speech-engine.js");

test("speech text is split on natural boundaries and respects the size limit", () => {
  const chunks = splitSpeechText("第一句。第二句！\n第三句？", 80);
  assert.deepEqual(chunks, ["第一句。第二句！第三句？"]);
  const long = splitSpeechText("甲".repeat(190), 80);
  assert.equal(long.join("").length, 190);
  assert.ok(long.every((chunk) => chunk.length <= 80));
  assert.deepEqual(splitSpeechText("  \n "), []);
});
