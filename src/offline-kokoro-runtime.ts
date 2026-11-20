import {
  ModelCategory,
  deleteIncompleteDownload,
  deleteIncompleteExtraction,
  deleteModel,
  downloadModel,
  getIncompleteDownloads,
  getIncompleteExtractions,
  getModelPath,
  isModelDownloaded,
  isPauseError,
  pauseDownload,
  pauseExtraction,
  refreshModels,
  resumeDownload,
  resumeExtraction,
  type Progress,
  type ProgressPhase,
} from "react-native-sherpa-onnx/download";
import { createTTS } from "react-native-sherpa-onnx/tts";
import { encodePcm16Wav } from "./wav-encoder";
import { SPEECH_MODEL } from "./speech-voice-catalog";

export type OfflineKokoroProgress = Pick<
  Progress,
  "phase" | "percent" | "bytesProcessed" | "totalBytes"
>;

export type OfflineKokoroEngine = Awaited<ReturnType<typeof createTTS>>;

const MODEL_ID = SPEECH_MODEL.downloadAssetId;

export async function getOfflineKokoroModel(): Promise<{
  installed: boolean;
  localPath: string | null;
  pendingPhase: ProgressPhase | null;
}> {
  const installed = await isModelDownloaded(ModelCategory.Tts, MODEL_ID);
  const localPath = installed
    ? await getModelPath(ModelCategory.Tts, MODEL_ID)
    : null;
  if (installed && localPath) {
    return { installed: true, localPath, pendingPhase: null };
  }
  const [downloads, extractions] = await Promise.all([
    getIncompleteDownloads(ModelCategory.Tts),
    getIncompleteExtractions(ModelCategory.Tts),
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
  const models = await refreshModels(ModelCategory.Tts);
  const model = models.find((entry) => entry.id === MODEL_ID);
  if (!model) {
    throw new Error("Kokoro 官方模型列表中没有找到预期的 int8 多语言模型。");
  }
  const result = await downloadModel(ModelCategory.Tts, MODEL_ID, {
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
  if (phase === "extracting" || phase === "extracting_resume_skipping") {
    await pauseExtraction(ModelCategory.Tts, MODEL_ID);
  } else {
    await pauseDownload(ModelCategory.Tts, MODEL_ID);
  }
}

export async function resumeOfflineKokoroModel(
  phase: ProgressPhase,
  onProgress?: (progress: OfflineKokoroProgress) => void
): Promise<string> {
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
    ? await resumeExtraction(ModelCategory.Tts, MODEL_ID, options)
    : await resumeDownload(ModelCategory.Tts, MODEL_ID, options);
  return result.localPath;
}

export async function deleteOfflineKokoroModel(): Promise<void> {
  await deleteIncompleteDownload(ModelCategory.Tts, MODEL_ID);
  await deleteIncompleteExtraction(ModelCategory.Tts, MODEL_ID);
  await deleteModel(ModelCategory.Tts, MODEL_ID);
}

export function isOfflineKokoroPause(error: unknown): boolean {
  return isPauseError(error);
}

export async function createOfflineKokoroEngine(
  modelDirectory: string
): Promise<OfflineKokoroEngine> {
  const engine = await createTTS({
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

