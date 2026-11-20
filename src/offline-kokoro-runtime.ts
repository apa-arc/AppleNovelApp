import { encodePcm16Wav } from "./wav-encoder";
import { SPEECH_MODEL } from "./speech-voice-catalog";

type DownloadApi = typeof import("react-native-sherpa-onnx/download");
type TtsApi = typeof import("react-native-sherpa-onnx/tts");
type Progress = import("react-native-sherpa-onnx/download").Progress;
type ProgressPhase = import("react-native-sherpa-onnx/download").ProgressPhase;

function loadDownloadApi(): DownloadApi {
  return require("react-native-sherpa-onnx/download") as DownloadApi;
}

function loadTtsApi(): TtsApi {
  return require("react-native-sherpa-onnx/tts") as TtsApi;
}

export type OfflineKokoroProgress = Pick<
  Progress,
  "phase" | "percent" | "bytesProcessed" | "totalBytes"
>;

export type OfflineKokoroEngine = Awaited<ReturnType<TtsApi["createTTS"]>>;

const MODEL_ID = SPEECH_MODEL.downloadAssetId;

export async function getOfflineKokoroModel(): Promise<{
  installed: boolean;
  localPath: string | null;
  pendingPhase: ProgressPhase | null;
}> {
  const api = loadDownloadApi();
  const category = api.ModelCategory.Tts;
  const installed = await api.isModelDownloaded(category, MODEL_ID);
  const localPath = installed
    ? await api.getModelPath(category, MODEL_ID)
    : null;
  if (installed && localPath) {
    return { installed: true, localPath, pendingPhase: null };
  }
  const [downloads, extractions] = await Promise.all([
    api.getIncompleteDownloads(category),
    api.getIncompleteExtractions(category),
  ]);
  const extraction = extractions.find((entry) => entry.modelId === MODEL_ID);
  if (extraction) {
    return { installed: false, localPath: null, pendingPhase: "extracting" };
  }
  const download = downloads.find((entry) => entry.modelId === MODEL_ID);
  return {
    installed: false,
    localPath: null,
    pendingPhase: download?.phase ?? null,
  };
}

/** Starts only after the UI has obtained explicit user confirmation. */
export async function downloadOfflineKokoroModel(
  onProgress?: (progress: OfflineKokoroProgress) => void
): Promise<string> {
  const api = loadDownloadApi();
  const category = api.ModelCategory.Tts;
  const models = await api.refreshModels(category);
  const model = models.find((entry) => entry.id === MODEL_ID);
  if (!model) {
    throw new Error("Kokoro 官方模型列表中没有找到预期的 int8 多语言模型。");
  }
  const result = await api.downloadModel(category, MODEL_ID, {
    verifyChecksum: true,
    deleteArchiveAfterExtract: true,
    onProgress: (progress) => onProgress?.({
      phase: progress.phase,
      percent: Math.max(0, Math.min(100, progress.percent)),
      bytesProcessed: progress.bytesProcessed,
      totalBytes: progress.totalBytes,
    }),
  });
  return result.localPath;
}

export async function pauseOfflineKokoroModel(phase: ProgressPhase): Promise<void> {
  const api = loadDownloadApi();
  const category = api.ModelCategory.Tts;
  if (phase === "extracting" || phase === "extracting_resume_skipping") {
    await api.pauseExtraction(category, MODEL_ID);
  } else {
    await api.pauseDownload(category, MODEL_ID);
  }
}

export async function resumeOfflineKokoroModel(
  phase: ProgressPhase,
  onProgress?: (progress: OfflineKokoroProgress) => void
): Promise<string> {
  const api = loadDownloadApi();
  const category = api.ModelCategory.Tts;
  const options = {
    verifyChecksum: true,
    deleteArchiveAfterExtract: true,
    onProgress: (progress: Progress) => onProgress?.({
      phase: progress.phase,
      percent: Math.max(0, Math.min(100, progress.percent)),
      bytesProcessed: progress.bytesProcessed,
      totalBytes: progress.totalBytes,
    }),
  };
  const result = phase === "extracting" || phase === "extracting_resume_skipping"
    ? await api.resumeExtraction(category, MODEL_ID, options)
    : await api.resumeDownload(category, MODEL_ID, options);
  return result.localPath;
}

export async function deleteOfflineKokoroModel(): Promise<void> {
  const api = loadDownloadApi();
  const category = api.ModelCategory.Tts;
  await api.deleteIncompleteDownload(category, MODEL_ID);
  await api.deleteIncompleteExtraction(category, MODEL_ID);
  await api.deleteModel(category, MODEL_ID);
}

export function isOfflineKokoroPause(error: unknown): boolean {
  return error instanceof Error && error.name === "PauseError";
}

export async function createOfflineKokoroEngine(
  modelDirectory: string
): Promise<OfflineKokoroEngine> {
  const engine = await loadTtsApi().createTTS({
    modelPath: { type: "file", path: modelDirectory },
    modelType: "kokoro",
    provider: "cpu",
    numThreads: 2,
    ruleFsts: [
      modelDirectory + "/phone-zh.fst",
      modelDirectory + "/date-zh.fst",
      modelDirectory + "/number-zh.fst",
    ].join(","),
    maxNumSentences: 1,
  });
  const speakers = await engine.getNumSpeakers();
  if (speakers !== SPEECH_MODEL.speakerCount) {
    await engine.destroy();
    throw new Error(
      "离线模型音色数量不匹配：预期 " +
        SPEECH_MODEL.speakerCount +
        "，实际 " +
        speakers +
        "。"
    );
  }
  return engine;
}

export async function synthesizeOfflineKokoro(
  engine: OfflineKokoroEngine,
  text: string,
  speakerId: number,
  speed: number
): Promise<Uint8Array> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("没有可朗读的正文。");
  if (cleanText.length > 420) throw new Error("单次离线朗读不能超过 420 个字符，请先分段。");
  if (!Number.isInteger(speakerId) || speakerId < 0 || speakerId >= SPEECH_MODEL.speakerCount) {
    throw new Error("所选 Kokoro 音色编号无效。");
  }
  const audio = await engine.generateSpeech(cleanText, {
    sid: speakerId,
    speed: Number.isFinite(speed) ? Math.max(0.5, Math.min(2, speed)) : 1,
  });
  return encodePcm16Wav(audio.samples, audio.sampleRate);
}



/** Verifies the native TurboModule bridge before enabling local model downloads. */
export async function verifyOfflineKokoroNativeModule(): Promise<string> {
  const nativeApi = require("react-native-sherpa-onnx") as { testSherpaInit: () => Promise<string> };
  const result = await nativeApi.testSherpaInit();
  if (result !== "Sherpa ONNX loaded!") {
    throw new Error("SherpaOnnx 原生模块未能完成初始化。");
  }
  return result;
}
