import * as FileSystem from "expo-file-system/legacy";
import {
  getCoreMlSupport,
} from "react-native-sherpa-onnx";
import {
  ModelCategory,
  configureBackgroundDownloader,
  ensureModel,
  getModelPath,
  refreshModels,
  type Progress,
} from "react-native-sherpa-onnx/download";
import {
  createTTS,
  saveAudioToFile,
  type TtsEngine,
} from "react-native-sherpa-onnx/tts";

export const KOKORO_ZH_MODEL_ID = "kokoro-multi-lang-v1_1";
export const KOKORO_ZH_EXPECTED_SPEAKERS = 103;

export type OfflineTtsProgress = (progress: Progress) => void;

let allowCellularModelDownloads = false;

/** Model downloads are Wi-Fi-only by default because the archive is about 348 MB. */
export function setOfflineTtsCellularDownloadsAllowed(allowed: boolean): void {
  allowCellularModelDownloads = allowed;
  configureBackgroundDownloader({
    allowsCellularAccess: allowCellularModelDownloads,
    showNotificationsEnabled: false,
  });
}

export interface OfflineSpeechOptions {
  speakerId?: number;
  speed?: number;
}

let enginePromise: Promise<TtsEngine> | null = null;
let engineInstance: TtsEngine | null = null;
let activeProvider: "coreml" | "cpu" = "cpu";
let generationQueue: Promise<unknown> = Promise.resolve();

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function modelFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

function nativeFilePath(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

/** Download and extract the Chinese Kokoro multi-speaker model on demand. */
export async function ensureOfflineTtsModel(
  onProgress?: OfflineTtsProgress,
): Promise<string> {
  configureBackgroundDownloader({
    allowsCellularAccess: allowCellularModelDownloads,
    showNotificationsEnabled: false,
  });

  // Reuse an already installed model without depending on network access or
  // the registry cache. This keeps narration fully offline after first setup.
  const installedPath = await getModelPath(ModelCategory.Tts, KOKORO_ZH_MODEL_ID);
  if (installedPath) return installedPath;

  // ensureModel() only looks up IDs in the local model registry. It does not
  // populate that registry itself, so a fresh install otherwise fails with
  // "Unknown model id" before the first model download can even begin.
  await refreshModels(ModelCategory.Tts);

  let result: Awaited<ReturnType<typeof ensureModel>>;
  try {
    result = await ensureModel(ModelCategory.Tts, KOKORO_ZH_MODEL_ID, {
      onProgress,
      verifyChecksum: true,
    });
  } catch (error) {
    // A recently cached catalog may predate Kokoro v1.1. Refresh it once before
    // surfacing an unknown-ID error; do not retry unrelated download failures.
    if (
      !(error instanceof Error) ||
      !error.message.includes(`Unknown model id: ${KOKORO_ZH_MODEL_ID}`)
    ) {
      throw error;
    }
    await refreshModels(ModelCategory.Tts, { forceRefresh: true });
    result = await ensureModel(ModelCategory.Tts, KOKORO_ZH_MODEL_ID, {
      onProgress,
      verifyChecksum: true,
    });
  }

  return result.localPath;
}

/**
 * Initialize one reusable offline engine. Core ML is attempted first on iOS;
 * if this particular model cannot initialize there, CPU is used automatically.
 */
export async function loadOfflineTts(
  onProgress?: OfflineTtsProgress,
): Promise<{ speakerCount: number; provider: "coreml" | "cpu" }> {
  if (engineInstance) {
    return {
      speakerCount: await engineInstance.getNumSpeakers(),
      provider: activeProvider,
    };
  }
  if (!enginePromise) {
    enginePromise = (async () => {
      const modelPath = await ensureOfflineTtsModel(onProgress);
      let provider: "coreml" | "cpu" = "cpu";
      try {
        const support = await getCoreMlSupport();
        if (support.canInit) provider = "coreml";
      } catch {
        provider = "cpu";
      }

      const options = {
        modelPath: { type: "file" as const, path: modelPath },
        modelType: "kokoro" as const,
        provider,
        numThreads: 2,
        debug: false,
        maxNumSentences: 1,
      };

      let engine: TtsEngine;
      try {
        engine = await createTTS(options);
      } catch (error) {
        if (provider !== "coreml") throw error;
        provider = "cpu";
        engine = await createTTS({ ...options, provider: "cpu" });
      }

      const speakerCount = await engine.getNumSpeakers();
      if (speakerCount < KOKORO_ZH_EXPECTED_SPEAKERS) {
        await engine.destroy();
        throw new Error(
          `中文多角色音色模型不完整：预期至少 ${KOKORO_ZH_EXPECTED_SPEAKERS} 个音色，实际检测到 ${speakerCount} 个。`,
        );
      }
      engineInstance = engine;
      activeProvider = provider;
      return engine;
    })().catch((error) => {
      enginePromise = null;
      engineInstance = null;
      throw error;
    });
  }

  const engine = await enginePromise;
  const speakerCount = await engine.getNumSpeakers();
  return { speakerCount, provider: activeProvider };
}

/** Synthesize one narration/dialogue segment and return a playable local WAV URI. */
export async function synthesizeOfflineSegment(
  text: string,
  options: OfflineSpeechOptions = {},
): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("朗读内容不能为空。");
  const speakerId = Number.isInteger(options.speakerId)
    ? Math.min(102, Math.max(3, options.speakerId as number))
    : 3;
  const speed = typeof options.speed === "number"
    ? Math.min(2, Math.max(0.5, options.speed))
    : 1;
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("当前设备无法访问语音缓存目录。");

  const fileName = `novel-tts-${stableHash(`${KOKORO_ZH_MODEL_ID}|${speakerId}|${speed}|${cleanText}`)}.wav`;
  const fileUri = `${cacheDirectory.replace(/\/?$/, "/")}${fileName}`;
  const cached = await FileSystem.getInfoAsync(fileUri);
  if (cached.exists && typeof cached.size === "number" && cached.size > 44) return modelFileUri(fileUri);

  const engine = engineInstance ?? await (async () => {
    await loadOfflineTts();
    if (!engineInstance) throw new Error("离线语音引擎初始化失败。");
    return engineInstance;
  })();

  const temporaryUri = `${fileUri}.partial`;
  const run = generationQueue.then(async () => {
    // Never treat an interrupted/incomplete WAV as a valid cache entry.
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
    const audio = await engine.generateSpeech(cleanText, { sid: speakerId, speed });
    try {
      await saveAudioToFile(audio, nativeFilePath(temporaryUri));
      const generated = await FileSystem.getInfoAsync(temporaryUri);
      if (!generated.exists || typeof generated.size !== "number" || generated.size <= 44) {
        throw new Error("语音文件生成不完整，请重试。");
      }
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      await FileSystem.moveAsync({ from: temporaryUri, to: fileUri });
      return modelFileUri(fileUri);
    } catch (error) {
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
      throw error;
    }
  });
  generationQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** Release native model memory when the reader is closed or the app exits its TTS session. */
export async function unloadOfflineTts(): Promise<void> {
  await generationQueue.catch(() => undefined);
  let engine = engineInstance;
  if (!engine && enginePromise) {
    try {
      engine = await enginePromise;
    } catch {
      // A failed initialization has already released its partial native state.
    }
  }
  engineInstance = null;
  enginePromise = null;
  activeProvider = "cpu";
  if (engine) await engine.destroy();
}
