const test = require("node:test");
const assert = require("node:assert/strict");
const { requestCloudSpeech, checkCloudTtsServer, enrollCloudSpeechDevice, revokeCloudSpeechDevice } = require("../.test-build/cloud-tts.js");

test("cloud client sends the selected Kokoro speaker and bounded speed", async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(new Uint8Array(44), { status: 200, headers: { "content-type": "audio/wav" } });
  };
  const bytes = await requestCloudSpeech("https://tts.example.com/", {
    voiceId: "kokoro-multi-lang-v1_1:speaker-3", text: " 你好 ", speed: 2.4,
  }, "a-valid-device-token-12345678901234567890", fakeFetch);
  assert.equal(request.url, "https://tts.example.com/v1/audio/speech");
  assert.deepEqual(request.body, { model: "kokoro-multi-lang-v1_1", speaker_id: 3, text: "你好", speed: 2 });
  assert.equal(bytes.byteLength, 44);
});

test("cloud client rejects non-HTTPS endpoints before making a request", async () => {
  let called = false;
  await assert.rejects(
    requestCloudSpeech("http://tts.example.com", { voiceId: "kokoro-multi-lang-v1_1:speaker-3", text: "你好", speed: 1 }, "a-valid-device-token-12345678901234567890", async () => {
      called = true;
      return new Response(new Uint8Array(44), { headers: { "content-type": "audio/wav" } });
    }),
    /HTTPS/,
  );
  assert.equal(called, false);
});

test("cloud client rejects invalid voices, non-audio responses and oversized text", async () => {
  const fakeFetch = async () => new Response("not audio", { status: 200, headers: { "content-type": "text/plain" } });
  await assert.rejects(requestCloudSpeech("https://tts.example.com", { voiceId: "missing", text: "你好", speed: 1 }, "a-valid-device-token-12345678901234567890", fakeFetch), /音色无效/);
  await assert.rejects(requestCloudSpeech("https://tts.example.com", { voiceId: "kokoro-multi-lang-v1_1:speaker-3", text: "x".repeat(421), speed: 1 }, "a-valid-device-token-12345678901234567890", fakeFetch), /420/);
  await assert.rejects(requestCloudSpeech("https://tts.example.com", { voiceId: "kokoro-multi-lang-v1_1:speaker-3", text: "你好", speed: 1 }, "a-valid-device-token-12345678901234567890", fakeFetch), /非 WAV/);
});

test("cloud client surfaces server errors without exposing request secrets", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ detail: "model not ready" }), { status: 503, headers: { "content-type": "application/json" } });
  await assert.rejects(requestCloudSpeech("https://tts.example.com", { voiceId: "kokoro-multi-lang-v1_1:speaker-3", text: "你好", speed: 1 }, "a-valid-device-token-12345678901234567890", fakeFetch), /model not ready/);
});


test("health check confirms the expected Kokoro model and all speakers", async () => {
  const status = await checkCloudTtsServer("https://tts.example.com", async (url, init) => {
    assert.equal(url, "https://tts.example.com/health");
    assert.equal(init.method, "GET");
    return new Response(JSON.stringify({ status: "ok", model: "kokoro-multi-lang-v1_1", speaker_count: 103 }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(status, { model: "kokoro-multi-lang-v1_1", speakerCount: 103 });
});

test("health check rejects a server without the expected model", async () => {
  await assert.rejects(checkCloudTtsServer("https://tts.example.com", async () => new Response(JSON.stringify({ status: "model-not-ready", model: "kokoro-multi-lang-v1_1", speaker_count: 103 }), { status: 200 })), /尚未就绪/);
});


test("device enrollment returns a secure token and revocation sends it as bearer auth", async () => {
  const token = "a-valid-device-token-12345678901234567890";
  const enrolled = await enrollCloudSpeechDevice("https://tts.example.com", "server-enrollment-code", async (url, init) => {
    assert.equal(url, "https://tts.example.com/v1/devices/enroll");
    assert.equal(JSON.parse(init.body).enrollment_code, "server-enrollment-code");
    return new Response(JSON.stringify({ access_token: token, token_type: "bearer" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(enrolled, token);
  await revokeCloudSpeechDevice("https://tts.example.com", token, async (url, init) => {
    assert.equal(url, "https://tts.example.com/v1/devices/revoke");
    assert.equal(init.headers.Authorization, "Bearer " + token);
    return new Response(JSON.stringify({ revoked: true }), { status: 200 });
  });
});
