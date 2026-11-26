const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

let player;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "expo-audio") {
    return {
      createAudioPlayer: () => player,
      setAudioModeAsync: async () => undefined,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { OfflineAudioPlaybackController } = require("../.test-build/tts/audio-playback.js");

function createPlayer() {
  return {
    listener: null,
    addListener(_event, listener) { this.listener = listener; return { remove() {} }; },
    replace(uri) { this.uri = uri; },
    play() {},
    pause() {},
    updateLockScreenMetadata() {},
    setActiveForLockScreen() {},
    clearLockScreenControls() {},
    remove() {},
    async seekTo() {},
    setPlaybackRate() {},
    emitFinished() {
      this.listener?.({ currentTime: 1, duration: 1, playing: false, didJustFinish: true });
    },
  };
}

const track = (index) => ({
  uri: `file:///track-${index}.wav`,
  bookTitle: "测试小说",
  chapterTitle: "第一章",
  segmentIndex: index,
});

test("marks a streamed queue finished only after the final audio track ends", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  controller.finishQueue();
  assert.equal(controller.getState().finished, false);

  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().finished, true);
  assert.equal(controller.getState().currentIndex, 0);
  controller.destroy();
});

test("waits for more generated tracks, then finishes after the appended final track", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().finished, false);

  controller.append([track(1)]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().currentIndex, 1);
  controller.finishQueue();
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().finished, true);
  controller.destroy();
});


test("does not auto-finish a paused queue until the user resumes", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.pause();
  controller.finishQueue();
  assert.equal(controller.getState().finished, false);

  await controller.resume();
  assert.equal(controller.getState().finished, true);
  controller.destroy();
});
test("ignores repeated terminal status events for the same audio track", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  controller.finishQueue();

  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.getState().currentIndex, 0);
  assert.equal(controller.getState().finished, true);
  controller.destroy();
});
