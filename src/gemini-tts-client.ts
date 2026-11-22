import { decode } from "base64-arraybuffer";

export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const GEMINI_TTS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_TTS_MODEL + ":generateContent";

export type GeminiTTSPart = {
  text: string;
  speaker?: string;
  style?: string;
};

export type GeminiTTSRequest = {
  apiKey: string;
  parts: GeminiTTSPart[];
  voiceName?: string;
  languageCode?: string;
  speakers?: Array<{ name: string; voiceName: string }>;
  signal?: AbortSignal;
};

export type GeminiTTSFetch = typeof fetch;

function safeErrorMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const error = value as { message?: unknown; status?: unknown };
  const message = typeof error.message === "string" ? error.message : "";
  const status = typeof error.status === "string" ? error.status : "";
  return [status, message].filter(Boolean).join("：").slice(0, 300);
}

/** Calls the Gemini Developer API TTS endpoint. The caller supplies a Keychain-stored key. */
export async function synthesizeGeminiTTS(
  request: GeminiTTSRequest,
  fetchImpl: GeminiTTSFetch = fetch
): Promise<Uint8Array> {
  const apiKey = request.apiKey.trim();
  const parts = request.parts.filter((part) => part.text.trim());
  if (!apiKey) throw new Error("请先配置 Gemini API Key。");
  if (!parts.length) throw new Error("朗读文本不能为空。");

  const speakers = request.speakers ?? [];
  if (speakers.length !== 0 && speakers.length !== 2) {
    throw new Error("Gemini 多角色合成每次必须配置恰好两种音色。");
  }
  if (speakers.length === 2) {
    const configured = new Set(speakers.map((speaker) => speaker.name));
    if (configured.size !== 2 || parts.some((part) => !part.speaker || !configured.has(part.speaker))) {
      throw new Error("多角色文本中的每一段都必须指定已配置的两位角色之一。");
    }
  }

  const speechConfig = speakers.length === 2
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakers.map((speaker) => ({
            speaker: speaker.name,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.voiceName } },
          })),
        },
        languageCode: request.languageCode ?? "cmn-CN",
      }
    : {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voiceName ?? "Kore" } },
        languageCode: request.languageCode ?? "cmn-CN",
      };

  const response = await fetchImpl(GEMINI_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: parts.map((part) => ({
          text: part.text,
          ...(part.speaker || part.style
            ? { speechMetadata: {
                ...(part.speaker ? { speaker: part.speaker } : {}),
                ...(part.style ? { style: part.style } : {}),
              } }
            : {}),
        })),
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig,
      },
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    let detail = "";
    try { detail = safeErrorMessage(await response.json()); } catch {
      try { detail = (await response.text()).slice(0, 240); } catch { /* ignore body read errors */ }
    }
    if (response.status === 400) throw new Error("Gemini 请求参数不被接受（HTTP 400）" + (detail ? "：" + detail : "。"));
    if (response.status === 401 || response.status === 403) throw new Error("Gemini API Key 无效、权限不足或模型未开放（HTTP " + response.status + "）。");
    if (response.status === 429) throw new Error("Gemini 免费层请求频率或配额已达到限制；已停止本次请求，不会切换付费服务。");
    if (response.status === 404) throw new Error("Gemini TTS 模型当前不可用或名称已变更（HTTP 404）。");
    throw new Error("Gemini TTS 请求失败（HTTP " + response.status + "）" + (detail ? "：" + detail : "。"));
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const audioPart = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/"));
  const encoded = audioPart?.inlineData?.data;
  if (!encoded) {
    const reason = payload.promptFeedback?.blockReason;
    throw new Error("Gemini 没有返回音频数据" + (reason ? "（" + reason + "）" : "。"));
  }
  const bytes = new Uint8Array(decode(encoded));
  if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF") {
    throw new Error("Gemini 返回的音频不是有效 WAV 文件。");
  }
  return bytes;
}
