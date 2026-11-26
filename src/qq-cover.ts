export type QQCoverCacheEntry = {
  coverUrl?: string;
  checkedAt: number;
};

type QQBookRecord = {
  title?: unknown;
  author?: unknown;
  cover?: unknown;
};

const QQ_SEARCH_ENDPOINT = "https://ubook.reader.qq.com/api/search";
const MAX_RESPONSE_LENGTH = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

export function normalizeQQMatchText(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase();
}

export function createQQCoverCacheKey(title: string, author: string): string {
  return normalizeQQMatchText(title) + "::" + normalizeQQMatchText(author);
}

export function isValidQQCoverUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  if (/(placeholder|blank|no[-_]?cover|default[-_]?cover|loading|spacer|no[-_]?image)/i.test(value)) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host.endsWith(".file.myqcloud.com")
      || host === "file.myqcloud.com"
      || host.endsWith(".qpic.cn")
      || host === "qpic.cn"
      || host.endsWith(".gtimg.cn")
      || host === "gtimg.cn";
  } catch {
    return false;
  }
}

/** Only accept a QQ Reading record whose normalized title AND author both match. */
export function findExactQQReadingCover(payload: unknown, title: string, author: string): string | undefined {
  const targetTitle = normalizeQQMatchText(title);
  const targetAuthor = normalizeQQMatchText(author);
  if (!targetTitle || !targetAuthor || targetAuthor === "未知作者") return undefined;

  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : undefined;
  const books = data && Array.isArray(data.books) ? data.books : Array.isArray(root.books) ? root.books : [];

  for (const item of books) {
    if (!item || typeof item !== "object") continue;
    const book = item as QQBookRecord;
    if (typeof book.title !== "string" || typeof book.author !== "string") continue;
    if (normalizeQQMatchText(book.title) !== targetTitle) continue;
    if (normalizeQQMatchText(book.author) !== targetAuthor) continue;
    if (isValidQQCoverUrl(book.cover)) return book.cover;
  }
  return undefined;
}

export async function fetchQQReadingCover(
  title: string,
  author: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!title.trim() || !author.trim() || normalizeQQMatchText(author) === "未知作者") return undefined;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) return undefined;
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = new URL(QQ_SEARCH_ENDPOINT);
    url.searchParams.set("keywords", title.trim());
    url.searchParams.set("pageIndex", "1");
    url.searchParams.set("pageSize", "20");
    const response = await fetcher(url.toString(), {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_LENGTH) return undefined;
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_LENGTH) return undefined;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return undefined; }
    return findExactQQReadingCover(payload, title, author);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
