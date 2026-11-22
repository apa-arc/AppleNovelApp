const test = require("node:test");
const assert = require("node:assert/strict");
const { synthesizeFishAudio } = require("../.test-build/fish-audio-client.js");

test("uses the explicitly free model and requests MP3 output", async () => {
  let captured;
  const fetchMock = async (url, init) => {
    captured = { url, init };
    return new Response(new Uint8Array([73, 68, 51, 1]), { status: 200 });
  };
  const bytes = await synthesizeFishAudio({
    apiKey: "test-secret",
    text: "<|speaker:0|>你好。<|speaker:1|>你好！",
    referenceId: ["narrator-id", "character-id"],
  }, fetchMock);
  assert.deepEqual(Array.from(bytes), [73, 68, 51, 1]);
  assert.equal(captured.url, "https://api.fish.audio/v1/tts");
  assert.equal(captured.init.headers.model, "s2.1-pro-free");
  assert.equal(captured.init.headers.Authorization, "Bearer test-secret");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.format, "mp3");
  assert.deepEqual(body.reference_id, ["narrator-id", "character-id"]);
  assert.equal(body.text.includes("<|speaker:0|>"), true);
});

test("rejects missing key and empty text before making a request", async () => {
  let called = false;
  const fetchMock = async () => { called = true; throw new Error("unexpected"); };
  await assert.rejects(() => synthesizeFishAudio({ apiKey: " ", text: "你好" }, fetchMock), /API Key/);
  await assert.rejects(() => synthesizeFishAudio({ apiKey: "key", text: " " }, fetchMock), /不能为空/);
  assert.equal(called, false);
});

test("maps auth, billing and rate-limit errors without paid fallback", async () => {
  for (const [status, message] of [
    [401, /无效或已失效/],
    [402, /未进行付费模型回退/],
    [429, /过于频繁/],
  ]) {
    const fetchMock = async () => new Response("{}", { status });
    await assert.rejects(() => synthesizeFishAudio({ apiKey: "key", text: "你好" }, fetchMock), message);
  }
});

test("rejects empty successful audio responses", async () => {
  const fetchMock = async () => new Response(new Uint8Array([]), { status: 200 });
  await assert.rejects(() => synthesizeFishAudio({ apiKey: "key", text: "你好" }, fetchMock), /空音频/);
});
