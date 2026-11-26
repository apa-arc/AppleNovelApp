import type { NovelSummary } from "./novel";
import { parseHtmlNovelDetail } from "./html-source-parser";

type QQReaderSearchResponse = {
  code?: number;
  data?: { bookList?: Array<{ bid?: number | string; title?: string; author?: string }> };
};

const normalize = (value: string) => value.trim().replace(/\s+/g, "").toLocaleLowerCase();

/**
 * Optional cover-only fallback. It never imports QQ Reading text or chapters:
 * exact title/author match -> public detail page -> og:image.
 */
export async function lookupQQReaderCover(
  title: string,
  author: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 6000
): Promise<string | null> {
  const wantedTitle = normalize(title);
  if (!wantedTitle) return null;

  const fetchWithTimeout = async (url: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const searchUrl = "https://book.qq.com/api/booksearch/query?keyWord=" +
      encodeURIComponent(title) + "&pageNo=1&pageSize=20";
    const searchResponse = await fetchWithTimeout(searchUrl);
    if (!searchResponse.ok) return null;
    const payload = await searchResponse.json() as QQReaderSearchResponse;
    if (payload.code !== 0 || !Array.isArray(payload.data?.bookList)) return null;

    const matches = payload.data.bookList.filter((book) =>
      typeof book.bid === "number" || (typeof book.bid === "string" && /^\d+$/.test(book.bid))
    );
    const exactTitleMatches = matches.filter((book) => normalize(book.title || "") === wantedTitle);
    const exact = author.trim()
      ? exactTitleMatches.find((book) => !!book.author && normalize(book.author) === normalize(author)) ||
        exactTitleMatches.find((book) => !book.author)
      : exactTitleMatches[0];
    if (!exact?.bid) return null;

    const bookUrl = "https://book.qq.com/book-detail/" + encodeURIComponent(String(exact.bid));
    const detailResponse = await fetchWithTimeout(bookUrl);
    if (!detailResponse.ok) return null;
    const html = await detailResponse.text();
    const summary: NovelSummary = {
      id: "qq-reader-cover:" + exact.bid,
      sourceId: "qq-reader-cover",
      sourceName: "QQ阅读封面补全",
      title: exact.title || title,
      author: exact.author || author,
      description: "",
      bookUrl,
    };
    const detail = parseHtmlNovelDetail(html, summary, {
      coverSelector: "meta[property='og:image']",
      coverAttribute: "content",
    });
    if (!detail.coverUrl) return null;
    const imageUrl = new URL(detail.coverUrl);
    const trustedImageHost = /(^|\.)myqcloud\.com$/i.test(imageUrl.hostname) ||
      /(^|\.)qpic\.cn$/i.test(imageUrl.hostname);
    if (imageUrl.protocol !== "https:" || !trustedImageHost || imageUrl.username || imageUrl.password) return null;
    return imageUrl.toString();
  } catch {
    // Cover fallback must never block ordinary source search or detail navigation.
    return null;
  }
}
