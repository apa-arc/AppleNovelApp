import { findSpeechVoice } from "./speech-voice-catalog";
import { normalizeCloudTtsEndpoint } from "./speech-engine";

export type CloudSpeechRequest = {
  voiceId: string;
  text: string;
  speed: number;
};

export async function requestCloudSpeech(
  endpoint: string,
  request: CloudSpeechRequest,
  fetcher: typeof fetch = fetch
): Promise<Uint8Array> {
  const baseUrl = normalizeCloudTtsEndpoint(endpoint);
  if (!baseUrl) throw new Error("AI 语音服务器地址必须是有效的 HTTPS 地址。");
  const voice = findSpeechVoice(request.voiceId);
  if (!voice) throw new Error("所选 AI 音色无效，请重新选择。");
  const text = request.text.trim();
  if (!text) throw new Error("没有可朗读的正文。");
  if (text.length > 420) throw new Error("单次 AI 语音文本不能超过 420 个字符，请先分段。");
  const speed = Number.isFinite(request.speed) ? Math.min(2, Math.max(0.5, request.speed)) : 1;

  let response: Response;
  try {
    response = await fetcher(baseUrl + "/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/wav" },
      body: JSON.stringify({
        model: voice.modelId,
        speaker_id: voice.speakerId,
        text,
        speed,
      }),
    });
  } catch {
    throw new Error("无法连接 AI 语音服务器，请检查网络或服务器地址。");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Ignore non-JSON server error bodies.
    }
    throw new Error(detail || "AI 语音服务器返回错误（" + response.status + "）。");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("audio/wav")) {
    throw new Error("AI 语音服务器返回了非 WAV 音频数据。");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 44 || buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error("AI 语音音频大小异常，已停止播放。");
  }
  return new Uint8Array(buffer);
}


export type CloudSpeechServerStatus = {
  model: string;
  speakerCount: number;
};

export async function checkCloudTtsServer(
  endpoint: string,
  fetcher: typeof fetch = fetch
): Promise<CloudSpeechServerStatus> {
  const baseUrl = normalizeCloudTtsEndpoint(endpoint);
  if (!baseUrl) throw new Error("AI 语音服务器地址必须是有效的 HTTPS 地址。");
  let response: Response;
  try {
    response = await fetcher(baseUrl + "/health", { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("无法连接 AI 语音服务器，请检查网络或服务器地址。");
  }
  if (!response.ok) throw new Error("服务器健康检查失败（" + response.status + "）。");
  let payload: { status?: unknown; model?: unknown; speaker_count?: unknown };
  try {
    payload = await response.json() as { status?: unknown; model?: unknown; speaker_count?: unknown };
  } catch {
    throw new Error("服务器健康检查返回了无效数据。");
  }
  if (payload.status !== "ok" || payload.model !== "kokoro-multi-lang-v1_1" || payload.speaker_count !== 103) {
    throw new Error("服务器已响应，但 Kokoro 模型尚未就绪或版本不匹配。");
  }
  return { model: payload.model, speakerCount: payload.speaker_count };
}
