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
  htmlRules?: HtmlSourceRules;
  /** Additional public HTTPS hostnames explicitly trusted by a source subscription. */
  allowedDomains?: string[];
  subscriptionGroup?: "normal" | "adult";
  subscriptionId?: string;
  remoteSourceId?: string;
  remoteVersion?: string;
  healthStatus?: "success" | "failed";
  healthLevel?: "完全可用" | "部分可用" | "不可用";
  healthCheckedAt?: number;
  healthStages?: {
    connection: { ok: boolean; message: string };
    search: { ok: boolean; message: string };
    detail: { ok: boolean; message: string };
    chapters: { ok: boolean; message: string };
    content: { ok: boolean; message: string };
  };
  healthMessage?: string;
  /** Built-in offline fixture; never imported from untrusted source JSON. */
  isBuiltinMock?: boolean;
};

export type HtmlSourceRules = {
  search?: { itemSelector:string; titleSelector:string; urlSelector:string; authorSelector?:string; descriptionSelector?:string; titleAttribute?:string; authorAttribute?:string; descriptionAttribute?:string; urlAttribute?:string; coverSelector?:string; coverAttribute?:string };
  detail?: { titleSelector?:string; authorSelector?:string; descriptionSelector?:string; coverSelector?:string; coverAttribute?:string; titleAttribute?:string; authorAttribute?:string; descriptionAttribute?:string };
  chapters?: { itemSelector:string; titleSelector:string; urlSelector:string; titleAttribute?:string; urlAttribute?:string };
  content?: { contentSelector:string; titleSelector?:string };
};

type SourceInput = {
  htmlRules?: unknown;
  allowedDomains?: unknown;
  name?: unknown;
  baseUrl?: unknown;
  searchUrl?: unknown;
  bookUrl?: unknown;
  chapterListUrl?: unknown;
  chapterUrl?: unknown;
};

function validateHtmlRules(value: unknown): HtmlSourceRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("htmlRules 必须是对象。");
  const input=value as Record<string,unknown>;
  const allowedGroups = ["search", "detail", "chapters", "content"];
  if (Object.keys(input).some((key) => !allowedGroups.includes(key))) throw new Error("htmlRules 包含不支持的规则组。");
  const read=(key:string,required:string[],allowed:string[])=>{
    const raw=input[key];if(raw===undefined)return undefined;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("htmlRules."+key+" 必须是对象。");
    const obj=raw as Record<string,unknown>,out:Record<string,string>={};
    if(Object.keys(obj).some((field)=>!allowed.includes(field))) throw new Error("htmlRules."+key+" 包含不支持的字段。");
    for(const field of allowed){if(obj[field]===undefined)continue;if(typeof obj[field]!=="string"||!(obj[field] as string).trim()||(obj[field] as string).length>300)throw new Error("htmlRules."+key+"."+field+" 无效。");out[field]=(obj[field] as string).trim();}
    for(const field of required)if(!out[field])throw new Error("htmlRules."+key+" 缺少 "+field+"。");return out;
  };
  const search=read("search",["itemSelector","titleSelector","urlSelector"],["itemSelector","titleSelector","urlSelector","authorSelector","descriptionSelector","titleAttribute","authorAttribute","descriptionAttribute","urlAttribute","coverSelector","coverAttribute"]);
  const detail=read("detail",[],["titleSelector","authorSelector","descriptionSelector","coverSelector","coverAttribute","titleAttribute","authorAttribute","descriptionAttribute"]);
  const chapters=read("chapters",["itemSelector","titleSelector","urlSelector"],["itemSelector","titleSelector","urlSelector","titleAttribute","urlAttribute"]);
  const content=read("content",["contentSelector"],["contentSelector","titleSelector"]);
  return {...(search?{search:search as NonNullable<HtmlSourceRules["search"]>}:{}),...(detail?{detail:detail as NonNullable<HtmlSourceRules["detail"]>}:{}),...(chapters?{chapters:chapters as NonNullable<HtmlSourceRules["chapters"]>}:{}),...(content?{content:content as NonNullable<HtmlSourceRules["content"]>}:{})};
}

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
  // Keep {keyword}, {bookUrl}, {chapterUrl} and similar source tokens
  // intact after validation. URL.toString() percent-encodes braces, which
  // would silently disable the runtime's template replacement.
  const templateSafeValue = value.trim().replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, "source-template-token");
  let parsed: URL;
  try {
    parsed = new URL(templateSafeValue);
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
  return value.trim();
}


function validateAllowedDomains(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("allowedDomains 必须是最多 50 个域名的数组。");
  }
  const domains = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("allowedDomains 中包含无效域名。");
    }
    const input = raw.trim().toLowerCase();
    let parsed: URL;
    try { parsed = new URL("https://" + input); }
    catch { throw new Error("allowedDomains 中包含无效域名：" + input); }
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" ||
        parsed.search || parsed.hash || parsed.host !== input ||
        isPrivateOrLocalHost(parsed.hostname)) {
      throw new Error("allowedDomains 只允许公开 HTTPS 主机名：" + input);
    }
    domains.add(parsed.hostname);
  }
  return [...domains];
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
    ...(input.htmlRules !== undefined ? { htmlRules: validateHtmlRules(input.htmlRules) } : {}),
    ...(input.allowedDomains !== undefined ? { allowedDomains: validateAllowedDomains(input.allowedDomains) } : {}),
  };
}


/** Parse one source object or a batch of up to 100 source objects. */
export function parseNovelSourceJsonBatch(raw: string): Array<Omit<NovelSource, "id" | "enabled" | "importedAt">> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式错误，请检查逗号、引号和括号。");
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) throw new Error("批量书源列表不能为空。");
  if (entries.length > 100) throw new Error("单次最多导入 100 个书源，请分批导入。");
  const result = entries.map((entry, index) => {
    try {
      return parseNovelSourceJson(JSON.stringify(entry));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "书源校验失败。";
      throw new Error("第 " + (index + 1) + " 个书源校验失败：" + reason);
    }
  });
  const names = new Set<string>();
  const urls = new Set<string>();
  for (const source of result) {
    const name = source.name.toLocaleLowerCase();
    const url = source.baseUrl.toLocaleLowerCase();
    if (names.has(name) || urls.has(url)) {
      throw new Error("批量列表中存在重复的书源名称或网址，请先去重。");
    }
    names.add(name);
    urls.add(url);
  }
  return result;
}
