import type { NovelSource } from "./source";
import { parseHtmlSearchResults } from "./html-source-parser";
import { createSourceHttpClient, type SourceHttpClient } from "./source-runtime";
import type { NovelSearchPage, NovelSummary } from "./novel";

type JsonRecord = Record<string, unknown>;
const TITLE_KEYS = ["title", "name", "bookName", "book_name", "novelName", "novel_name"];
const AUTHOR_KEYS = ["author", "authorName", "author_name", "writer"];
const DESCRIPTION_KEYS = ["description", "desc", "intro", "summary", "content"];
const URL_KEYS = ["url", "bookUrl", "book_url", "link", "detailUrl", "detail_url"];
const COVER_KEYS = ["cover", "coverUrl", "cover_url", "coverImage", "cover_image", "bookCover", "book_cover", "pic", "picUrl", "pic_url", "image", "img", "imgUrl", "img_url", "thumbnail", "thumb"];
const LIST_KEYS = ["data", "list", "books", "results", "items", "records"];

function firstString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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
    const resolved = new URL(value.trim(), responseUrl);
    if ((resolved.protocol !== "https:" && resolved.protocol !== "http:") || resolved.username || resolved.password) return undefined;
    if (resolved.protocol === "http:") resolved.protocol = "https:";
    return resolved.toString();
  } catch {
    return undefined;
  }
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
    const cover = firstString(record, COVER_KEYS);
    items.push({
      id: source.id + ":" + index + ":" + bookUrl, sourceId: source.id, sourceName: source.name,
      title, author, description: firstString(record, DESCRIPTION_KEYS), bookUrl,
      ...(cover ? { coverUrl: resolveCoverImageUrl(cover, responseUrl) } : {}),
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
export async function searchNovelSource(source: NovelSource, keyword: string, client: SourceHttpClient = createSourceHttpClient(source)): Promise<NovelSearchPage> {
  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) throw new Error("请输入小说名称。");
  const response = await client.get("searchUrl", buildSearchRequestUrl(source.searchUrl, cleanKeyword));
  if (/html/i.test(response.contentType) || (!response.body.trim().startsWith("{") && !response.body.trim().startsWith("["))) {
    if (!source.htmlRules?.search) throw new Error("该书源返回 HTML，但没有配置 CSS 搜索规则。");
    return parseHtmlSearchResults(response.body, source.id, source.name, cleanKeyword, response.url, source.htmlRules.search);
  }
  return parseJsonSearchResults(response.body, source, cleanKeyword, response.url);
}
