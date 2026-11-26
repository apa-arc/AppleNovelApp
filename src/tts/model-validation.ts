export interface KokoroModelDetection {
  success: boolean;
  error?: string;
  modelType?: string;
  lexiconLanguageCandidates?: string[];
}

/**
 * Reject incomplete or non-Chinese Kokoro bundles before allocating the
 * native inference engine. The multi-language v1.1 model must expose its
 * Chinese lexicon as a detected language candidate.
 */
export function assertKokoroChineseModelValid(detection: KokoroModelDetection): void {
  if (!detection.success) {
    throw new Error(
      detection.error?.trim()
        ? `Kokoro 模型文件不完整：${detection.error.trim()}`
        : "Kokoro 模型文件不完整，缺少初始化所需资源。",
    );
  }

  if (detection.modelType && detection.modelType !== "kokoro") {
    throw new Error(`模型类型不匹配：预期 Kokoro，实际为 ${detection.modelType}。`);
  }

  const languages = detection.lexiconLanguageCandidates ?? [];
  if (!languages.some((language) => language.toLowerCase() === "zh" || language.toLowerCase().startsWith("zh-"))) {
    throw new Error(
      `当前 Kokoro 模型未检测到中文词典（lexicon-zh.txt）。检测到的语言：${languages.join(", ") || "无"}。`,
    );
  }
}
