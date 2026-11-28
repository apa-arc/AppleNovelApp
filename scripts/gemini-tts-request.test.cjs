const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGeminiTtsRequest,
  extractGeminiTtsAudio,
  formatGeminiTtsHttpError,
} = require("../.test-build/tts/gemini-request.js");

test("builds a single-speaker Mandarin narration request", () => {
  const request = buildGeminiTtsRequest(
    [{ text: "夜色渐深。", speakerId: 3 }],
    [{ speakerId: 3, voice: "Kore" }],
  );
  assert.equal(request.model, "gemini-3.8-flash-tts");
  assert.deepEqual(request.generation_config.speech_config, [{ voice: "Kore" }]);
  assert.equal(request.input[0].content[0].text, "夜色渐深。");
});

test("builds two-speaker dialogue with stable speaker annotations", () => {
  const request = buildGeminiTtsRequest(
    [
      { text: "你来了。", speakerId: 3, style: "calm" },
      { text: "我一直在等你。", speakerId: 58 },
    ],
    [
      { speakerId: 3, voice: "Kore" },
      { speakerId: 58, voice: "Puck" },
    ],
  );
  assert.deepEqual(request.generation_config.speech_config, {
    speakers: [
      { speaker: "Speaker1", voice: "Kore" },
      { speaker: "Speaker2", voice: "Puck" },
    ],
  });
  assert.equal(request.input[0].content[0].annotations[0].speaker, "Speaker1");
  assert.equal(request.input[0].content[0].annotations[0].style, "calm");
  assert.equal(request.input[0].content[1].annotations[0].speaker, "Speaker2");
});

test("rejects more than two speakers in a single request", () => {
  assert.throws(() => buildGeminiTtsRequest(
    [
      { text: "甲", speakerId: 1 },
      { text: "乙", speakerId: 2 },
      { text: "丙", speakerId: 3 },
    ],
    [
      { speakerId: 1, voice: "Kore" },
      { speakerId: 2, voice: "Puck" },
      { speakerId: 3, voice: "Aoede" },
    ],
  ), /最多配置两位角色/);
});

test("extracts audio from both output_audio convenience data and REST steps", () => {
  assert.equal(extractGeminiTtsAudio({ output_audio: { data: "YWJj" } }), "YWJj");
  assert.equal(extractGeminiTtsAudio({
    steps: [{ type: "model_output", content: [{ type: "audio", data: "ZGVm" }] }],
  }), "ZGVm");
  assert.equal(extractGeminiTtsAudio({ steps: [] }), null);
});

test("HTTP 429 stops with an explicit free-tier message", () => {
  const error = formatGeminiTtsHttpError(429);
  assert.match(error.message, /免费额度/);
  assert.match(error.message, /不会自动切换付费接口/);
});
