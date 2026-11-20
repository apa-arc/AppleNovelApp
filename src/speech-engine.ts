export type SpeechEngineMode = "hybrid" | "offline" | "cloud";
export type SpeechEngineKind = "offline" | "cloud";

export type SpeechEngineAvailability = {
  offlineReady: boolean;
  cloudReady: boolean;
  online: boolean;
};

export type SpeechEngineSelection =
  | { engine: SpeechEngineKind; reason: "cloud-preferred" | "offline-fallback" | "offline-only" | "cloud-only" }
  | { engine: null; reason: "offline-not-ready" | "cloud-not-ready" | "no-engine-ready" };

/**
 * Hybrid mode prefers cloud synthesis when it is configured and reachable,
 * then falls back to the downloaded on-device model. No device accessibility
 * or OS screen-reader setting is involved in this routing decision.
 */
export function selectSpeechEngine(
  mode: SpeechEngineMode,
  availability: SpeechEngineAvailability
): SpeechEngineSelection {
  if (mode === "offline") {
    return availability.offlineReady
      ? { engine: "offline", reason: "offline-only" }
      : { engine: null, reason: "offline-not-ready" };
  }

  if (mode === "cloud") {
    return availability.online && availability.cloudReady
      ? { engine: "cloud", reason: "cloud-only" }
      : { engine: null, reason: "cloud-not-ready" };
  }

  if (availability.online && availability.cloudReady) {
    return { engine: "cloud", reason: "cloud-preferred" };
  }
  if (availability.offlineReady) {
    return { engine: "offline", reason: "offline-fallback" };
  }
  return { engine: null, reason: "no-engine-ready" };
}

/** Split long chapters at natural boundaries to avoid oversized TTS requests. */
export function splitSpeechText(value: string, maxLength = 420): string[] {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const limit = Number.isFinite(maxLength) ? Math.max(80, Math.floor(maxLength)) : 420;
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [text];
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const normalized = current.trim();
    if (normalized) chunks.push(normalized);
    current = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      push();
      for (let offset = 0; offset < sentence.length; offset += limit) {
        const part = sentence.slice(offset, offset + limit).trim();
        if (part) chunks.push(part);
      }
      continue;
    }
    if (current && current.length + sentence.length > limit) push();
    current += sentence;
  }
  push();
  return chunks;
}

/** Only HTTPS endpoints without embedded credentials are accepted for cloud TTS. */
export function normalizeCloudTtsEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    if (url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
