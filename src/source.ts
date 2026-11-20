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

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) return true;

  if (isPrivateIpv4(host)) return true;
  if (host.includes(":")) {
    // Block IPv6 unspecified/loopback, unique-local, link-local and
    // IPv4-mapped addresses. Public IPv6 literals remain eligible.
    if (
      host === "::" || host === "::1" ||
      /^f[cd]/i.test(host) ||
      /^fe[89ab]/i.test(host) ||
      /^::ffff:/i.test(host)
    ) return true;
  }
  return false;
}

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
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error(`字段「${field}」不能指向本机、局域网或内部地址`);
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
