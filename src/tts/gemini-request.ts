export const GEMINI_TTS_MODEL_ID = "gemini-3.8-flash-tts";
export const GEMINI_TTS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export const GEMINI_PREBUILT_VOICES = [
  "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe",
  "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir", "Gacrux",
  "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck", "Rasalgethi",
  "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix",
  "Zephyr", "Zubenelgenubi",
] as const;

export function getGeminiVoiceName(speakerId: number): string {
  const index = Math.abs(Math.trunc(speakerId) - 3) % GEMINI_PREBUILT_VOICES.length;
  return GEMINI_PREBUILT_VOICES[index];
}

export interface GeminiTtsPart {
  text: string;
  speakerId: number;
  style?: string;
}

export interface GeminiTtsVoice {
  speakerId: number;
  voice: string;
}

export interface GeminiTtsRequest {
  model: string;
  input: Array<{ type: "user_input"; content: Array<{
    type: "text";
    text: string;
    annotations: Array<{ type: "speech_metadata"; speaker?: string; style?: string }>;
  }> }>;
  response_format: { type: "audio" };
  generation_config: {
    speech_config:
      | Array<{ voice: string }>
      | { speakers: Array<{ speaker: string; voice: string }> };
  };
}


/** Split narration into requests with at most two distinct voices and bounded text size. */
export function groupGeminiTtsParts(parts: GeminiTtsPart[], maxCharacters = 1400): GeminiTtsPart[][] {
  const groups: GeminiTtsPart[][] = [];
  let current: GeminiTtsPart[] = [];
  let speakers = new Set<number>();
  let characters = 0;
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    speakers = new Set<number>();
    characters = 0;
  };
  for (const part of parts) {
    const text = part.text.trim();
    if (!text) continue;
    const addsSpeaker = !speakers.has(part.speakerId);
    if (current.length && ((addsSpeaker && speakers.size >= 2) || characters + text.length > maxCharacters)) flush();
    current.push({ ...part, text });
    speakers.add(part.speakerId);
    characters += text.length;
  }
  flush();
  return groups;
}

export function buildGeminiTtsRequest(
  parts: GeminiTtsPart[],
  voices: GeminiTtsVoice[],
): GeminiTtsRequest {
  const cleanParts = parts.filter((part) => typeof part.text === "string" && part.text.trim());
  if (!cleanParts.length) throw new Error("没有可合成的朗读文本。");
  const voiceMap = new Map<number, string>(voices.map((entry) => [entry.speakerId, entry.voice] as const));
  const speakerIds = [...new Set(cleanParts.map((part) => part.speakerId))];
  if (speakerIds.length > 2) throw new Error("Gemini 单次最多配置两位角色，请先拆分语音片段。");
  const speakerNames = new Map<number, string>(speakerIds.map((id, index) => [id, "Speaker" + (index + 1)] as const));
  const configuredVoices = speakerIds.map((speakerId) => {
    const voice = voiceMap.get(speakerId);
    if (!voice) throw new Error("缺少角色音色配置。");
    return { speakerId, voice };
  });
  const content = cleanParts.map((part) => ({
    type: "text" as const,
    text: part.text.trim(),
    annotations: [{
      type: "speech_metadata" as const,
      ...(speakerIds.length > 1 ? { speaker: speakerNames.get(part.speakerId) } : {}),
      ...(part.style ? { style: part.style } : {}),
    }],
  }));
  return {
    model: GEMINI_TTS_MODEL_ID,
    input: [{ type: "user_input", content }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: speakerIds.length > 1
        ? { speakers: configuredVoices.map(({ speakerId, voice }) => ({
            speaker: speakerNames.get(speakerId) as string,
            voice,
          })) }
        : [{ voice: configuredVoices[0].voice }],
    },
  };
}

export function extractGeminiTtsAudio(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const outputAudio = record.output_audio;
  if (outputAudio && typeof outputAudio === "object") {
    const data = (outputAudio as Record<string, unknown>).data;
    if (typeof data === "string" && data.length > 0) return data;
  }
  if (!Array.isArray(record.steps)) return null;
  for (let stepIndex = record.steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = record.steps[stepIndex];
    if (!step || typeof step !== "object") continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (let partIndex = content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = content[partIndex];
      if (!part || typeof part !== "object") continue;
      const item = part as Record<string, unknown>;
      const data = item.data ?? (item.inlineData && typeof item.inlineData === "object"
        ? (item.inlineData as Record<string, unknown>).data
        : undefined);
      if (item.type === "audio" && typeof data === "string" && data.length > 0) return data;
    }
  }
  return null;
}

export function formatGeminiTtsHttpError(status: number, message = ""): Error {
  if (status === 429) {
    return new Error("Gemini 免费额度已用尽或触发限流（429）。已停止本章后续语音请求，不会自动切换付费接口。");
  }
  if (status === 401 || status === 403) {
    return new Error("Gemini API Key 无效，或当前密钥没有语音生成权限。请检查听书设置。");
  }
  if (status === 400) {
    return new Error("Gemini 拒绝了本次语音请求：" + (message || "请求参数不受支持。"));
  }
  return new Error("Gemini 在线语音请求失败（HTTP " + status + "）：" + (message || "请稍后重试。"));
}
