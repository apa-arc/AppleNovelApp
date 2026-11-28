const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_GEMINI_VOICE_ID,
  buildSpeakerVoiceMap,
  extractExplicitSpeakerNames,
  splitTextForMultiVoice,
} = require("../.test-build/tts-speaker/speaker-assignment.js");

test("detects explicitly named speakers before and after dialogue", () => {
  const text = "张三说道：“我们走吧。”李四问道：“去哪儿？”“马上出发。”王五答道。";
  assert.deepEqual(extractExplicitSpeakerNames(text), ["张三", "李四", "王五"]);
});

test("does not treat pronouns or group labels as named characters", () => {
  const text = "她说道：“我知道了。”众人齐声说：“出发！”";
  assert.deepEqual(extractExplicitSpeakerNames(text), []);
});

test("allocates stable distinct Gemini voices and preserves manual choices", () => {
  const text = "张三说道：“你好。”李四说道：“你好。”";
  const first = buildSpeakerVoiceMap(text);
  const second = buildSpeakerVoiceMap(text);
  assert.deepEqual(first, second);
  assert.notEqual(first["张三"], first["李四"]);
  assert.notEqual(first["张三"], DEFAULT_GEMINI_VOICE_ID);
  assert.notEqual(first["李四"], DEFAULT_GEMINI_VOICE_ID);
  assert.equal(buildSpeakerVoiceMap(text, { "张三": 27 })["张三"], 27);
});

test("uses the default voice when dialogue speaker is ambiguous or unmapped", () => {
  const segments = splitTextForMultiVoice("她说道：“别过来！”", {});
  assert.equal(segments.length, 1);
  assert.equal(segments[0].speakerId, DEFAULT_GEMINI_VOICE_ID);
  assert.equal(segments[0].speakerName, undefined);
});

test("splits narration and dialogue while assigning the book voice map", () => {
  const text = "夜色渐深。张三说道：“我们走吧。”李四问道：“去哪儿？”";
  const map = buildSpeakerVoiceMap(text);
  const segments = splitTextForMultiVoice(text, map);
  assert.deepEqual(segments.map((segment) => segment.kind), [
    "narration", "dialogue", "dialogue"
  ]);
  assert.equal(segments[1].speakerName, "张三");
  assert.equal(segments[1].speakerId, map["张三"]);
  assert.equal(segments[2].speakerName, "李四");
  assert.equal(segments[2].speakerId, map["李四"]);
});


test("splits long narration into manageable sentence-sized TTS chunks", () => {
  const text = "甲".repeat(220) + "。乙乙乙。";
  const segments = splitTextForMultiVoice(text);
  assert.ok(segments.length >= 2);
  assert.ok(segments.every((segment) => segment.text.length <= 180));
  assert.equal(segments.at(-1).text, "乙乙乙。");
});


test("resolves the speaker rather than the person being addressed", () => {
  const text = "张三看向李四说道：“我们走吧。” “别过来！”林婉儿对着他喊道。";
  assert.deepEqual(extractExplicitSpeakerNames(text), ["张三", "林婉儿"]);
});


test("recognizes the common name-colon dialogue format without guessing pronouns", () => {
  assert.deepEqual(extractExplicitSpeakerNames("张三：“快走！”她：“我不走。”"), ["张三"]);
});


test("does not read a speaker attribution following a quoted line", () => {
  const segments = splitTextForMultiVoice("“你好。”张三说道。", { "张三": 28 });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "dialogue");
  assert.equal(segments[0].speakerName, "张三");
  assert.equal(segments[0].speakerId, 28);
});


test("resolves the speaker in comma-separated addressed speech tags", () => {
  const text = "张三看着李四，冷冷地说：“别再跟着我。”";
  assert.deepEqual(extractExplicitSpeakerNames(text), ["张三"]);
});


test("does not read direct name-colon attributions as narration", () => {
  const segments = splitTextForMultiVoice("张三：“快走！”她：“我不走。”", { "张三": 28 });
  assert.deepEqual(segments.map((segment) => segment.text), ["快走！", "我不走。"]);
  assert.equal(segments[0].speakerId, 28);
  assert.equal(segments[1].speakerId, DEFAULT_GEMINI_VOICE_ID);
});
