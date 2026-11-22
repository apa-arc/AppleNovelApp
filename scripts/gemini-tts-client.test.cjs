const test = require("node:test");
const assert = require("node:assert/strict");
const { synthesizeGeminiTTS, GEMINI_TTS_ENDPOINT, GEMINI_TTS_MODEL } = require("../.test-build/gemini-tts-client.js");

const audio = new Uint8Array(48);
audio.set([82, 73, 70, 70], 0);
audio.set([87, 65, 86, 69], 8);
const audioBase64 = Buffer.from(audio).toString("base64");
const success = () => new Response(JSON.stringify({
  steps: [{ type: "model_output", content: [{ type: "audio", data: audioBase64 }] }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

test("uses the documented Gemini Interactions endpoint and extracts REST WAV output", async () => {
  let captured;
  const fetchMock = async (url, init) => { captured = { url, init }; return success(); };
  const bytes = await synthesizeGeminiTTS({ apiKey: " test-key ", parts: [{ text: "你好，欢迎使用私人小说。" }] }, fetchMock);
  assert.equal(captured.url, GEMINI_TTS_ENDPOINT);
  assert.equal(GEMINI_TTS_MODEL, "gemini-3.8-flash-tts");
  assert.equal(captured.init.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, GEMINI_TTS_MODEL);
  assert.deepEqual(body.response_format, { type: "audio" });
  assert.deepEqual(body.generation_config.speech_config, [{ voice: "Kore" }]);
  assert.deepEqual(body.input[0].content[0], { type: "text", text: "你好，欢迎使用私人小说。" });
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [82, 73, 70, 70]);
});

test("sends multi-speaker turns as documented speech_metadata annotations", async () => {
  let body;
  const fetchMock = async (_url, init) => { body = JSON.parse(init.body); return success(); };
  await synthesizeGeminiTTS({
    apiKey: "key",
    speakers: [{ name: "Narrator", voiceName: "Kore" }, { name: "Hero", voiceName: "Puck" }],
    parts: [
      { text: "夜色渐深。", speaker: "Narrator", style: "warm audiobook narration" },
      { text: "你是谁？", speaker: "Hero", style: "tense and suspicious" },
    ],
  }, fetchMock);
  assert.deepEqual(body.generation_config.speech_config.speakers, [
    { speaker: "Narrator", voice: "Kore" },
    { speaker: "Hero", voice: "Puck" },
  ]);
  assert.deepEqual(body.input[0].content.map((part) => part.annotations[0]), [
    { type: "speech_metadata", speaker: "Narrator", style: "warm audiobook narration" },
    { type: "speech_metadata", speaker: "Hero", style: "tense and suspicious" },
  ]);
});

test("rejects missing keys, invalid speaker counts, and unmapped dialogue before network calls", async () => {
  let called = false;
  const fetchMock = async () => { called = true; throw new Error("unexpected"); };
  await assert.rejects(() => synthesizeGeminiTTS({ apiKey: " ", parts: [{ text: "你好" }] }, fetchMock), /API Key/);
  await assert.rejects(() => synthesizeGeminiTTS({ apiKey: "key", parts: [{ text: "你好" }], speakers: [{ name: "A", voiceName: "Kore" }] }, fetchMock), /恰好两种/);
  await assert.rejects(() => synthesizeGeminiTTS({
    apiKey: "key", parts: [{ text: "你好", speaker: "Other" }],
    speakers: [{ name: "A", voiceName: "Kore" }, { name: "B", voiceName: "Puck" }],
  }, fetchMock), /每一段都必须指定/);
  assert.equal(called, false);
});

test("maps rate-limit and auth failures without paid fallback", async () => {
  for (const [status, expected] of [[401, /无效/], [403, /权限不足/], [429, /不会切换付费服务/], [404, /模型当前不可用/]]) {
    const fetchMock = async () => new Response(JSON.stringify({ error: { message: "test", status: "RESOURCE_EXHAUSTED" } }), { status });
    await assert.rejects(() => synthesizeGeminiTTS({ apiKey: "key", parts: [{ text: "你好" }] }, fetchMock), expected);
  }
});

test("rejects missing audio and invalid WAV headers", async () => {
  const missing = async () => new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: "no audio" }] }] }), { status: 200 });
  await assert.rejects(() => synthesizeGeminiTTS({ apiKey: "key", parts: [{ text: "你好" }] }, missing), /没有返回音频/);
  const invalid = async () => new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "audio", data: Buffer.from("not-a-wav").toString("base64") }] }] }), { status: 200 });
  await assert.rejects(() => synthesizeGeminiTTS({ apiKey: "key", parts: [{ text: "你好" }] }, invalid), /有效 WAV/);
});
