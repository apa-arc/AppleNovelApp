export type FishAudioVoiceReference = string | string[];

export type FishAudioRequest = {
  text: string;
  apiKey: string;
  referenceId?: FishAudioVoiceReference;
  signal?: AbortSignal;
};

export type FishAudioFetch = typeof fetch;

/**
 * Calls Fish Audio's hosted S2.1 Pro Free endpoint.
 * The API key is supplied at runtime and must never be committed or logged.
 */
export async function synthesizeFishAudio(
  request: FishAudioRequest,
  fetchImpl: FishAudioFetch = fetch
): Promise<Uint8Array> {
  const apiKey = request.apiKey.trim();
  const text = request.text.trim();
  if (!apiKey) throw new Error("请先配置 Fish Audio API Key。");
  if (!text) throw new Error("朗读文本不能为空。");

  const response = await fetchImpl("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({
      text,
      ...(request.referenceId ? { reference_id: request.referenceId } : {}),
      format: "mp3",
      mp3_bitrate: 128,
      normalize: true,
      condition_on_previous_chunks: true,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    if (response.status === 401) throw new Error("Fish Audio API Key 无效或已失效。");
    if (response.status === 402) throw new Error("Fish Audio 当前账号无法使用该模型，未进行付费模型回退。");
    if (response.status === 429) throw new Error("Fish Audio 请求过于频繁，请稍后重试。");
    throw new Error("Fish Audio 合成失败（HTTP " + response.status + "）" + (detail ? "：" + detail.slice(0, 240) : "。"));
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Fish Audio 返回了空音频。");
  return bytes;
}
