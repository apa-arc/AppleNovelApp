import type { NovelSource } from "./source";
import { parseHtmlSearchResults } from "./html-source-parser";
import { createSourceHttpClient, type SourceHttpClient } from "./source-runtime";
import type { NovelSearchPage, NovelSummary } from "./novel";

type JsonRecord = Record<string, unknown>;
const TITLE_KEYS = ["title", "name", "bookName", "book_name", "novelName", "novel_name"];
const AUTHOR_KEYS = ["author", "authorName", "author_name", "writer"];
const DESCRIPTION_KEYS = ["description", "desc", "intro", "summary", "content"];
const URL_KEYS = ["url", "bookUrl", "book_url", "link", "detailUrl", "detail_url"];
const COVER_KEYS = [
  "cover", "coverUrl", "cover_url", "coverImage", "cover_image", "coverImg", "cover_img",
  "coverImageUrl", "cover_image_url", "coverImgUrl", "cover_img_url", "coverUri", "cover_uri",
  "bookCover", "book_cover", "bookCoverUrl", "book_cover_url", "bookCoverImg", "book_cover_img",
  "bookCoverImage", "book_cover_image", "coverPath", "cover_path", "coverSrc", "cover_src",
  "coverSmall", "cover_small", "coverMedium", "cover_medium", "coverThumb", "cover_thumb",
  "coverPic", "cover_pic", "coverLarge", "cover_large", "coverBig", "cover_big",
  "largeCover", "large_cover", "originalCover", "original_cover",
  "pic", "picUrl", "pic_url", "picURL", "image", "imageUrl", "image_url", "img", "imgUrl",
  "img_url", "imgurl", "imgSrc", "img_src", "thumbnail", "thumb", "thumbUrl", "thumb_url",
  "thumbnailUrl", "thumbnail_url", "poster", "posterUrl", "poster_url", "verticalCover", "vertical_cover",
  "coverImagePath", "cover_image_path", "bookCoverPath", "book_cover_path", "imagePath", "image_path",
  "imgPath", "img_path", "picPath", "pic_path", "coverLink", "cover_link", "originalUrl", "original_url",
  "coverUrlList", "cover_url_list", "imageList", "image_list",
];
const LIST_KEYS = ["data", "list", "books", "results", "items", "records"];
const SEARCH_RESULT_CACHE_TTL_MS = 45_000;
const SEARCH_RESULT_CACHE_MAX_ENTRIES = 120;
type SearchResultCacheEntry = { expiresAt: number; page: NovelSearchPage };
const searchResultCache = new Map<string, SearchResultCacheEntry>();

function getCachedSearchPage(key: string): NovelSearchPage | undefined {
  const entry = searchResultCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    searchResultCache.delete(key);
    return undefined;
  }
  // Return fresh containers so callers cannot mutate the cached page.
  return { ...entry.page, items: entry.page.items.map((item) => ({ ...item })) };
}

function cacheSearchPage(key: string, page: NovelSearchPage): void {
  searchResultCache.delete(key);
  while (searchResultCache.size >= SEARCH_RESULT_CACHE_MAX_ENTRIES) {
    const oldestKey = searchResultCache.keys().next().value;
    if (oldestKey === undefined) break;
    searchResultCache.delete(oldestKey);
  }
  searchResultCache.set(key, {
    expiresAt: Date.now() + SEARCH_RESULT_CACHE_TTL_MS,
    page: { ...page, items: page.items.map((item) => ({ ...item })) },
  });
}


function firstString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as JsonRecord;
      for (const nestedKey of ["url", "src", "original", "large", "path"]) {
        const candidate = nested[nestedKey];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      }
    }
  }
  return "";
}

function findCandidateArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 5 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return value;
    if (value.some((item) => item && typeof item === "object" && !Array.isArray(item))) return value;
    for (const item of value) {
      const found = findCandidateArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as JsonRecord;
  for (const key of LIST_KEYS) {
    if (key in record) {
      const found = findCandidateArray(record[key], depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(record)) {
    const found = findCandidateArray(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function resolvePublicResultUrl(value: string, responseUrl: string): string {
  if (!value.trim()) return "";
  try {
    const resolved = new URL(value, responseUrl);
    if (resolved.protocol !== "https:" || resolved.username || resolved.password) return "";
    return resolved.toString();
  } catch {
    return "";
  }
}

/** Covers may live on a separate CDN or use protocol-relative / legacy HTTP URLs. */
export function resolveCoverImageUrl(value: string, responseUrl: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const clean = value.trim();
    if (/^(data:|blob:|javascript:|about:)/i.test(clean) || /(placeholder|blank|no[-_]?cover|default[-_]?cover|loading|spacer|no[-_]?image)/i.test(clean)) return undefined;
    const resolved = new URL(clean, responseUrl);
    if ((resolved.protocol !== "https:" && resolved.protocol !== "http:") || resolved.username || resolved.password) return undefined;
    if (resolved.protocol === "http:") resolved.protocol = "https:";
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function findCoverUrl(record: JsonRecord, responseUrl: string, depth = 0): string | undefined {
  for (const key of COVER_KEYS) {
    const value = record[key];
    const candidates: unknown[] = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const resolved = resolveCoverImageUrl(candidate, responseUrl);
        if (resolved) return resolved;
      } else if (candidate && typeof candidate === "object") {
        const nested = candidate as JsonRecord;
        for (const nestedKey of ["url", "src", "original", "large", "path", "imageUrl", "image_url", "file", "value", "href", "uri", "srcUrl", "fileUrl", "originalUrl", "thumbnailUrl", "coverUrl"]) {
          const raw = nested[nestedKey];
          if (typeof raw === "string") {
            const resolved = resolveCoverImageUrl(raw, responseUrl);
            if (resolved) return resolved;
          }
        }
      }
    }
  }
  if (depth >= 3) return undefined;
  for (const key of ["book", "bookInfo", "book_info", "info", "data", "detail", "result", "item", "images", "image", "img", "picture", "imageInfo", "image_info", "coverInfo", "cover_info", "picInfo", "pic_info", "media"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const found = findCoverUrl(nested as JsonRecord, responseUrl, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export function parseJsonSearchResults(body: string, source: NovelSource, keyword: string, responseUrl: string): NovelSearchPage {
  let payload: unknown;
  try { payload = JSON.parse(body); }
  catch { throw new Error("该书源返回的不是 JSON。当前搜索引擎暂不解析 HTML 页面。"); }
  const candidates = findCandidateArray(payload);
  if (!candidates) throw new Error("没有在 JSON 响应中找到小说列表数组。");
  const items: NovelSummary[] = [];
  candidates.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const record = candidate as JsonRecord;
    const title = firstString(record, TITLE_KEYS);
    const author = firstString(record, AUTHOR_KEYS) || "未知作者";
    const rawUrl = firstString(record, URL_KEYS);
    const bookUrl = resolvePublicResultUrl(rawUrl, responseUrl);
    if (!title || !bookUrl) return;
    const coverUrl = findCoverUrl(record, responseUrl);
    items.push({
      id: source.id + ":" + index + ":" + bookUrl, sourceId: source.id, sourceName: source.name,
      title, author, description: firstString(record, DESCRIPTION_KEYS), bookUrl,
      ...(coverUrl ? { coverUrl } : {}),
    });
  });
  return { keyword, sourceId: source.id, items, hasMore: false };
}

export function buildSearchRequestUrl(searchUrl: string, keyword: string): string {
  if (searchUrl.includes("{keyword}")) return searchUrl.replace(/\{keyword\}/g, encodeURIComponent(keyword)).replace(/\{page\}/g, "1");
  const url = new URL(searchUrl);
  url.searchParams.set("q", keyword);
  return url.toString();
}

/** JSON-only MVP adapter; it never executes source-provided JavaScript. */
export async function searchNovelSource(source: NovelSource, keyword: string, client: SourceHttpClient = createSourceHttpClient(source, fetch, 8_000), signal?: AbortSignal): Promise<NovelSearchPage> {
  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) throw new Error("请输入小说名称。");
  if (signal?.aborted) throw new Error("搜索已取消。");
  const cacheKey = source.id + "\\u0000" + source.searchUrl + "\\u0000" + cleanKeyword.toLocaleLowerCase();
  const cachedPage = getCachedSearchPage(cacheKey);
  if (cachedPage) return cachedPage;
  const response = await client.get("searchUrl", buildSearchRequestUrl(source.searchUrl, cleanKeyword), signal);
  const isHtml = /html/i.test(response.contentType) || (!response.body.trim().startsWith("{") && !response.body.trim().startsWith("["));
  let page: NovelSearchPage;
  if (isHtml) {
    if (!source.htmlRules?.search) throw new Error("该书源返回 HTML，但没有配置 CSS 搜索规则。");
    const allowedOrigins = [
      ...[source.baseUrl, source.searchUrl, source.bookUrl, source.chapterListUrl, source.chapterUrl]
        .map((value) => new URL(value.replace(/\{[^}]+\}/g, "template")).origin),
      ...(source.allowedDomains || []).map((domain) => new URL("https://" + domain).origin),
    ];
    page = parseHtmlSearchResults(response.body, source.id, source.name, cleanKeyword, response.url, source.htmlRules.search, allowedOrigins);
  } else {
    page = parseJsonSearchResults(response.body, source, cleanKeyword, response.url);
  }
  if (!signal?.aborted) cacheSearchPage(cacheKey, page);
  return page;
}
