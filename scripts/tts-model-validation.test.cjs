const test = require("node:test");
const assert = require("node:assert/strict");
const { assertKokoroChineseModelValid } = require("../.test-build/tts/model-validation.js");

test("accepts a complete Kokoro model with Chinese lexicon", () => {
  assert.doesNotThrow(() => assertKokoroChineseModelValid({
    success: true,
    modelType: "kokoro",
    lexiconLanguageCandidates: ["en-us", "zh"],
  }));
});

test("accepts regional Chinese lexicon identifiers", () => {
  assert.doesNotThrow(() => assertKokoroChineseModelValid({
    success: true,
    modelType: "kokoro",
    lexiconLanguageCandidates: ["zh-cn"],
  }));
});

test("rejects incomplete model files with native diagnostic", () => {
  assert.throws(
    () => assertKokoroChineseModelValid({
      success: false,
      error: "missing required files: voices",
    }),
    /缺少初始化所需资源|missing required files: voices/,
  );
});

test("rejects a model without Chinese lexicon", () => {
  assert.throws(
    () => assertKokoroChineseModelValid({
      success: true,
      modelType: "kokoro",
      lexiconLanguageCandidates: ["en-us", "gb-en"],
    }),
    /未检测到中文词典/,
  );
});

test("rejects a mismatched model type", () => {
  assert.throws(
    () => assertKokoroChineseModelValid({
      success: true,
      modelType: "vits",
      lexiconLanguageCandidates: ["zh"],
    }),
    /模型类型不匹配/,
  );
});
