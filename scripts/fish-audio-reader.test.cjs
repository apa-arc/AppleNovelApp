const test = require("node:test");
const assert = require("node:assert/strict");
const { synthesizeFishAudioReader } = require("../.test-build/fish-audio-reader.js");

test("synthesizes narration and mapped dialogue in sequential MP3 chunks", async () => {
  const requests = [];
  const fetchMock = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(new Uint8Array([73, 68, 51, requests.length]), { status: 200 });
  };
  const chunks = [];
  for await (const chunk of synthesizeFishAudioReader({
    apiKey: "test-key",
    text: "旁白开始。萧炎说道：“第一句对白。”随后继续。萧炎又说道：“第二句对白。”",
    voiceReferences: { "旁白": "narrator", "萧炎": "xiao-yan" },
    maxChunkLength: 80,
    fetchImpl: fetchMock,
  })) chunks.push(chunk);

  assert.equal(chunks.length, requests.length);
  assert.equal(chunks[0].index, 1);
  assert.equal(chunks.at(-1).total, chunks.length);
  assert.ok(requests.every((request) => request.format === "mp3"));
  assert.ok(requests.some((request) => request.text.includes("<|speaker:0|>")));
  assert.ok(requests.some((request) => request.text.includes("<|speaker:1|>")));
  assert.ok(requests.every((request) => Array.isArray(request.reference_id)));
});

test("does not make a request for empty input", async () => {
  let called = false;
  const fetchMock = async () => { called = true; throw new Error("unexpected"); };
  const iterator = synthesizeFishAudioReader({
    apiKey: "test-key",
    text: "   ",
    voiceReferences: {},
    fetchImpl: fetchMock,
  });
  await assert.rejects(async () => { for await (const _chunk of iterator) { /* no-op */ } }, /不能为空/);
  assert.equal(called, false);
});
