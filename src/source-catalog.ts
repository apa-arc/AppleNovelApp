import type { NovelSource } from "./source";
import { parseHtmlNovelDetail, parseHtmlChapterList, parseHtmlChapterContent } from "./html-source-parser";
import { createSourceHttpClient, type SourceHttpClient } from "./source-runtime";
import type { NovelChapter, NovelContent, NovelDetail, NovelSummary } from "./novel";

type JsonRecord = Record<string, unknown>;
const TITLE_KEYS = ["title", "name", "bookName", "book_name", "chapterName", "chapter_name"];
const AUTHOR_KEYS = ["author", "authorName", "author_name", "writer"];
const DESCRIPTION_KEYS = ["description", "desc", "intro", "summary", "bookIntro"];
const URL_KEYS = ["url", "chapterUrl", "chapter_url", "link", "href"];
const CHAPTER_ID_KEYS = ["chapter_id", "chapterId", "id"];
const LIST_KEYS = ["data", "list", "chapters", "chapterList", "chapter_list", "results", "items", "records"];
const CONTENT_KEYS = ["content", "chapterContent", "chapter_content", "text", "body"];

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("该书源返回的不是 JSON，当前版本暂不解析 HTML 页面。");
  }
}

function firstString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function findRecord(value: unknown, depth = 0): JsonRecord | null {
  if (depth > 6 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  if (firstString(record, TITLE_KEYS) || firstString(record, DESCRIPTION_KEYS)) return record;
  for (const child of Object.values(record)) {
    const found = findRecord(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function findContentRecord(value: unknown, depth = 0): JsonRecord | null {
  if (depth > 6 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  if (firstString(record, CONTENT_KEYS)) return record;
  for (const child of Object.values(record)) {
    const found = findContentRecord(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function findChapterArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 6 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object" && !Array.isArray(item) &&
      firstString(item as JsonRecord, TITLE_KEYS) &&
      (firstString(item as JsonRecord, URL_KEYS) || firstString(item as JsonRecord, CHAPTER_ID_KEYS)))) return value;
    for (const item of value) {
      const found = findChapterArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as JsonRecord;
  for (const key of LIST_KEYS) {
    if (key in record) {
      const found = findChapterArray(record[key], depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(record)) {
    const found = findChapterArray(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function resolveHttpsUrl(value: string, responseUrl: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value, responseUrl);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function replaceTemplate(template: string, values: Record<string, string>): string | null {
  let output = template;
  let replaced = false;
  for (const [key, value] of Object.entries(values)) {
    const token = "{" + key + "}";
    if (!output.includes(token)) continue;
    // Search results already contain absolute HTTPS URLs. Do not percent-encode
    // an entire URL into a path; pass it through so the bounded HTTP client can
    // validate its origin against the source's configured endpoints.
    const tokenIndex = output.indexOf(token);
    const prefix = output.slice(0, tokenIndex);
    const suffix = output.slice(tokenIndex + token.length);
    const absoluteUrlAsTarget = /^https:\/\//i.test(value) &&
      /^https:\/\/[^/]+\/?$/i.test(prefix) && suffix.length === 0;
    const replacement = absoluteUrlAsTarget
      ? value
      : key === "bookPath"
        ? value.split("/").map(encodeURIComponent).join("/")
        : encodeURIComponent(value);
    output = absoluteUrlAsTarget ? replacement : output.split(token).join(replacement);
    replaced = true;
  }
  return replaced ? output : null;
}

export function parseJsonNovelDetail(body: string, summary: NovelSummary): NovelDetail {
  const record = findRecord(parseJson(body));
  if (!record) throw new Error("没有在 JSON 响应中找到小说详情。");
  const description = firstString(record, DESCRIPTION_KEYS) || summary.description;
  return {
    ...summary,
    title: firstString(record, TITLE_KEYS) || summary.title,
    author: firstString(record, AUTHOR_KEYS) || summary.author,
    description,
    chapters: [],
  };
}

export function parseJsonChapterList(
  body: string,
  novelId: string,
  responseUrl: string,
  source?: NovelSource,
  summary?: NovelSummary
): NovelChapter[] {
  const candidates = findChapterArray(parseJson(body));
  if (!candidates) throw new Error("没有在 JSON 响应中找到章节列表。");
  const bookPathSegments = summary ? new URL(summary.bookUrl).pathname.split("/").filter(Boolean) : [];
  const bookId = bookPathSegments[bookPathSegments.length - 1] || "";
  const chapters: NovelChapter[] = [];
  candidates.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as JsonRecord;
    const title = firstString(record, TITLE_KEYS);
    let url = resolveHttpsUrl(firstString(record, URL_KEYS), responseUrl);
    // JSON catalogues may expose chapter_id instead of a URL. Build the
    // endpoint only from the source's explicit {bookId}/{chapterId} template.
    if (!url && source && bookId) {
      const chapterId = firstString(record, CHAPTER_ID_KEYS);
      if (chapterId && source.chapterUrl.includes("{chapterId}")) {
        const templated = replaceTemplate(source.chapterUrl, { bookId, chapterId });
        if (templated) url = resolveHttpsUrl(templated, responseUrl);
      }
    }
    if (!title || !url) return;
    chapters.push({ id: novelId + ":" + index + ":" + url, novelId, title, url, index: chapters.length });
  });
  if (chapters.length === 0) throw new Error("章节列表中没有可用的 HTTPS 章节链接。");
  return chapters;
}

export function parseJsonChapterContent(body: string, fallbackTitle: string): NovelContent {
  const payload = parseJson(body);
  const record = findContentRecord(payload);
  if (!record) throw new Error("没有在 JSON 响应中找到章节正文。");
  const content = firstString(record, CONTENT_KEYS);
  if (!content) throw new Error("书源返回的数据中没有可识别的正文文本。");
  return { chapterId: "", title: firstString(record, TITLE_KEYS) || fallbackTitle, content };
}

export async function fetchNovelDetail(
  source: NovelSource,
  summary: NovelSummary,
  client: SourceHttpClient = createSourceHttpClient(source)
): Promise<NovelDetail> {
  const bookPathSegments = new URL(summary.bookUrl).pathname.split("/").filter(Boolean);
  const bookPathId = bookPathSegments[bookPathSegments.length - 1] || summary.id;
  const bookPath = bookPathId.includes("_") ? bookPathId.split("_").join("/") : bookPathSegments.join("/");
  const templated = replaceTemplate(source.bookUrl, {
    bookUrl: summary.bookUrl, book: summary.bookUrl, url: summary.bookUrl, bookId: bookPathId, bookPath
  });
  const response = await client.get("bookUrl", templated || summary.bookUrl);
  if (/html/i.test(response.contentType) || (!response.body.trim().startsWith("{") && !response.body.trim().startsWith("["))) {
    // Detail pages often expose a standard og:image even when no custom
    // CSS detail rules are configured. Always parse metadata as a cover fallback.
    return parseHtmlNovelDetail(response.body, summary, source.htmlRules?.detail || {});
  }
  return parseJsonNovelDetail(response.body, summary);
}

export async function fetchNovelChapterList(
  source: NovelSource,
  summary: NovelSummary,
  client: SourceHttpClient = createSourceHttpClient(source)
): Promise<NovelChapter[]> {
  const bookPathSegments = new URL(summary.bookUrl).pathname.split("/").filter(Boolean);
  const bookPathId = bookPathSegments[bookPathSegments.length - 1] || summary.id;
  // Some mobile novel sites encode their catalogue path as /7_7116/ while
  // exposing the TOC at /html/7/7116/index.html.
  const bookPath = bookPathId.includes("_") ? bookPathId.split("_").join("/") : bookPathSegments.join("/");
  const templated = replaceTemplate(source.chapterListUrl, {
    bookUrl: summary.bookUrl, book: summary.bookUrl, url: summary.bookUrl, bookId: bookPathId, bookPath
  });
  const response = await client.get("chapterListUrl", templated || source.chapterListUrl);
  if (/html/i.test(response.contentType) || (!response.body.trim().startsWith("{") && !response.body.trim().startsWith("["))) {
    if (!source.htmlRules?.chapters) throw new Error("该书源目录返回 HTML，但未配置 CSS 章节规则。");
    const allowedOrigins = [
      ...[source.baseUrl, source.searchUrl, source.bookUrl, source.chapterListUrl, source.chapterUrl]
        .map((value) => new URL(value.replace(/\{[^}]+\}/g, "template")).origin),
      ...(source.allowedDomains || []).map((domain) => new URL("https://" + domain).origin),
    ];
    return parseHtmlChapterList(response.body, summary.id, response.url, source.htmlRules.chapters, allowedOrigins);
  }
  return parseJsonChapterList(response.body, summary.id, response.url, source, summary);
}

export async function fetchNovelChapterContent(
  source: NovelSource,
  chapter: NovelChapter,
  client: SourceHttpClient = createSourceHttpClient(source)
): Promise<NovelContent> {
  const chapterPathSegments = new URL(chapter.url).pathname.split("/").filter(Boolean);
  const chapterPathId = chapterPathSegments[chapterPathSegments.length - 1] || chapter.id;
  const chaptersSegmentIndex = chapterPathSegments.lastIndexOf("chapters");
  const chapterBookId = chaptersSegmentIndex > 0 ? chapterPathSegments[chaptersSegmentIndex - 1] : "";
  const templated = replaceTemplate(source.chapterUrl, {
    chapterUrl: chapter.url, url: chapter.url, chapterId: chapterPathId, bookId: chapterBookId
  });
  const response = await client.get("chapterUrl", templated || chapter.url);
  if (/html/i.test(response.contentType) || (!response.body.trim().startsWith("{") && !response.body.trim().startsWith("["))) {
    if (!source.htmlRules?.content) throw new Error("该书源正文返回 HTML，但未配置 CSS 正文规则。");
    const htmlContent = parseHtmlChapterContent(response.body, chapter.title, source.htmlRules.content);
    return { ...htmlContent, chapterId: chapter.id };
  }
  const content = parseJsonChapterContent(response.body, chapter.title);
  return { ...content, chapterId: chapter.id };
}
