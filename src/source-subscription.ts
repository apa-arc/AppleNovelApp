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

export type ParsedSourceSubscription = {
  subscriptionId: string;
  name: string;
  updatedAt: string;
  compatible: Array<Omit<NovelSource, "id" | "enabled" | "importedAt"> & { remoteId: string; version: string }>;
  unsupported: Array<{ id: string; name: string; reason: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parses the repository manifest format without executing its scriptUrl.
 * Only entries with an explicit JSON endpoint appConfig can be imported.
 */
export function parseSourceSubscription(raw: string): ParsedSourceSubscription {
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("订阅 JSON 格式错误。"); }
  if (!isRecord(payload) || payload.schemaVersion !== 1 ||
      typeof payload.subscriptionId !== "string" || !Array.isArray(payload.sources)) {
    throw new Error("不是受支持的小说书源订阅清单。");
  }
  if (payload.sources.length > 500) throw new Error("订阅书源数量超过 500 个限制。");
  const ids = new Set<string>();
  const compatible: ParsedSourceSubscription["compatible"] = [];
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
    unsupported,
  };
}
