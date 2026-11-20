import type { NovelSource } from "./source";
import { SourceHttpError, type SourceEndpoint, type SourceHttpClient, type SourceHttpResult } from "./source-runtime";

export const BUILTIN_MOCK_SOURCE_ID = "builtin-mock-source";
const BASE = "https://mock-api.example.invalid";
const BOOK_URL = BASE + "/api/book/demo-book-001";

export const BUILTIN_MOCK_SOURCE: NovelSource = {
  id: BUILTIN_MOCK_SOURCE_ID,
  name: "本地模拟书源（星海来信）",
  baseUrl: BASE,
  searchUrl: BASE + "/api/search?q={keyword}",
  bookUrl: BASE + "/api/book/{bookId}",
  chapterListUrl: BASE + "/api/chapters?bookUrl={bookUrl}",
  chapterUrl: BASE + "/api/chapter",
  enabled: true,
  importedAt: 0,
  isBuiltinMock: true,
};

const BOOK_INTRO = "原创联调短篇：远航船收到一封来自旧地球的信，信中只有一句话：请记得抬头看星星。";
const CHAPTERS = [
  { id: "demo-chapter-001", title: "第一章 漂流瓶", index: 0, url: BASE + "/api/chapter/demo-chapter-001" },
  { id: "demo-chapter-002", title: "第二章 蓝色星球", index: 1, url: BASE + "/api/chapter/demo-chapter-002" },
  { id: "demo-chapter-003", title: "第三章 回信", index: 2, url: BASE + "/api/chapter/demo-chapter-003" },
];
const CONTENTS: Record<string, string> = {
  "demo-chapter-001": "远航船离开地球的第三百天，通讯器收到一段没有署名的文字。\n\n“如果你还能看见星星，就说明夜晚还没有输。”\n\n林澈把这句话抄进航行日志，第一次觉得漫长的宇宙并不空旷。",
  "demo-chapter-002": "观测窗外，一颗蓝色星球缓缓转动。林澈想起童年时海边的风，也想起母亲说过，远行的人总要有一个可以回去的方向。",
  "demo-chapter-003": "他对着通讯器输入回复：“我看见了。星星一直都在。”\n\n发送键亮起，远方没有立刻回答。但这一次，林澈没有感到孤单。",
};

function result(url: string, payload: unknown): SourceHttpResult {
  return { url, status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) };
}

/** A deterministic, no-network transport for testing the real JSON source parsers in the app. */
export function createBuiltinMockSourceClient(source: NovelSource): SourceHttpClient {
  return {
    async get(endpoint: SourceEndpoint, urlOverride?: string) {
      if (source.id !== BUILTIN_MOCK_SOURCE_ID || !source.isBuiltinMock) {
        throw new SourceHttpError("本地模拟传输只允许内置模拟书源使用。", "url-not-allowed");
      }
      if (!source.enabled) throw new SourceHttpError("该书源已停用。", "source-disabled");
      let target: URL;
      try {
        target = new URL(urlOverride || source[endpoint]);
      } catch {
        throw new SourceHttpError("模拟书源请求地址无效。", "url-not-allowed");
      }
      if (target.protocol !== "https:" || target.origin !== BASE) {
        throw new SourceHttpError("模拟书源不允许访问外部地址。", "url-not-allowed");
      }

      if (endpoint === "searchUrl") {
        const keyword = target.searchParams.get("q") || "";
        const match = "星海来信".includes(keyword) || keyword.includes("星海") || keyword.includes("来信");
        return result(target.toString(), {
          data: match ? [{
            title: "星海来信",
            author: "书源测试组",
            intro: BOOK_INTRO,
            url: BOOK_URL,
            category: "科幻",
            latestChapter: "第三章 回信",
          }] : [],
        });
      }
      if (endpoint === "bookUrl" && target.pathname === "/api/book/demo-book-001") {
        return result(target.toString(), {
          data: {
            title: "星海来信",
            author: "书源测试组",
            intro: BOOK_INTRO,
            status: "completed",
            wordCount: 420,
          },
        });
      }
      if (endpoint === "chapterListUrl" && target.pathname === "/api/chapters" &&
          target.searchParams.get("bookUrl") === BOOK_URL) {
        return result(target.toString(), { chapters: CHAPTERS.map((chapter) => ({ title: chapter.title, url: chapter.url })) });
      }
      if (endpoint === "chapterUrl" && target.pathname.startsWith("/api/chapter/")) {
        const chapterId = target.pathname.split("/").pop() || "";
        const chapter = CHAPTERS.find((item) => item.id === chapterId);
        const content = CONTENTS[chapterId];
        if (chapter && content) {
          return result(target.toString(), { data: { title: chapter.title, content } });
        }
      }
      throw new SourceHttpError("模拟书源没有这条测试接口或数据。", "http-error");
    },
  };
}
