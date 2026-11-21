import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { encode } from "base64-arraybuffer";

export type CloudAudioPlayback = {
  finished: Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

async function playAudioUri(
  uri: string,
  metadata: { title: string; artist: string },
  deleteWhenFinished: boolean
): Promise<CloudAudioPlayback> {
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
    if (deleteWhenFinished) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
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
    if (deleteWhenFinished) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
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

/** Plays temporary cloud-generated audio and removes it after playback. */
export async function playCloudWav(
  bytes: Uint8Array,
  metadata: { title: string; artist: string }
): Promise<CloudAudioPlayback> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("当前设备无法创建语音缓存文件。");
  const uri = cacheDirectory + "kokoro-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".wav";
  const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await FileSystem.writeAsStringAsync(uri, encode(exactBuffer), { encoding: FileSystem.EncodingType.Base64 });
  return playAudioUri(uri, metadata, true);
}

/** Plays a user-saved WAV file without deleting it after playback. */
export async function playLocalWavFile(
  uri: string,
  metadata: { title: string; artist: string }
): Promise<CloudAudioPlayback> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error("本地离线语音文件不存在，请重新下载本章语音。");
  return playAudioUri(uri, metadata, false);
}
