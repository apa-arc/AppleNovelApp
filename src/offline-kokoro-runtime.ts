import {
  ModelCategory,
  ensureModel,
  getModelPath,
  isModelDownloaded,
  refreshModels,
  type Progress,
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
}> {
  const installed = await isModelDownloaded(ModelCategory.Tts, MODEL_ID);
  const localPath = installed
    ? await getModelPath(ModelCategory.Tts, MODEL_ID)
    : null;
  return { installed: installed && Boolean(localPath), localPath };
}

/**
 * Download and extract the exact Kokoro int8 multilingual release asset.
 * Call this only after an explicit user confirmation in the UI.
 */
export async function downloadOfflineKokoroModel(
  onProgress?: (progress: OfflineKokoroProgress) => void
): Promise<string> {
  const models = await refreshModels(ModelCategory.Tts);
  const model = models.find((entry) => entry.id === MODEL_ID);
  if (!model) {
    throw new Error("Kokoro 官方模型列表中没有找到预期的 int8 多语言模型。");
  }
  const result = await ensureModel(ModelCategory.Tts, MODEL_ID, {
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

