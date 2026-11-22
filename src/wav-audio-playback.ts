import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { encode } from "base64-arraybuffer";

export type SpeechAudioFormat = "wav" | "mp3";

export type WavAudioPlayback = {
  finished: Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type SpeechAudioPlayback = WavAudioPlayback;

/** Play provider-produced audio bytes while keeping background and lock-screen controls. */
export async function playSpeechAudio(
  bytes: Uint8Array,
  format: SpeechAudioFormat,
  metadata: { title: string; artist: string }
): Promise<SpeechAudioPlayback> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("当前设备无法创建语音缓存文件。");
  const uri = cacheDirectory + "speech-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + format;
  const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await FileSystem.writeAsStringAsync(uri, encode(exactBuffer), { encoding: FileSystem.EncodingType.Base64 });

  let player: ReturnType<typeof createAudioPlayer> | null = null;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    player = createAudioPlayer({ uri }, { updateInterval: 250, keepAudioSessionActive: true });
    player.setActiveForLockScreen(true, {
      title: metadata.title,
      artist: metadata.artist,
      albumTitle: "私人小说",
    });
  } catch (error) {
    player?.clearLockScreenControls();
    player?.remove();
    player = null;
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }

  let resolveFinished: (() => void) | null = null;
  let settled = false;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    subscription.remove();
    player?.clearLockScreenControls();
    player?.remove();
    player = null;
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    resolveFinished?.();
  };
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) finish();
  });
  player.play();

  return {
    finished,
    pause: () => player?.pause(),
    resume: () => player?.play(),
    stop: finish,
  };
}

/** Backward-compatible WAV entry point for the existing Kokoro engine. */
export function playWavAudio(
  bytes: Uint8Array,
  metadata: { title: string; artist: string }
): Promise<WavAudioPlayback> {
  return playSpeechAudio(bytes, "wav", metadata);
}
