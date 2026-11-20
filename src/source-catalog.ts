import type { NovelSource } from "./source";
import { createSourceHttpClient, type SourceHttpClient } from "./source-runtime";
import type { NovelChapter, NovelContent, NovelDetail, NovelSummary } from "./novel";

type JsonRecord = Record<string, unknown>;
const TITLE_KEYS = ["title", "name", "bookName", "book_name", "chapterName", "chapter_name"];
const AUTHOR_KEYS = ["author", "authorName", "author_name", "writer"];
const DESCRIPTION_KEYS = ["description", "desc", "intro", "summary", "bookIntro"];
const URL_KEYS = ["url", "chapterUrl", "chapter_url", "link", "href"];
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
      firstString(item as JsonRecord, TITLE_KEYS) && firstString(item as JsonRecord, URL_KEYS))) return value;
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
    if (output.includes(token)) {
      output = output.split(token).join(encodeURIComponent(value));
      replaced = true;
    }
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

export function parseJsonChapterList(body: string, novelId: string, responseUrl: string): NovelChapter[] {
  const candidates = findChapterArray(parseJson(body));
  if (!candidates) throw new Error("没有在 JSON 响应中找到章节列表。");
  const chapters: NovelChapter[] = [];
  candidates.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as JsonRecord;
    const title = firstString(record, TITLE_KEYS);
    const url = resolveHttpsUrl(firstString(record, URL_KEYS), responseUrl);
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
  const response = await client.get("bookUrl", summary.bookUrl);
  return parseJsonNovelDetail(response.body, summary);
}

export async function fetchNovelChapterList(
  source: NovelSource,
  summary: NovelSummary,
  client: SourceHttpClient = createSourceHttpClient(source)
): Promise<NovelChapter[]> {
  const templated = replaceTemplate(source.chapterListUrl, { bookUrl: summary.bookUrl, book: summary.bookUrl });
  const response = await client.get("chapterListUrl", templated || source.chapterListUrl);
  return parseJsonChapterList(response.body, summary.id, response.url);
}

export async function fetchNovelChapterContent(
  source: NovelSource,
  chapter: NovelChapter,
  client: SourceHttpClient = createSourceHttpClient(source)
): Promise<NovelContent> {
  const templated = replaceTemplate(source.chapterUrl, { chapterUrl: chapter.url, url: chapter.url });
  const response = await client.get("chapterUrl", templated || chapter.url);
  const content = parseJsonChapterContent(response.body, chapter.title);
  return { ...content, chapterId: chapter.id };
}
