import * as FileSystem from "expo-file-system/legacy";
import {
  buildGeminiTtsRequest,
  extractGeminiTtsAudio,
  formatGeminiTtsHttpError,
  GEMINI_TTS_ENDPOINT,
  type GeminiTtsPart,
  type GeminiTtsVoice,
} from "./gemini-request";

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

/** Generate one Gemini TTS WAV segment. HTTP 429 is terminal; no paid fallback is attempted. */
export async function synthesizeGeminiTtsBatch(
  parts: GeminiTtsPart[],
  voices: GeminiTtsVoice[],
  apiKey: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) throw new Error("请先在听书设置中配置 Gemini API Key。");
  const request = buildGeminiTtsRequest(parts, voices);
  const voiceKey = voices.map((item) => item.speakerId + ":" + item.voice).sort().join("|");
  const textKey = parts.map((part) => part.speakerId + ":" + part.text).join("\n");
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("当前设备无法访问语音缓存目录。");
  const fileUri = cacheDirectory.replace(/\/?$/, "/") + "gemini-tts-" + hash(voiceKey + "|" + textKey) + ".wav";
  const cached = await FileSystem.getInfoAsync(fileUri);
  if (cached.exists && typeof cached.size === "number" && cached.size > 44) return fileUri;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) throw new Error("听书请求已取消。");
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(GEMINI_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cleanKey,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: unknown = null;
    try { payload = JSON.parse(raw); } catch { /* handled below */ }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && (payload as any).error
        ? String((payload as any).error.message || "")
        : raw.slice(0, 300);
      throw formatGeminiTtsHttpError(response.status, message);
    }
    const audioBase64 = extractGeminiTtsAudio(payload);
    if (!audioBase64) throw new Error("Gemini 已返回响应，但没有可播放的音频数据。");
    await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const generated = await FileSystem.getInfoAsync(fileUri);
    if (!generated.exists || typeof generated.size !== "number" || generated.size <= 44) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
      throw new Error("Gemini 返回的音频文件不完整，请稍后重试。");
    }
    return fileUri;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? "听书请求已取消。" : "Gemini 语音生成超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
