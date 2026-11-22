export type SpeechAudioCacheFormat = "wav" | "mp3";

export type SpeechAudioCacheEntry = {
  key: string;
  uri: string;
  format: SpeechAudioCacheFormat;
  bytes: number;
  createdAt: number;
  lastAccessedAt: number;
};

export type SpeechAudioCacheStore = {
  loadIndex: () => Promise<unknown>;
  saveIndex: (entries: SpeechAudioCacheEntry[]) => Promise<void>;
  read: (uri: string) => Promise<Uint8Array>;
  write: (key: string, format: SpeechAudioCacheFormat, bytes: Uint8Array) => Promise<string>;
  remove: (uri: string) => Promise<void>;
};

export type SpeechAudioCacheRequest = {
  bookId: string;
  chapterId: string;
  engine: string;
  model: string;
  voiceId: string;
  speed: number;
  text: string;
};

export function buildSpeechAudioCacheKey(request: SpeechAudioCacheRequest): string {
  const source = [
    request.bookId,
    request.chapterId,
    request.engine,
    request.model,
    request.voiceId,
    request.speed.toFixed(2),
    request.text,
  ].join("\u001f");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return "speech-" + first.toString(36) + second.toString(36);
}

export function normalizeSpeechAudioCacheIndex(value: unknown): SpeechAudioCacheEntry[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter((item): item is SpeechAudioCacheEntry => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<SpeechAudioCacheEntry>;
    return typeof entry.key === "string" && entry.key.length > 0
      && typeof entry.uri === "string" && entry.uri.length > 0
      && (entry.format === "wav" || entry.format === "mp3")
      && typeof entry.bytes === "number" && Number.isFinite(entry.bytes) && entry.bytes > 0
      && typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) && entry.createdAt > 0
      && typeof entry.lastAccessedAt === "number" && Number.isFinite(entry.lastAccessedAt) && entry.lastAccessedAt > 0;
  });
  const unique = new Map<string, SpeechAudioCacheEntry>();
  for (const entry of valid.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)) {
    if (!unique.has(entry.key)) unique.set(entry.key, entry);
  }
  return [...unique.values()];
}

/** A small, serialized LRU cache. Cache failures never need to block speech playback. */
export function createSpeechAudioCache(store: SpeechAudioCacheStore, maxBytes = 128 * 1024 * 1024) {
  let pending: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation, operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };

  const load = async () => normalizeSpeechAudioCacheIndex(await store.loadIndex());
  const save = async (entries: SpeechAudioCacheEntry[]) => store.saveIndex(entries);

  const get = (key: string): Promise<Uint8Array | null> => exclusive(async () => {
    const entries = await load();
    const entry = entries.find((item) => item.key === key);
    if (!entry) return null;
    try {
      const bytes = await store.read(entry.uri);
      if (!bytes.length) throw new Error("Empty speech cache file");
      const updated = { ...entry, lastAccessedAt: Date.now() };
      await save(entries.map((item) => item.key === key ? updated : item));
      return bytes;
    } catch {
      await store.remove(entry.uri).catch(() => undefined);
      await save(entries.filter((item) => item.key !== key));
      return null;
    }
  });

  const put = (key: string, bytes: Uint8Array, format: SpeechAudioCacheFormat): Promise<void> => exclusive(async () => {
    if (!bytes.length) return;
    const uri = await store.write(key, format, bytes);
    const now = Date.now();
    const previous = await load();
    const entries: SpeechAudioCacheEntry[] = [
      { key, uri, format, bytes: bytes.byteLength, createdAt: now, lastAccessedAt: now },
      ...previous.filter((item) => item.key !== key),
    ];
    const removed = previous.find((item) => item.key === key);
    if (removed && removed.uri !== uri) await store.remove(removed.uri).catch(() => undefined);

    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const kept = [...entries];
    while (total > maxBytes && kept.length > 0) {
      const oldest = kept.pop()!;
      total -= oldest.bytes;
      await store.remove(oldest.uri).catch(() => undefined);
    }
    await save(kept);
  });

  const clear = (): Promise<void> => exclusive(async () => {
    const entries = await load();
    await Promise.all(entries.map((entry) => store.remove(entry.uri).catch(() => undefined)));
    await save([]);
  });

  const stats = (): Promise<{ entries: number; bytes: number }> => exclusive(async () => {
    const entries = await load();
    return { entries: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  });

  return { get, put, clear, stats };
}
