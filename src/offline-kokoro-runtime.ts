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

type FileSystemApi = typeof import("@dr.pogodin/react-native-fs");

function loadFileSystemApi(): FileSystemApi {
  return require("@dr.pogodin/react-native-fs") as FileSystemApi;
}

async function findModelFile(
  directory: string,
  fileName: string,
  depth = 0
): Promise<string | null> {
  if (depth > 6) return null;
  const entries = await loadFileSystemApi().readDir(directory);
  for (const entry of entries) {
    if (entry.isFile() && entry.name === fileName) return entry.path;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findModelFile(entry.path, fileName, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function findModelDirectory(
  directory: string,
  directoryName: string,
  depth = 0
): Promise<string | null> {
  if (depth > 6) return null;
  const entries = await loadFileSystemApi().readDir(directory);
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === directoryName) return entry.path;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findModelDirectory(entry.path, directoryName, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
async function findKokoroRuleFsts(modelDirectory: string): Promise<string> {
  const names = ["phone-zh.fst", "date-zh.fst", "number-zh.fst"];
  const paths = await Promise.all(names.map((name) => findModelFile(modelDirectory, name)));
  const missing = names.filter((_, index) => !paths[index]);
  if (missing.length > 0) {
    throw new Error("离线模型缺少中文规则文件：" + missing.join("、"));
  }
  return paths.join(",");
}

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
  api.configureBackgroundDownloader({ showNotificationsEnabled: false });
  const disk = await api.checkDiskSpace(Math.max(SPEECH_MODEL.downloadBytes * 3, 450 * 1024 * 1024));
  if (!disk.success) {
    throw new Error(disk.message || "设备可用存储空间不足，无法安装 Kokoro 离线模型。");
  }
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
  api.configureBackgroundDownloader({ showNotificationsEnabled: false });
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
  const ruleFsts = await findKokoroRuleFsts(modelDirectory);
  const [int8Model, chineseLexicon, englishLexicon, dictionaryDirectory] = await Promise.all([
    findModelFile(modelDirectory, "model.int8.onnx"),
    findModelFile(modelDirectory, "lexicon-zh.txt"),
    findModelFile(modelDirectory, "lexicon-us-en.txt"),
    findModelDirectory(modelDirectory, "dict"),
  ]);
  if (!int8Model || !chineseLexicon || !englishLexicon || !dictionaryDirectory) {
    throw new Error(
      "Kokoro 中文模型文件不完整：必须包含 model.int8.onnx、lexicon-zh.txt、lexicon-us-en.txt 和 dict 词典目录。请删除旧模型后重新下载。"
    );
  }
  const api = loadTtsApi();
  const modelPath = { type: "file" as const, path: modelDirectory };
  const detection = await api.detectTtsModel(modelPath, { modelType: "kokoro" });
  if (!detection.success) {
    throw new Error(
      "Kokoro 离线模型结构校验失败：" +
        (detection.error || "Sherpa-ONNX 未识别到有效模型文件。")
    );
  }
  const lexiconLanguages = detection.lexiconLanguageCandidates || [];
  if (!lexiconLanguages.includes("zh") || !lexiconLanguages.includes("us-en")) {
    throw new Error(
      "Kokoro 模型没有同时检测到中文和英文词典（" + lexiconLanguages.join("、") + "），请删除旧模型后重新下载完整模型。"
    );
  }
  const engine = await api.createTTS({
    modelPath,
    modelType: "kokoro",
    provider: "cpu",
    numThreads: 2,
    debug: __DEV__,
    ruleFsts,
    maxNumSentences: 1,
  });
  const [speakers, sampleRate] = await Promise.all([engine.getNumSpeakers(), engine.getSampleRate()]);
  if (speakers !== SPEECH_MODEL.speakerCount || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    await engine.destroy();
    throw new Error(
      "离线模型音色数量不匹配：预期 " +
        SPEECH_MODEL.speakerCount +
        "，实际 " +
        speakers +
        "；采样率 " + sampleRate + " Hz。"
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
  if (!audio || !audio.samples || audio.samples.length === 0 || !Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) {
    throw new Error("Kokoro 原生合成返回空音频（sampleRate=" + (audio?.sampleRate ?? 0) + "，samples=" + (audio?.samples?.length ?? 0) + "）。请检查模型词典和原生推理日志。");
  }
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
