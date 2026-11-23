const test = require("node:test");
const assert = require("node:assert/strict");
const { synthesizeOfflineKokoro } = require("../.test-build/offline-kokoro-runtime.js");

function fakeEngine(result) {
  return { generateSpeech: async (_text, _options) => result };
}

test("Kokoro passes the selected speaker and speed to native generation and returns WAV audio", async () => {
  let received;
  const engine = {
    generateSpeech: async (text, options) => {
      received = { text, options };
      return { samples: [0, 0.25, -0.25, 0], sampleRate: 22050 };
    }
  };
  const wav = await synthesizeOfflineKokoro(engine, "  你好。  ", 12, 1.15);
  assert.equal(received.text, "你好。");
  assert.deepEqual(received.options, { sid: 12, speed: 1.15 });
  assert.equal(Buffer.from(wav.slice(0, 4)).toString("ascii"), "RIFF");
  assert.ok(wav.length > 44);
});

test("Kokoro reports an explicit diagnostic when native generation returns empty audio", async () => {
  await assert.rejects(
    synthesizeOfflineKokoro(fakeEngine({ samples: [], sampleRate: 22050 }), "你好", 3, 1),
    /返回空音频/
  );
});

test("Kokoro rejects invalid speaker IDs and oversized chunks before native generation", async () => {
  let called = false;
  const engine = { generateSpeech: async () => { called = true; return { samples: [0], sampleRate: 22050 }; } };
  await assert.rejects(synthesizeOfflineKokoro(engine, "你好", 103, 1), /音色编号无效/);
  await assert.rejects(synthesizeOfflineKokoro(engine, "甲".repeat(421), 1, 1), /不能超过 420/);
  assert.equal(called, false);
});
