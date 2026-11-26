const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

let player;
let audioMode;
let audioModeGate = null;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "expo-audio") {
    return {
      createAudioPlayer: () => player,
      setAudioModeAsync: async (mode) => {
        audioMode = mode;
        if (audioModeGate) await audioModeGate;
      },
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
    setActiveForLockScreen(active, metadata, controls) { this.lockScreen = { active, metadata, controls }; },
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


test("enables background playback and lock-screen media controls", async () => {
  player = createPlayer();
  audioMode = undefined;
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  assert.equal(audioMode.playsInSilentMode, true);
  assert.equal(audioMode.shouldPlayInBackground, true);
  assert.equal(audioMode.interruptionMode, "doNotMix");
  assert.equal(player.lockScreen.active, true);
  assert.equal(player.lockScreen.metadata.title, "第一章");
  assert.equal(player.lockScreen.controls.showSeekBackward, true);
  assert.equal(player.lockScreen.controls.showSeekForward, true);
  controller.destroy();
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


test("does not advance to the next TTS segment when pause races with track completion", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0), { ...track(1), chapterTitle: "第二章" }]);
  await controller.pause();
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().currentIndex, 0);
  assert.equal(controller.getState().playing, false);

  await controller.resume();
  assert.equal(controller.getState().currentIndex, 1);
  assert.equal(controller.getState().playing, true);
  controller.destroy();
});


test("handles a native terminal callback emitted synchronously by pause", async () => {
  player = createPlayer();
  player.pause = function() {
    this.listener?.({ currentTime: 1, duration: 1, playing: false, didJustFinish: true });
  };
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0), { ...track(1), chapterTitle: "第二章" }]);
  await controller.pause();
  assert.equal(controller.getState().currentIndex, 0);
  assert.equal(controller.getState().playing, false);
  await controller.resume();
  assert.equal(controller.getState().currentIndex, 1);
  assert.equal(controller.getState().playing, true);
  controller.destroy();
});


test("does not restart or advance a track when clearing synchronously finishes native playback", async () => {
  player = createPlayer();
  player.pause = function() {
    this.listener?.({ currentTime: 1, duration: 1, playing: false, didJustFinish: true });
  };
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0), { ...track(1), chapterTitle: "第二章" }]);
  controller.clearQueue();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().trackCount, 0);
  assert.equal(controller.getState().currentIndex, -1);
  assert.equal(controller.getState().playing, false);
  assert.equal(controller.getState().finished, false);
  controller.destroy();
});


test("reopens a completed queue when a late TTS batch is appended", async () => {
  player = createPlayer();
  const controller = new OfflineAudioPlaybackController();
  await controller.start([track(0)]);
  controller.finishQueue();
  player.emitFinished();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().finished, true);

  controller.append([{ ...track(1), chapterTitle: "补充片段" }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().currentIndex, 1);
  assert.equal(controller.getState().chapterTitle, "补充片段");
  assert.equal(controller.getState().playing, true);
  assert.equal(controller.getState().finished, false);
  controller.destroy();
});


test("does not resurrect playback when stop occurs during iOS audio-session setup", async () => {
  player = createPlayer();
  let releaseAudioMode;
  audioModeGate = new Promise((resolve) => { releaseAudioMode = resolve; });
  const controller = new OfflineAudioPlaybackController();
  const starting = controller.start([track(0)]);
  controller.clearQueue();
  releaseAudioMode();
  await starting;
  audioModeGate = null;

  assert.equal(controller.getState().trackCount, 0);
  assert.equal(controller.getState().currentIndex, -1);
  assert.equal(controller.getState().playing, false);
  assert.equal(player.uri, undefined);
  controller.destroy();
});
