export type NovelSource = {
  id: string;
  name: string;
  baseUrl: string;
  searchUrl: string;
  bookUrl: string;
  chapterListUrl: string;
  chapterUrl: string;
  enabled: boolean;
  importedAt: number;
};

type SourceInput = {
  name?: unknown;
  baseUrl?: unknown;
  searchUrl?: unknown;
  bookUrl?: unknown;
  chapterListUrl?: unknown;
  chapterUrl?: unknown;
};

function isSafeHttpsUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`字段「${field}」必须是非空网址`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`字段「${field}」不是有效网址`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`字段「${field}」必须使用 HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`字段「${field}」不能在网址中包含账号或密码`);
  }
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".local") ||
      /^(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/.test(parsed.hostname)) {
    throw new Error(`字段「${field}」不能指向本机或局域网地址`);
  }
  return parsed.toString();
}

export function parseNovelSourceJson(raw: string): Omit<NovelSource, "id" | "enabled" | "importedAt"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式错误，请检查逗号、引号和括号。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("书源内容必须是一个 JSON 对象。");
  }
  const input = parsed as SourceInput;
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 40) {
    throw new Error("name 必须是 1–40 个字符的书源名称。");
  }
  return {
    name: input.name.trim(),
    baseUrl: isSafeHttpsUrl(input.baseUrl, "baseUrl"),
    searchUrl: isSafeHttpsUrl(input.searchUrl, "searchUrl"),
    bookUrl: isSafeHttpsUrl(input.bookUrl, "bookUrl"),
    chapterListUrl: isSafeHttpsUrl(input.chapterListUrl, "chapterListUrl"),
    chapterUrl: isSafeHttpsUrl(input.chapterUrl, "chapterUrl"),
  };
}
