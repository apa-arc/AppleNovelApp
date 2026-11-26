import type { NovelSource } from "./source";

export type SourceEndpoint =
  | "searchUrl"
  | "bookUrl"
  | "chapterListUrl"
  | "chapterUrl";

export type SourceHttpResult = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

export type SourceHttpClient = {
  get(endpoint: SourceEndpoint, urlOverride?: string, signal?: AbortSignal): Promise<SourceHttpResult>;
};

export class SourceHttpError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "source-disabled"
      | "url-not-allowed"
      | "redirect-blocked"
      | "http-error"
      | "response-too-large"
      | "timeout"
      | "cancelled"
      | "network-error"
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_CHARS = 1_000_000;

function configuredOrigins(source: NovelSource): Set<string> {
  return new Set([
    source.baseUrl,
    source.searchUrl,
    source.bookUrl,
    source.chapterListUrl,
    source.chapterUrl,
  ].map((value) => new URL(value).origin).concat(
    (source.allowedDomains || []).map((domain) => new URL("https://" + domain).origin)
  ));
}

/**
 * Creates a deliberately narrow HTTP boundary for a configured source.
 * It only performs GET requests to origins already present in that source.
 * It does not execute source-provided JavaScript or attach credentials.
 */
export function createSourceHttpClient(
  source: NovelSource,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
): SourceHttpClient {
  const allowedOrigins = configuredOrigins(source);
  const effectiveTimeoutMs = Math.max(500, Math.min(REQUEST_TIMEOUT_MS, timeoutMs));

  return {
    async get(endpoint, urlOverride, externalSignal) {
      if (!source.enabled) {
        throw new SourceHttpError("该书源已停用。", "source-disabled");
      }

      const configuredUrl = source[endpoint];
      let target: URL;
      try {
        target = new URL(urlOverride || configuredUrl);
      } catch {
        throw new SourceHttpError("书源请求地址无效。", "url-not-allowed");
      }

      if (
        target.protocol !== "https:" ||
        target.username ||
        target.password ||
        !allowedOrigins.has(target.origin)
      ) {
        throw new SourceHttpError(
          "请求地址不在该书源已配置的 HTTPS 域名范围内。",
          "url-not-allowed"
        );
      }

      const controller = new AbortController();
      const abortFromCaller = () => controller.abort();
      if (externalSignal?.aborted) controller.abort();
      else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
      try {
        const response = await fetchImpl(target.toString(), {
          method: "GET",
          headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        });

        // Reject unexpected final URLs as a second check in case the runtime
        // does not honor redirect: "error".
        if (response.url) {
          const finalUrl = new URL(response.url);
          if (finalUrl.protocol !== "https:" || !allowedOrigins.has(finalUrl.origin)) {
            throw new SourceHttpError("书源请求发生了不允许的跨域跳转。", "redirect-blocked");
          }
        }

        if (!response.ok) {
          throw new SourceHttpError(
            `书源服务器返回 HTTP ${response.status}。`,
            "http-error"
          );
        }

        const body = await response.text();
        if (body.length > MAX_RESPONSE_CHARS) {
          throw new SourceHttpError("书源响应内容超过 1 MB 字符限制。", "response-too-large");
        }

        return {
          url: response.url || target.toString(),
          status: response.status,
          contentType: response.headers.get("content-type") || "",
          body,
        };
      } catch (error) {
        if (error instanceof SourceHttpError) throw error;
        if (externalSignal?.aborted) {
          throw new SourceHttpError("搜索已取消。", "cancelled");
        }
        if (controller.signal.aborted) {
          throw new SourceHttpError(`书源请求超时（${Math.ceil(effectiveTimeoutMs / 1000)} 秒）。`, "timeout");
        }
        const message = error instanceof Error ? error.message : "";
        if (/redirect/i.test(message)) {
          throw new SourceHttpError("书源请求被重定向，已阻止。", "redirect-blocked");
        }
        throw new SourceHttpError("书源网络请求失败，请检查网络或站点状态。", "network-error");
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
