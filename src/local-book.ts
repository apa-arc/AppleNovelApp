export type LocalTextChapter = {
  id: string;
  title: string;
  content: string;
  index: number;
};

export type ParsedLocalTextBook = {
  title: string;
  chapters: LocalTextChapter[];
  characterCount: number;
};

const CHAPTER_HEADING = /^(第[0-9零一二三四五六七八九十百千万两〇○]+[章节回卷集部篇幕].{0,60}|序章|楔子|前言|后记|番外(?:.{0,30})?)$/;

export function localBookTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(txt|text|md)$/i, "").trim();
  return withoutExtension || "未命名小说";
}

/** Parse a plain-text novel into chapters without executing embedded markup or scripts. */
export function parseLocalTextBook(fileName: string, rawContent: string): ParsedLocalTextBook {
  const content = rawContent.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!content) throw new Error("文件内容为空，无法导入小说。");

  const lines = content.split("\n");
  const chapters: LocalTextChapter[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  const pushChapter = () => {
    const chapterContent = currentLines.join("\n").trim();
    if (!chapterContent && !currentTitle) return;
    const index = chapters.length;
    chapters.push({
      id: "local-chapter-" + index,
      title: currentTitle || (index === 0 ? "全文" : "第 " + (index + 1) + " 章"),
      content: chapterContent,
      index,
    });
  };

  let headingCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed.length > 0 && trimmed.length <= 64 && CHAPTER_HEADING.test(trimmed);
    if (isHeading) {
      if (currentTitle || currentLines.some((part) => part.trim())) pushChapter();
      currentTitle = trimmed;
      currentLines = [];
      headingCount += 1;
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle || currentLines.some((part) => part.trim())) pushChapter();

  if (headingCount === 0 || chapters.length === 0) {
    return {
      title: localBookTitleFromFileName(fileName),
      chapters: [{ id: "local-chapter-0", title: "全文", content, index: 0 }],
      characterCount: content.length,
    };
  }

  return {
    title: localBookTitleFromFileName(fileName),
    chapters,
    characterCount: content.length,
  };
}
