import { parseNovelSourceJson, type NovelSource } from "./source";

export type CompatibleSubscriptionSource = {
  id: string;
  name: string;
  version: string;
  baseUrl: string;
  domains: string[];
  appConfig?: {
    searchUrl?: string;
    bookUrl?: string;
    chapterListUrl?: string;
    chapterUrl?: string;
    htmlRules?: unknown;
  };
};

export type AliasDictionarySource = { id: string; name: string; version: string; dataUrl: string };

export type ParsedSourceSubscription = {
  subscriptionId: string;
  name: string;
  updatedAt: string;
  compatible: Array<Omit<NovelSource, "id" | "enabled" | "importedAt"> & { remoteId: string; version: string }>;
  aliasSources: AliasDictionarySource[];
  unsupported: Array<{ id: string; name: string; reason: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}


function legadoSelector(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw || raw.length > 300 || /@(?:js|json|xpath|regex)/i.test(raw)) return undefined;
  const match = raw.match(/^(class|id|tag)\.([\w-]+)(?:@(?:text|href|src|content))?$/i);
  if (match) return match[1].toLowerCase() === "class" ? "." + match[2] : match[1].toLowerCase() === "id" ? "#" + match[2] : match[2];
  return /^[\w-]+(?:[.#][\w-]+)?$/.test(raw) ? raw : undefined;
}
function legadoAttribute(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.match(/@(text|href|src|content)$/i)?.[1].toLowerCase() || fallback;
}
function mapLegadoRules(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const search = isRecord(raw.ruleSearch) ? raw.ruleSearch : {};
  const toc = isRecord(raw.ruleToc) ? raw.ruleToc : {};
  const content = isRecord(raw.ruleContent) ? raw.ruleContent : {};
  const detail = isRecord(raw.ruleBookInfo) ? raw.ruleBookInfo : {};
  const itemSelector = legadoSelector(search.bookList);
  const titleSelector = legadoSelector(search.name);
  const urlSelector = legadoSelector(search.bookUrl);
  const chapterItem = legadoSelector(toc.chapterList);
  const chapterTitle = legadoSelector(toc.chapterName);
  const chapterUrl = legadoSelector(toc.chapterUrl);
  const contentSelector = legadoSelector(content.content);
  if (!itemSelector || !titleSelector || !urlSelector || !chapterItem || !chapterTitle || !chapterUrl || !contentSelector) return undefined;
  const mapped: Record<string, unknown> = {
    search: {
      itemSelector, titleSelector, urlSelector,
      urlAttribute: legadoAttribute(search.bookUrl, "href"),
      ...(legadoSelector(search.author) ? { authorSelector: legadoSelector(search.author) } : {}),
      ...(legadoSelector(search.intro) ? { descriptionSelector: legadoSelector(search.intro) } : {}),
      ...(legadoSelector(search.coverUrl) ? { coverSelector: legadoSelector(search.coverUrl), coverAttribute: legadoAttribute(search.coverUrl, "src") } : {})
    },
    chapters: { itemSelector: chapterItem, titleSelector: chapterTitle, urlSelector: chapterUrl, urlAttribute: legadoAttribute(toc.chapterUrl, "href") },
    content: { contentSelector }
  };
  const title = legadoSelector(detail.name);
  const author = legadoSelector(detail.author);
  const intro = legadoSelector(detail.intro);
  if (title || author || intro) mapped.detail = {
    ...(title ? { titleSelector: title } : {}),
    ...(author ? { authorSelector: author } : {}),
    ...(intro ? { descriptionSelector: intro } : {})
  };
  return mapped;
}

function parseExternalSourceBundle(payload: unknown, subscriptionIdHint?: string): ParsedSourceSubscription | null {
  const entries = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.sources) ? payload.sources : isRecord(payload) && (typeof payload.bookSourceName === "string" || typeof payload.name === "string") ? [payload] : null;
  if (!entries) return null;
  if (entries.length > 500) throw new Error("订阅书源数量超过 500 个限制。");
  const compatible: ParsedSourceSubscription["compatible"] = [];
  const unsupported: ParsedSourceSubscription["unsupported"] = [];
  const seen = new Set<string>();
  entries.forEach((raw: unknown, index: number) => {
    if (!isRecord(raw)) {
      unsupported.push({ id: "external-" + index, name: "未知书源", reason: "书源条目不是 JSON 对象。" });
      return;
    }
    const name = typeof raw.name === "string" ? raw.name : typeof raw.bookSourceName === "string" ? raw.bookSourceName : "未命名书源";
    const remoteId = typeof raw.id === "string" ? raw.id : typeof raw.bookSourceUrl === "string" ? raw.bookSourceUrl : "external-" + index + "-" + name;
    if (seen.has(remoteId)) { unsupported.push({ id: remoteId, name, reason: "订阅中存在重复书源。" }); return; }
    seen.add(remoteId);
    const searchUrl = typeof raw.searchUrl === "string" ? raw.searchUrl : "";
    let baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : typeof raw.bookSourceUrl === "string" ? raw.bookSourceUrl : "";
    if (!baseUrl && searchUrl) { try { baseUrl = new URL(searchUrl.replace(/\{\{?key\}?\}/g, "keyword")).origin; } catch { baseUrl = ""; } }
    const bookUrl = typeof raw.bookUrl === "string" ? raw.bookUrl : typeof raw.bookInfoUrl === "string" ? raw.bookInfoUrl : "";
    const chapterListUrl = typeof raw.chapterListUrl === "string" ? raw.chapterListUrl : typeof raw.tocUrl === "string" ? raw.tocUrl : "";
    const chapterUrl = typeof raw.chapterUrl === "string" ? raw.chapterUrl : typeof raw.contentUrl === "string" ? raw.contentUrl : "";
    if (!searchUrl || !baseUrl || !bookUrl || !chapterListUrl || !chapterUrl) {
      const hasRuleDsl = !!(raw.ruleSearch || raw.ruleBookInfo || raw.ruleToc || raw.ruleContent);
      unsupported.push({ id: remoteId, name, reason: hasRuleDsl ? "已识别为阅读类规则书源，但其专属规则表达式尚未适配，暂不执行。" : "缺少完整的搜索、详情、目录或正文接口地址。" });
      return;
    }
    const normalizeTemplate = (value: string) => value.replace(/\{\{\s*(key|keyword)\s*\}\}/gi, "{keyword}").replace(/\{\{\s*page\s*\}\}/gi, "{page}").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "{$1}");
    try {
      const mappedRules = raw.htmlRules !== undefined ? raw.htmlRules : mapLegadoRules(raw);
      const normalized = parseNovelSourceJson(JSON.stringify({ name, baseUrl, searchUrl: normalizeTemplate(searchUrl), bookUrl: normalizeTemplate(bookUrl), chapterListUrl: normalizeTemplate(chapterListUrl), chapterUrl: normalizeTemplate(chapterUrl), ...(mappedRules !== undefined ? { htmlRules: mappedRules } : {}) }));
      compatible.push({ ...normalized, remoteId, version: typeof raw.version === "string" ? raw.version : "0.0.0" });
    } catch (error) {
      unsupported.push({ id: remoteId, name, reason: error instanceof Error ? error.message : "书源配置校验失败。" });
    }
  });
  return { subscriptionId: isRecord(payload) && typeof payload.subscriptionId === "string" ? payload.subscriptionId : (subscriptionIdHint || "external-json-subscription"), name: isRecord(payload) && typeof payload.name === "string" ? payload.name : "外部阅读书源订阅", updatedAt: isRecord(payload) && typeof payload.updatedAt === "string" ? payload.updatedAt : "", compatible, aliasSources: [], unsupported };
}

/**
 * Parses the repository manifest format without executing its scriptUrl.
 * Normal entries require an explicit JSON endpoint appConfig; alias dictionaries
 * are validated and returned separately because they do not fetch book content.
 */
export function parseSourceSubscription(raw: string, subscriptionIdHint?: string): ParsedSourceSubscription {
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
    if (!lines.length) throw new Error("订阅 JSON/TXT 内容为空。");
    try { payload = lines.map((line) => JSON.parse(line)); }
    catch { throw new Error("订阅格式无法识别。TXT 暂支持逐行 JSON 书源；纯网址列表和脚本订阅暂不自动执行。"); }
  }
  if (!isRecord(payload) || payload.schemaVersion !== 1 ||
      typeof payload.subscriptionId !== "string" || !Array.isArray(payload.sources)) {
    const external = parseExternalSourceBundle(payload, subscriptionIdHint);
    if (external) return external;
    throw new Error("不是受支持的订阅格式。支持本软件清单、单个/批量 JSON 书源；脚本型规则暂不执行。");
  }
  if (payload.sources.length > 500) throw new Error("订阅书源数量超过 500 个限制。");
  const ids = new Set<string>();
  const compatible: ParsedSourceSubscription["compatible"] = [];
  const aliasSources: AliasDictionarySource[] = [];
  const unsupported: ParsedSourceSubscription["unsupported"] = [];
  payload.sources.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      unsupported.push({ id: "unknown-" + index, name: "未知书源", reason: "订阅条目缺少 ID 或名称。" });
      return;
    }
    if (ids.has(entry.id)) {
      unsupported.push({ id: entry.id, name: entry.name, reason: "订阅中存在重复 ID。" });
      return;
    }
    ids.add(entry.id);
    if (entry.kind === "alias-dictionary") {
      try {
        if (typeof entry.dataUrl !== "string" || entry.dataUrl.length > 2048) throw new Error("别名数据地址无效。");
        const dataUrl = new URL(entry.dataUrl);
        if (dataUrl.protocol !== "https:" || dataUrl.hostname !== "raw.githubusercontent.com" || dataUrl.username || dataUrl.password) {
          throw new Error("别名数据地址必须来自 HTTPS raw.githubusercontent.com。");
        }
        aliasSources.push({ id: entry.id, name: entry.name, version: typeof entry.version === "string" ? entry.version : "0.0.0", dataUrl: dataUrl.toString() });
      } catch (error) {
        unsupported.push({ id: entry.id, name: entry.name, reason: error instanceof Error ? error.message : "别名源校验失败。" });
      }
      return;
    }
    const config = entry.appConfig;
    if (!isRecord(config)) {
      unsupported.push({ id: entry.id, name: entry.name, reason: "尚未提供 App JSON 接口配置；脚本规则暂不执行。" });
      return;
    }
    const baseUrl = typeof entry.baseUrl === "string" ? entry.baseUrl : "";
    const domains = Array.isArray(entry.domains) ? entry.domains.filter((x): x is string => typeof x === "string") : [];
    const endpoints = ["searchUrl", "bookUrl", "chapterListUrl", "chapterUrl"] as const;
    if (endpoints.some((key) => typeof config[key] !== "string" || !(config[key] as string).trim())) {
      unsupported.push({ id: entry.id, name: entry.name, reason: "JSON 接口配置不完整，缺少搜索、详情、目录或正文地址。" });
      return;
    }
    try {
      const base = new URL(baseUrl);
      if (base.protocol !== "https:" || !domains.includes(base.hostname)) throw new Error("baseUrl 不在 HTTPS 域名白名单中。");
      for (const key of endpoints) {
        const endpoint = new URL(config[key] as string, base);
        if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !domains.includes(endpoint.hostname)) {
          throw new Error("接口地址超出 HTTPS 域名白名单：" + key);
        }
      }
      const normalized = parseNovelSourceJson(JSON.stringify({
        name: entry.name,
        baseUrl,
        searchUrl: config.searchUrl,
        bookUrl: config.bookUrl,
        chapterListUrl: config.chapterListUrl,
        chapterUrl: config.chapterUrl,
        ...(config.htmlRules !== undefined ? { htmlRules: config.htmlRules } : {}),
      }));
      compatible.push({
        ...normalized,
        remoteId: entry.id,
        version: typeof entry.version === "string" ? entry.version : "0.0.0",
      });
    } catch (error) {
      unsupported.push({ id: entry.id, name: entry.name, reason: error instanceof Error ? error.message : "配置校验失败。" });
    }
  });
  return {
    subscriptionId: payload.subscriptionId,
    name: typeof payload.name === "string" ? payload.name : "小说书源订阅",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
    compatible,
    aliasSources,
    unsupported,
  };
}
