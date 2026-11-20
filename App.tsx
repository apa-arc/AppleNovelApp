import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import * as Updates from "expo-updates";
import { NovelSource, parseNovelSourceJsonBatch } from "./src/source";
import { parseSourceSubscription } from "./src/source-subscription";
import { searchNovelSource } from "./src/source-search";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "./src/source-catalog";
import { normalizeNovelTitle, type NovelSummary, type NovelSearchPage, type NovelDetail, type NovelChapter } from "./src/novel";
import { compareChapterUpdates } from "./src/subscription";
import { DEFAULT_READER_SETTINGS, normalizeReaderSettings, type ReaderSettings, type ReaderTheme } from "./src/reader-settings";
import { getReadingParagraphIndex, getReadingScrollOffset, splitReadingText } from "./src/reading-progress";
import { normalizeReadingHistory, upsertReadingHistory, type ReadingHistoryEntry } from "./src/reading-history";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
} from "react-native";

type Tab = "书架" | "发现" | "书源" | "我的";
type Book = {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  progress: number;
  color: string;
  lastChapter?: string;
  chapterIndex?: number;
  onlineSourceId?: string;
  onlineSourceName?: string;
  onlineSummary?: NovelSummary;
  onlineChapters?: NovelChapter[];
  onlineChapterId?: string;
  onlineLastCheckedAt?: number;
  readerParagraphIndex?: number;
};

const STORAGE_KEY = "@private_novel/books_v1";
const SOURCES_STORAGE_KEY = "@private_novel/sources_v1";
const READER_SETTINGS_STORAGE_KEY = "@private_novel/reader_settings_v1";
const READING_HISTORY_STORAGE_KEY = "@private_novel/reading_history_v1";
const SOURCE_EXAMPLE = `{
  "name": "我的书源",
  "baseUrl": "https://example.com",
  "searchUrl": "https://example.com/search",
  "bookUrl": "https://example.com/book",
  "chapterListUrl": "https://example.com/chapters",
  "chapterUrl": "https://example.com/chapter"
}`;
type SearchSourceOption = { summary: NovelSummary; latencyMs: number; chapterCount?: number | null };
type SearchNovelGroup = { id: string; title: string; author: string; description: string; sources: SearchSourceOption[] };
type Chapter = { title: string; content: string };
const SAMPLE_CHAPTERS: Chapter[] = [
  { title: "第一章 · 故事的开始", content: "清晨的光从窗边慢慢铺开，新的旅程也在这一刻开始。\n\n这是用于测试阅读器的演示章节。正式接入书源后，这里会显示所选小说的真实章节正文。\n\n阅读器会记录你读到的章节，方便下次从上次的位置继续。\n\n请注意：当前内容仅为应用内置演示文本，并非真实小说正文。" },
  { title: "第二章 · 远方来信", content: "桌面上多了一封没有署名的信。信纸很薄，字迹却清晰。\n\n这是一段演示文本，用来检查章节切换、目录跳转和阅读位置保存是否正常。\n\n真正的章节内容将在后续接入经过授权的在线书源或用户导入的本地文本后展示。" },
  { title: "第三章 · 向前一步", content: "有些答案需要亲自走出去才能找到。合上信纸，他决定在今天启程。\n\n你现在看到的是第三段演示内容。可以通过底部按钮切换章节，也可以打开目录直接跳转。\n\n章节阅读进度会保存在当前设备。" },
];
const SAMPLE_BOOKS: Book[] = [
  {
    id: "1",
    title: "星海漫游指南",
    author: "示例作者",
    description: "一段关于远方、选择与成长的故事。这里是演示书籍，用于体验书架和阅读界面。",
    category: "科幻",
    progress: 36,
    color: "#DCE8F8",
    lastChapter: "第一章 · 故事的开始",
  },
  {
    id: "2",
    title: "山海旧闻",
    author: "示例作者",
    description: "从一座临海小城开始，寻找散落在旧时光里的故事。",
    category: "奇幻",
    progress: 12,
    color: "#F4E6D8",
    lastChapter: "序章",
  },
  {
    id: "3",
    title: "长街灯火",
    author: "示例作者",
    description: "平凡街巷里的日常与温暖。",
    category: "都市",
    progress: 0,
    color: "#E5E9DF",
    lastChapter: "尚未开始",
  },
];

function getOnlineBookId(title: string, author: string): string {
  return "online:" + normalizeNovelTitle(title) + "::" + normalizeNovelTitle(author);
}

function BookCover({ book }: { book: Book }) {
  return (
    <View style={[styles.cover, { backgroundColor: book.color }]}>
      <Text style={styles.coverTitle} numberOfLines={3}>{book.title}</Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverAuthor}>{book.author}</Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("书架");
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>(SAMPLE_BOOKS);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [showSpeechSettings, setShowSpeechSettings] = useState(false);
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>>([]);
  const [loadingSpeechVoices, setLoadingSpeechVoices] = useState(false);
  const [speechVoiceMessage, setSpeechVoiceMessage] = useState("");
  const [speechVoiceIdentifier, setSpeechVoiceIdentifier] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState(DEFAULT_READER_SETTINGS.speechRate);
  const [speechPitch, setSpeechPitch] = useState(DEFAULT_READER_SETTINGS.speechPitch);
  const [readerFontSize, setReaderFontSize] = useState(DEFAULT_READER_SETTINGS.fontSize);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(DEFAULT_READER_SETTINGS.theme);
  const [readerLineSpacing, setReaderLineSpacing] = useState(DEFAULT_READER_SETTINGS.lineSpacing);
  const [readerParagraphSpacing, setReaderParagraphSpacing] = useState(DEFAULT_READER_SETTINGS.paragraphSpacing);
  const [readerHorizontalPadding, setReaderHorizontalPadding] = useState(DEFAULT_READER_SETTINGS.horizontalPadding);
  const [readerMode, setReaderMode] = useState<"scroll" | "tap">(DEFAULT_READER_SETTINGS.readingMode);
  const [readerParagraphIndex, setReaderParagraphIndex] = useState(0);
  const [readerChromeVisible, setReaderChromeVisible] = useState(true);
  const readerTapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [readerContentHeight, setReaderContentHeight] = useState(0);
  const [readerViewportHeight, setReaderViewportHeight] = useState(0);
  const readerScrollRef = useRef<ScrollView | null>(null);
  const restoreReaderPositionRef = useRef(false);
  const [sources, setSources] = useState<NovelSource[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");
  const [onlineQuery, setOnlineQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<SearchNovelGroup[]>([]);
  const [selectedSearchNovel, setSelectedSearchNovel] = useState<SearchNovelGroup | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchSummary, setSearchSummary] = useState("");
  const [loadedNovelDetail, setLoadedNovelDetail] = useState<NovelDetail | null>(null);
  const [loadedChapters, setLoadedChapters] = useState<NovelChapter[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [onlineReading, setOnlineReading] = useState(false);
  const [onlineChapterIndex, setOnlineChapterIndex] = useState(0);
  const [onlineChapterContent, setOnlineChapterContent] = useState("");
  const [onlineChapterTitle, setOnlineChapterTitle] = useState("");
  const [loadingOnlineChapter, setLoadingOnlineChapter] = useState(false);
  const [rankingChapterCounts, setRankingChapterCounts] = useState(false);
  const [openedFromShelf, setOpenedFromShelf] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [appUpdateDownloaded, setAppUpdateDownloaded] = useState(false);
  const [appUpdateBusy, setAppUpdateBusy] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState("尚未检查");
  const [appUpdateCheckedAt, setAppUpdateCheckedAt] = useState<number | null>(null);

  const checkForAppUpdate = async (silent = false) => {
    if (__DEV__) {
      setAppUpdateStatus("开发预览模式暂不支持在线热更新检查");
      return;
    }
    if (!Updates.isEnabled) {
      setAppUpdateStatus("更新服务尚未完成云端配置；完成首次正式构建后即可启用");
      return;
    }
    if (appUpdateBusy) return;
    setAppUpdateBusy(true);
    if (!silent) setAppUpdateStatus("正在连接更新服务器…");
    try {
      const result = await Updates.checkForUpdateAsync();
      setAppUpdateCheckedAt(Date.now());
      if (result.isAvailable) {
        setAppUpdateAvailable(true);
        setAppUpdateDownloaded(false);
        setAppUpdateStatus("检测到新版本。此版本为必需更新，请完成更新后继续使用。");
      } else {
        setAppUpdateAvailable(false);
        setAppUpdateDownloaded(false);
        setAppUpdateStatus("当前已是最新版本");
      }
    } catch {
      setAppUpdateStatus("检查失败，请检查网络后重试");
    } finally {
      setAppUpdateBusy(false);
    }
  };

  const downloadAppUpdate = async () => {
    if (!Updates.isEnabled || appUpdateBusy) return;
    setAppUpdateBusy(true);
    setAppUpdateStatus("正在下载更新包，请保持网络连接…");
    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        setAppUpdateDownloaded(true);
        setAppUpdateAvailable(false);
        setAppUpdateStatus("更新包已准备就绪。请立即重启并进入新版本。");
      } else {
        setAppUpdateAvailable(false);
        setAppUpdateStatus("没有需要下载的新内容");
      }
    } catch {
      setAppUpdateStatus("更新下载失败。为保证版本兼容，暂时无法继续使用旧版本，请检查网络后重试。");
    } finally {
      setAppUpdateBusy(false);
    }
  };

  const applyAppUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setAppUpdateStatus("暂时无法重启应用，请关闭后重新打开");
    }
  };

  useEffect(() => {
    if (!isLoaded || __DEV__ || !Updates.isEnabled) return;
    void checkForAppUpdate(true);
  }, [isLoaded]);

  useEffect(() => {
    let active = true;
    const loadBooks = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && active) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) setBooks(parsed as Book[]);
        }
        const savedSources = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
        if (savedSources && active) {
          const parsedSources: unknown = JSON.parse(savedSources);
          if (Array.isArray(parsedSources)) setSources(parsedSources as NovelSource[]);
        }
        const savedHistory = await AsyncStorage.getItem(READING_HISTORY_STORAGE_KEY);
        if (savedHistory && active) setReadingHistory(normalizeReadingHistory(JSON.parse(savedHistory)));
        const savedReaderSettings = await AsyncStorage.getItem(READER_SETTINGS_STORAGE_KEY);
        if (savedReaderSettings && active) {
          const settings = normalizeReaderSettings(JSON.parse(savedReaderSettings));
          setReaderFontSize(settings.fontSize);
          setReaderTheme(settings.theme);
          setReaderMode(settings.readingMode);
          setReaderLineSpacing(settings.lineSpacing);
          setReaderParagraphSpacing(settings.paragraphSpacing);
          setReaderHorizontalPadding(settings.horizontalPadding);
          setSpeechVoiceIdentifier(settings.speechVoiceIdentifier);
          setSpeechRate(settings.speechRate);
          setSpeechPitch(settings.speechPitch);
        }
      } catch {
        Alert.alert("读取失败", "本地书架数据暂时无法读取，已使用默认书架。");
      } finally {
        if (active) setIsLoaded(true);
      }
    };
    loadBooks();
    return () => {
      active = false;
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books)).catch(() => {
      Alert.alert("保存失败", "书架进度暂时未能保存，请检查手机存储空间。");
    });
  }, [books, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(READING_HISTORY_STORAGE_KEY, JSON.stringify(readingHistory)).catch(() => {
      Alert.alert("保存失败", "阅读记录暂时未能保存，请检查手机存储空间。");
    });
  }, [readingHistory, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources)).catch(() => {
      Alert.alert("保存失败", "书源列表暂时未能保存，请检查手机存储空间。");
    });
  }, [sources, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const settings: ReaderSettings = normalizeReaderSettings({ fontSize: readerFontSize, theme: readerTheme, readingMode: readerMode, lineSpacing: readerLineSpacing, paragraphSpacing: readerParagraphSpacing, horizontalPadding: readerHorizontalPadding, speechVoiceIdentifier, speechRate, speechPitch });
    AsyncStorage.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {
      Alert.alert("保存失败", "阅读设置暂时未能保存，请检查手机存储空间。");
    });
  }, [readerFontSize, readerTheme, readerMode, readerLineSpacing, readerParagraphSpacing, readerHorizontalPadding, speechVoiceIdentifier, speechRate, speechPitch, isLoaded]);

  useEffect(() => {
    if (!restoreReaderPositionRef.current || readerContentHeight <= 0 || readerViewportHeight <= 0) return;
    const text = onlineReading ? onlineChapterContent : (selectedBook?.description || "") + "\n\n" + (SAMPLE_CHAPTERS[chapterIndex]?.content || "");
    const count = splitReadingText(text).length;
    const maxOffset = Math.max(0, readerContentHeight - readerViewportHeight);
    readerScrollRef.current?.scrollTo({ y: getReadingScrollOffset(readerParagraphIndex, count, maxOffset), animated: false });
    restoreReaderPositionRef.current = false;
  }, [readerContentHeight, readerViewportHeight, readerParagraphIndex, onlineReading, onlineChapterContent, chapterIndex, selectedBook?.id]);

  const importSource = () => {
    try {
      let parsed: Array<{ name: string; baseUrl: string; searchUrl: string; bookUrl: string; chapterListUrl: string; chapterUrl: string }>;
      let subscriptionNote = "";
      const decoded: unknown = JSON.parse(sourceDraft);
      if (decoded && typeof decoded === "object" && !Array.isArray(decoded) &&
          "subscriptionId" in decoded) {
        const subscription = parseSourceSubscription(sourceDraft);
        parsed = subscription.compatible;
        subscriptionNote = "；" + subscription.unsupported.length + " 个脚本或不兼容书源已跳过";
        if (parsed.length === 0) {
          setSourceMessage("订阅已识别，但没有可导入的 JSON 兼容书源" + subscriptionNote + "。不会执行订阅中的 JavaScript。");
          return;
        }
      } else {
        parsed = parseNovelSourceJsonBatch(sourceDraft);
      }
      const existingNames = new Set(sources.map((item) => item.name.trim().toLocaleLowerCase()));
      const existingUrls = new Set(sources.map((item) => item.baseUrl.toLocaleLowerCase()));
      const duplicate = parsed.find((item) =>
        existingNames.has(item.name.toLocaleLowerCase()) ||
        existingUrls.has(item.baseUrl.toLocaleLowerCase())
      );
      if (duplicate) {
        setSourceMessage("导入失败：「" + duplicate.name + "」与已导入书源名称或网址重复；本批次未导入任何内容。");
        return;
      }
      const importedAt = Date.now();
      const additions: NovelSource[] = parsed.map((item, index) => ({
        ...item,
        id: importedAt.toString() + "-" + index.toString(),
        enabled: true,
        importedAt,
      }));
      setSources((current) => [...current, ...additions]);
      setSourceDraft("");
      setSourceMessage("导入成功：已导入 " + additions.length + " 个书源" + subscriptionNote + "。");
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "书源校验失败。");
    }
  };

  const filteredBooks = useMemo(
    () => books.filter((book) =>
      (book.title + book.author + book.category).toLowerCase().includes(query.trim().toLowerCase())
    ),
    [books, query]
  );

  const searchOnlineNovels = async () => {
    const keyword = onlineQuery.trim();
    if (!keyword) {
      setSearchMessage("先输入小说名称再搜索。");
      setOnlineResults([]);
      return;
    }
    const enabledSources = sources.filter((source) => source.enabled);
    if (enabledSources.length === 0) {
      setSearchMessage("还没有启用的书源。请先到「书源」页面导入并启用书源。");
      setOnlineResults([]);
      setSearchSummary("");
      return;
    }
    setSearching(true);
    setSearchMessage("");
    setSearchSummary("正在向 " + enabledSources.length + " 个启用书源发起搜索…");
    setOnlineResults([]);
    const settled = await Promise.allSettled(enabledSources.map(async (source) => {
      const startedAt = Date.now();
      const page = await searchNovelSource(source, keyword);
      return { page, latencyMs: Date.now() - startedAt };
    }));
    const groups = new Map<string, SearchNovelGroup>();
    let failed = 0;
    settled.forEach((result) => {
      if (result.status !== "fulfilled") {
        failed += 1;
        return;
      }
      const { page, latencyMs } = result.value;
      page.items.forEach((item) => {
        const key = [normalizeNovelTitle(item.title), normalizeNovelTitle(item.author)].join("::");
        const existing = groups.get(key);
        const option = { summary: item, latencyMs };
        if (!existing) {
          groups.set(key, { id: key, title: item.title, author: item.author, description: item.description, sources: [option] });
        } else {
          if (item.description.length > existing.description.length) existing.description = item.description;
          if (!existing.sources.some((entry) => entry.summary.sourceId === item.sourceId)) existing.sources.push(option);
        }
      });
    });
    const groupedResults = [...groups.values()].map((group) => ({
      ...group,
      sources: [...group.sources].sort((a, b) => a.latencyMs - b.latencyMs),
    }));
    setOnlineResults(groupedResults);
    setSearching(false);
    setSearchSummary("搜索完成：成功 " + (enabledSources.length - failed) + " 个，失败 " + failed + " 个书源，共找到 " + groupedResults.length + " 本（已合并重复结果）。");
    setSearchMessage(groupedResults.length === 0 ? "没有找到结果。可能是书源暂不可用，或该书源返回的格式暂不支持（目前仅支持常见 JSON 列表）。" : "点击小说名称查看介绍并选择阅读源；系统会优先推荐本次响应最快的来源。");
  };

  const openSearchNovel = (novel: SearchNovelGroup) => {
    setSelectedSearchNovel(novel);
    setSelectedSourceId(novel.sources[0]?.summary.sourceId ?? null);
  };

  const rankSourcesByChapterCount = async () => {
    if (!selectedSearchNovel || rankingChapterCounts) return;
    setRankingChapterCounts(true);
    setCatalogMessage("正在逐个读取各书源目录，统计章节数量…");
    const ranked = await Promise.all(selectedSearchNovel.sources.map(async (option) => {
      const source = sources.find((item) => item.id === option.summary.sourceId);
      if (!source || !source.enabled) return { ...option, chapterCount: null };
      try {
        const chapters = await fetchNovelChapterList(source, option.summary);
        return { ...option, chapterCount: chapters.length };
      } catch {
        return { ...option, chapterCount: null };
      }
    }));
    const valid = ranked.filter((item) => item.chapterCount !== null && item.chapterCount !== undefined);
    const speedOrder = [...ranked].sort((a, b) => a.latencyMs - b.latencyMs);
    const chapterOrder = [...valid].sort((a, b) => (b.chapterCount ?? 0) - (a.chapterCount ?? 0));
    const speedRanks = new Map(speedOrder.map((item, index) => [item.summary.sourceId, index]));
    const chapterRanks = new Map(chapterOrder.map((item, index) => [item.summary.sourceId, index]));
    const sorted = ranked.sort((a, b) => {
      const ar = chapterRanks.get(a.summary.sourceId);
      const br = chapterRanks.get(b.summary.sourceId);
      if (ar === undefined) return 1;
      if (br === undefined) return -1;
      const as = (speedRanks.get(a.summary.sourceId) ?? ranked.length) + ar;
      const bs = (speedRanks.get(b.summary.sourceId) ?? ranked.length) + br;
      return as - bs || a.latencyMs - b.latencyMs;
    });
    setSelectedSearchNovel({ ...selectedSearchNovel, sources: sorted });
    if (sorted[0]?.chapterCount !== null && sorted[0]?.chapterCount !== undefined) {
      setSelectedSourceId(sorted[0].summary.sourceId);
      setLoadedNovelDetail(null);
      setLoadedChapters([]);
    }
    setCatalogMessage("综合排序完成：同时考虑响应速度和章节数量，两项排名相加后分数越低越靠前；无法读取目录的来源排在后面。");
    setRankingChapterCounts(false);
  };

  const saveOnlineBookToShelf = () => {
    if (!selectedSearchNovel || !selectedSourceId || loadedChapters.length === 0) return;
    const option = selectedSearchNovel.sources.find((item) => item.summary.sourceId === selectedSourceId);
    const source = sources.find((item) => item.id === selectedSourceId && item.enabled);
    if (!option || !source) {
      setCatalogMessage("当前书源不可用，无法加入书架。");
      return;
    }
    const id = getOnlineBookId(selectedSearchNovel.title, selectedSearchNovel.author);
    setBooks((current) => {
      const existing = current.find((book) => book.id === id);
      const nextBook: Book = {
        id,
        title: selectedSearchNovel.title,
        author: selectedSearchNovel.author,
        description: loadedNovelDetail?.description || selectedSearchNovel.description,
        category: option.summary.category || "网络小说",
        progress: existing?.progress ?? 0,
        color: "#E5E9DF",
        lastChapter: existing?.lastChapter || "尚未开始",
        chapterIndex: existing?.chapterIndex ?? 0,
        onlineSourceId: source.id,
        onlineSourceName: source.name,
        onlineSummary: option.summary,
        onlineChapters: loadedChapters,
        onlineChapterId: existing?.onlineChapterId,
      };
      return existing ? current.map((book) => book.id === id ? nextBook : book) : [nextBook, ...current];
    });
    setCatalogMessage("已加入本地书架。下次打开会从上次阅读的章节继续。");
  };

  const closeSearchNovel = () => {
    setSelectedSearchNovel(null);
    setSelectedSourceId(null);
    setLoadedNovelDetail(null);
    setLoadedChapters([]);
    setCatalogMessage("");
  };

  const loadSelectedNovelCatalog = async () => {
    if (!selectedSearchNovel || !selectedSourceId) return;
    const option = selectedSearchNovel.sources.find((item) => item.summary.sourceId === selectedSourceId);
    const source = sources.find((item) => item.id === selectedSourceId);
    if (!option || !source || !source.enabled) {
      setCatalogMessage("当前书源不可用，请重新选择一个已启用的书源。");
      return;
    }
    setLoadingCatalog(true);
    setCatalogMessage("正在获取小说详情和章节目录…");
    setLoadedNovelDetail(null);
    setLoadedChapters([]);
    try {
      const [detail, chapters] = await Promise.all([
        fetchNovelDetail(source, option.summary),
        fetchNovelChapterList(source, option.summary),
      ]);
      setLoadedNovelDetail(detail);
      setLoadedChapters(chapters);
      setCatalogMessage("获取成功，共 " + chapters.length + " 章。");
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "获取详情或目录失败，请尝试其他书源。");
    } finally {
      setLoadingCatalog(false);
    }
  };

  const openOnlineChapter = async (chapter: NovelChapter) => {
    if (!selectedSearchNovel || !selectedSourceId) return;
    const source = sources.find((item) => item.id === selectedSourceId);
    const option = selectedSearchNovel.sources.find((item) => item.summary.sourceId === selectedSourceId);
    if (!source || !source.enabled || !option) {
      setCatalogMessage("所选书源已不可用，请重新选择书源。");
      return;
    }
    stopSpeech();
    setLoadingOnlineChapter(true);
    setCatalogMessage("");
    try {
      const result = await fetchNovelChapterContent(source, chapter);
      setOnlineChapterIndex(chapter.index);
      setReaderParagraphIndex(0);
      restoreReaderPositionRef.current = true;
      setReaderContentHeight(0);
      setOnlineChapterContent(result.content);
      setOnlineChapterTitle(result.title || chapter.title);
      setOnlineReading(true);
      const onlineBookId = getOnlineBookId(option.summary.title, option.summary.author);
      const readingBook: Book = {
        id: onlineBookId,
        title: option.summary.title,
        author: option.summary.author,
        description: option.summary.description,
        category: option.summary.category || "网络小说",
        progress: Math.round((chapter.index / Math.max(1, loadedChapters.length)) * 100),
        color: "#E5E9DF",
        lastChapter: chapter.title,
        chapterIndex: chapter.index,
        readerParagraphIndex: 0,
        onlineSourceId: source.id,
        onlineSourceName: source.name,
        onlineSummary: option.summary,
        onlineChapters: loadedChapters,
        onlineChapterId: chapter.id,
      };
      setSelectedBook(readingBook);
      recordReading(readingBook, chapter.title, chapter.index, Math.round(((chapter.index + 1) / Math.max(1, loadedChapters.length)) * 100));
      setBooks((current) => current.map((book) => book.id !== onlineBookId ? book : ({
        ...book,
        progress: Math.round(((chapter.index + 1) / Math.max(1, loadedChapters.length)) * 100),
        lastChapter: chapter.title,
        chapterIndex: chapter.index,
        readerParagraphIndex: 0,
        onlineSourceId: source.id,
        onlineSourceName: source.name,
        onlineSummary: option.summary,
        onlineChapters: loadedChapters,
        onlineChapterId: chapter.id,
      })));
      setShowCatalog(false);
      setShowReaderSettings(false);
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "章节正文获取失败，请尝试其他书源。");
    } finally {
      setLoadingOnlineChapter(false);
    }
  };

  const stopSpeech = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  const checkOnlineSubscription = async (book: Book, showNoUpdates = false): Promise<Book | null> => {
    if (!book.onlineSourceId || !book.onlineSummary) return null;
    const source = sources.find((item) => item.id === book.onlineSourceId && item.enabled);
    if (!source) {
      Alert.alert("书源不可用", "这本小说订阅的书源已停用或删除。请先重新启用书源，或重新选择阅读源。");
      return null;
    }
    setCheckingSubscription(true);
    try {
      const latestChapters = await fetchNovelChapterList(source, book.onlineSummary);
      if (latestChapters.length === 0) throw new Error("书源返回了空目录，已保留原有订阅目录。");
      const previousChapters = book.onlineChapters || [];
      const update = compareChapterUpdates(
        previousChapters,
        latestChapters,
        book.onlineChapterId,
        book.chapterIndex ?? 0
      );
      const currentChapter = latestChapters[update.currentChapterIndex];
      const refreshedBook: Book = {
        ...book,
        onlineChapters: latestChapters,
        onlineChapterId: currentChapter?.id,
        chapterIndex: update.currentChapterIndex,
        lastChapter: currentChapter?.title || book.lastChapter,
        onlineLastCheckedAt: Date.now(),
        progress: latestChapters.length
          ? Math.round(((update.currentChapterIndex + 1) / latestChapters.length) * 100)
          : book.progress,
      };
      setBooks((current) => current.map((item) => item.id === book.id ? refreshedBook : item));
      setSelectedBook((current) => current?.id === book.id ? refreshedBook : current);
      setLoadedChapters(latestChapters);
      setOnlineChapterIndex(update.currentChapterIndex);
      if (update.newChapters.length > 0) {
        const latestTitles = update.newChapters.slice(-3).map((chapter) => chapter.title).join("、");
        Alert.alert(
          "发现新章节",
          "《" + book.title + "》更新了 " + update.newChapters.length + " 章。" +
          (latestTitles ? "\n最新章节：" + latestTitles : "") +
          "\\n已自动更新订阅目录。"
        );
      } else if (showNoUpdates) {
        Alert.alert("订阅检查完成", "暂时没有发现新章节，当前目录共 " + latestChapters.length + " 章。");
      }
      return refreshedBook;
    } catch (error) {
      Alert.alert(
        "订阅检查失败",
        (error instanceof Error ? error.message : "暂时无法读取最新目录。") + "\n已保留本地目录，可以稍后重试。"
      );
      return null;
    } finally {
      setCheckingSubscription(false);
    }
  };

  const recordReading = (book: Book, chapterTitle: string, chapterIndexValue: number, progress: number) => {
    setReadingHistory((current) => upsertReadingHistory(current, {
      bookId: book.id, title: book.title, author: book.author, chapterTitle,
      chapterIndex: chapterIndexValue, progress, updatedAt: Date.now(),
    }));
  };

  const resumeReadingHistory = (entry: ReadingHistoryEntry) => {
    const book = books.find((item) => item.id === entry.bookId);
    if (!book) { Alert.alert("无法继续阅读", "这本书当前不在书架中，请重新搜索并添加后再继续。"); return; }
    void openBook(book);
  };

  const openBook = async (book: Book) => {
    stopSpeech();
    if (book.onlineSourceId && book.onlineSummary && book.onlineChapters?.length) {
      const source = sources.find((item) => item.id === book.onlineSourceId && item.enabled);
      if (!source) {
        Alert.alert("书源不可用", "这本小说保存的书源已停用或删除。请到「书源」页面重新启用，或到「发现」重新选择其他书源。");
        return;
      }
      setOpenedFromShelf(true);
      const summary = book.onlineSummary;
      const initialChapters = book.onlineChapters;
      const initialIndex = Math.min(Math.max(book.chapterIndex ?? 0, 0), initialChapters.length - 1);
      setSelectedSearchNovel({
        id: getOnlineBookId(book.title, book.author),
        title: book.title,
        author: book.author,
        description: book.description,
        sources: [{ summary, latencyMs: 0, chapterCount: initialChapters.length }],
      });
      setSelectedSourceId(source.id);
      setLoadedChapters(initialChapters);
      setLoadedNovelDetail(null);
      setShowCatalog(false);
      setShowReaderSettings(false);
      setOnlineReading(true);
      setOnlineChapterIndex(initialIndex);
      setSelectedBook(book);
      recordReading(book, book.lastChapter || initialChapters[initialIndex]?.title || "尚未开始", initialIndex, book.progress);
      setLoadingOnlineChapter(true);

      // Check the subscribed source every time a saved online novel is opened.
      const refreshedBook = await checkOnlineSubscription(book);
      const chapters = refreshedBook?.onlineChapters || initialChapters;
      const targetIndex = refreshedBook?.chapterIndex ?? initialIndex;
      const targetChapter = chapters[targetIndex] || chapters[0];
      if (!targetChapter) {
        setLoadingOnlineChapter(false);
        Alert.alert("目录为空", "当前没有可打开的章节，请稍后重新检查订阅。");
        return;
      }
      try {
        const result = await fetchNovelChapterContent(source, targetChapter);
        setOnlineChapterIndex(targetChapter.index);
        const savedParagraph = refreshedBook?.onlineChapterId === targetChapter.id ? (refreshedBook.readerParagraphIndex ?? 0) : 0;
        setReaderParagraphIndex(savedParagraph);
        restoreReaderPositionRef.current = true;
        setReaderContentHeight(0);
        setOnlineChapterContent(result.content);
        setOnlineChapterTitle(result.title || targetChapter.title);
      } catch (error) {
        Alert.alert("章节加载失败", error instanceof Error ? error.message : "请检查书源后重试。");
        setSelectedBook(null);
        setOnlineReading(false);
      } finally {
        setLoadingOnlineChapter(false);
      }
      return;
    }
    setOpenedFromShelf(true);
    setOnlineReading(false);
    setSelectedBook(book);
    setChapterIndex(Math.min(Math.max(book.chapterIndex ?? 0, 0), SAMPLE_CHAPTERS.length - 1));
    setReaderParagraphIndex(Math.max(0, book.readerParagraphIndex ?? 0));
    restoreReaderPositionRef.current = true;
    setReaderContentHeight(0);
    setShowCatalog(false);
    setShowReaderSettings(false);
    const safeIndex = Math.min(Math.max(book.chapterIndex ?? 0, 0), SAMPLE_CHAPTERS.length - 1);
    recordReading(book, SAMPLE_CHAPTERS[safeIndex].title, safeIndex, book.progress);
  };

  const closeReader = () => {
    stopSpeech();
    setSelectedBook(null);
    setOnlineReading(false);
    setShowCatalog(false);
    setShowReaderSettings(false);
    if (openedFromShelf) {
      setSelectedSearchNovel(null);
      setSelectedSourceId(null);
      setLoadedNovelDetail(null);
      setLoadedChapters([]);
      setCatalogMessage("");
      setTab("书架");
    }
    setOpenedFromShelf(false);
  };

  const loadAvailableSpeechVoices = async () => {
    if (availableSpeechVoices.length > 0 || loadingSpeechVoices) return;
    setLoadingSpeechVoices(true);
    setSpeechVoiceMessage("正在读取 iPhone 可用语音…");
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const sorted = [...voices].sort((a, b) => {
        const aChinese = a.language.toLowerCase().startsWith("zh") ? 0 : 1;
        const bChinese = b.language.toLowerCase().startsWith("zh") ? 0 : 1;
        return aChinese - bChinese || a.language.localeCompare(b.language) || a.name.localeCompare(b.name);
      });
      setAvailableSpeechVoices(sorted);
      setSpeechVoiceMessage(sorted.length > 0 ? `找到 ${sorted.length} 种系统语音。中文语音已排在前面。` : "设备暂未提供可用语音，请检查 iPhone 的语音下载设置。");
    } catch {
      setSpeechVoiceMessage("读取系统语音失败，请稍后重试。");
    } finally {
      setLoadingSpeechVoices(false);
    }
  };

  const openSpeechSettings = () => {
    setShowReaderSettings(false);
    setShowSpeechSettings((visible) => {
      const next = !visible;
      if (next) void loadAvailableSpeechVoices();
      return next;
    });
  };

  const previewSpeechVoice = () => {
    Speech.stop();
    const voice = availableSpeechVoices.find((item) => item.identifier === speechVoiceIdentifier);
    Speech.speak("你好，欢迎使用小说阅读器。你可以在这里试听不同的声音。", {
      language: voice?.language || "zh-CN",
      voice: voice?.identifier,
      rate: speechRate,
      pitch: speechPitch,
      onError: () => setSpeechVoiceMessage("试听失败，这个语音可能尚未下载或暂不可用。"),
    });
  };

  const speakCurrentBook = () => {
    if (!selectedBook) return;
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    const chapterTitle = onlineReading ? onlineChapterTitle : SAMPLE_CHAPTERS[chapterIndex].title;
    const chapterText = onlineReading ? onlineChapterContent : SAMPLE_CHAPTERS[chapterIndex].content;
    const textToRead = selectedBook.title + "。" + chapterTitle + "。" + chapterText;
    setIsSpeaking(true);
    Speech.speak(textToRead, {
      language: availableSpeechVoices.find((voice) => voice.identifier === speechVoiceIdentifier)?.language || "zh-CN",
      voice: availableSpeechVoices.find((voice) => voice.identifier === speechVoiceIdentifier)?.identifier,
      rate: speechRate,
      pitch: speechPitch,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const saveReadingPosition = (bookId: string, nextChapterIndex: number) => {
    const safeIndex = Math.min(Math.max(nextChapterIndex, 0), SAMPLE_CHAPTERS.length - 1);
    setChapterIndex(safeIndex);
    setReaderParagraphIndex(0);
    restoreReaderPositionRef.current = true;
    setReaderContentHeight(0);
    setBooks((current) => current.map((book) => {
      if (book.id !== bookId) return book;
      return {
        ...book,
        chapterIndex: safeIndex,
        readerParagraphIndex: 0,
        progress: Math.round((safeIndex / SAMPLE_CHAPTERS.length) * 100),
        lastChapter: SAMPLE_CHAPTERS[safeIndex].title,
      };
    }));
    const current = books.find((book) => book.id === bookId);
    if (current) recordReading({ ...current, chapterIndex: safeIndex }, SAMPLE_CHAPTERS[safeIndex].title, safeIndex, Math.round(((safeIndex + 1) / SAMPLE_CHAPTERS.length) * 100));
    stopSpeech();
  };

  const changeChapter = (delta: number) => {
    if (!selectedBook) return;
    if (onlineReading) {
      const nextOnline = onlineChapterIndex + delta;
      const chapter = loadedChapters[nextOnline];
      if (chapter) void openOnlineChapter(chapter);
      return;
    }
    const next = chapterIndex + delta;
    if (next < 0 || next >= SAMPLE_CHAPTERS.length) return;
    saveReadingPosition(selectedBook.id, next);
    setShowCatalog(false);
  };

  const updateProgress = (bookId: string, amount: number) => {
    setBooks((current) => current.map((book) => {
      if (book.id !== bookId) return book;
      return {
        ...book,
        progress: Math.min(100, Math.max(book.progress, amount)),
        lastChapter: "第一章 · 故事的开始",
      };
    }));
  };

  if (!isLoaded) {
    return (
      <SafeAreaView style={[styles.safe, styles.loading]}>
        <ActivityIndicator size="large" color="#65745D" />
        <Text style={styles.loadingText}>正在打开你的书架…</Text>
      </SafeAreaView>
    );
  }

  if (selectedSearchNovel && !selectedBook) {
    const sortedSources = [...selectedSearchNovel.sources].sort((a, b) => {
      if (a.chapterCount === null || a.chapterCount === undefined) return 1;
      if (b.chapterCount === null || b.chapterCount === undefined) return -1;
      return a.latencyMs - b.latencyMs;
    });
    const recommended = sortedSources[0];
    const activeSource = selectedSearchNovel.sources.find((item) => item.summary.sourceId === selectedSourceId) || recommended;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.detailHeader}>
          <Pressable onPress={closeSearchNovel}><Text style={styles.backText}>‹ 返回搜索</Text></Pressable>
          <Text style={styles.readerHeaderTitle}>小说详情</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.detailHero}>
            <Text style={styles.detailTitle}>{selectedSearchNovel.title}</Text>
            <Text style={styles.detailAuthor}>{selectedSearchNovel.author || "未知作者"}</Text>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>小说介绍</Text>
            <Text style={styles.detailDescription}>{loadedNovelDetail?.description || selectedSearchNovel.description || "这个书源没有提供小说简介。"} </Text>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>选择阅读源</Text>
            <Text style={styles.note}>综合推荐同时考虑搜索响应速度和目录章节数量。点击下方按钮统计各源目录并生成综合排名。</Text>
            <Pressable onPress={rankSourcesByChapterCount} disabled={rankingChapterCounts} style={[styles.onlineSearchButton, rankingChapterCounts && styles.importButtonDisabled]}>
              {rankingChapterCounts ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.importButtonText}>生成综合推荐排序</Text>}
            </Pressable>
            {sortedSources.map((option, index) => {
              const isRecommended = index === 0 && option.chapterCount !== null && option.chapterCount !== undefined;
              const isSelected = option.summary.sourceId === activeSource?.summary.sourceId;
              return (
                <Pressable key={option.summary.sourceId} onPress={() => {
                  setSelectedSourceId(option.summary.sourceId);
                  setLoadedNovelDetail(null);
                  setLoadedChapters([]);
                  setCatalogMessage("");
                }} style={[styles.sourceChoice, isSelected && styles.sourceChoiceSelected]}>
                  <View style={styles.sourceChoiceInfo}>
                    <Text style={styles.sourceChoiceName}>{option.summary.sourceName}</Text>
                    <Text style={styles.sourceChoiceLatency}>{option.chapterCount === null || option.chapterCount === undefined ? `${option.latencyMs} ms · 尚未统计目录` : `${option.chapterCount} 章 · ${option.latencyMs} ms`}</Text>
                  </View>
                  {isRecommended && <Text style={styles.recommendTag}>综合推荐</Text>}
                  {isSelected && <Text style={styles.selectedTag}>已选择</Text>}
                </Pressable>
              );
            })}
          </View>
          {!!activeSource && (
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>真实小说目录</Text>
              <Text style={styles.note}>当前选择：{activeSource.summary.sourceName}。点击下方按钮，从所选书源获取详情和目录。</Text>
              <Pressable style={[styles.onlineSearchButton, loadingCatalog && styles.importButtonDisabled]} onPress={loadSelectedNovelCatalog} disabled={loadingCatalog}>
                {loadingCatalog ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.importButtonText}>获取小说详情和目录</Text>}
              </Pressable>
              {!!catalogMessage && <Text style={styles.searchFeedback}>{catalogMessage}</Text>}
              {!!loadedChapters.length && (
                <Pressable style={styles.catalogLoadButton} onPress={saveOnlineBookToShelf}>
                  <Text style={styles.importButtonText}>{books.some((book) => book.id === getOnlineBookId(selectedSearchNovel.title, selectedSearchNovel.author)) ? "更新书架信息" : "加入本地书架"}</Text>
                </Pressable>
              )}
              {loadedChapters.map((chapter) => (
                <Pressable key={chapter.id} onPress={() => openOnlineChapter(chapter)} disabled={loadingOnlineChapter} style={styles.chapterRow}>
                  <Text style={styles.chapterRowTitle}>{chapter.title}</Text>
                  <Text style={styles.chapterRowMeta}>第 {chapter.index + 1} 章 · 阅读</Text>
                </Pressable>
              ))}
              {loadingOnlineChapter && <ActivityIndicator color="#65745D" style={{ marginVertical: 12 }} />}
              {!!loadedChapters.length && <Text style={styles.note}>点击任意章节即可加载正文。当前内容由所选书源实时获取。</Text>}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedBook) {
    const currentBook = books.find((book) => book.id === selectedBook.id) || selectedBook;
    const activeChapter = onlineReading ? { title: onlineChapterTitle, content: onlineChapterContent } : SAMPLE_CHAPTERS[chapterIndex];
    const activeChapterIndex = onlineReading ? onlineChapterIndex : chapterIndex;
    const activeChapterCount = onlineReading ? loadedChapters.length : SAMPLE_CHAPTERS.length;
    const activeReadingText = onlineReading ? activeChapter.content : currentBook.description + "\n\n" + activeChapter.content;
    const readingParagraphs = splitReadingText(activeReadingText);
    const readerBackground = readerTheme === "night" ? "#20231F" : readerTheme === "green" ? "#E8EFE3" : readerTheme === "gray" ? "#E9EAEC" : "#F8F7F3";
    const readerTextColor = readerTheme === "night" ? "#E6E3D9" : readerTheme === "green" ? "#3F4A3B" : readerTheme === "gray" ? "#41464D" : "#45453D";
    const readingProgressPercent = Math.min(100, Math.max(0, Math.round(((activeChapterIndex + (readingParagraphs.length > 1 ? readerParagraphIndex / (readingParagraphs.length - 1) : 0)) / Math.max(1, activeChapterCount)) * 100)));
    const readerScrollOffset = getReadingScrollOffset(readerParagraphIndex, readingParagraphs.length, Math.max(0, readerContentHeight - readerViewportHeight));
    const readerMaxScrollOffset = Math.max(0, readerContentHeight - readerViewportHeight);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: readerBackground }]}>
        <StatusBar barStyle={readerTheme === "night" ? "light-content" : "dark-content"} />
        {readerChromeVisible && <View style={styles.readerHeader}>
          <Pressable onPress={closeReader}><Text style={styles.backText}>‹ 返回</Text></Pressable>
          <Text style={[styles.readerHeaderTitle, readerTheme === "night" && styles.nightMuted]}>正在阅读</Text>
          {onlineReading && (
            <Pressable disabled={checkingSubscription} onPress={() => { if (currentBook) void checkOnlineSubscription(currentBook, true); }}>
              <Text style={[styles.headerAction, checkingSubscription && styles.disabledText]}>{checkingSubscription ? "检查中…" : "检查更新"}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => { setShowCatalog((value) => !value); setShowReaderSettings(false); }}>
            <Text style={styles.headerAction}>{showCatalog ? "返回正文" : "目录"}</Text>
          </Pressable>
        </View>}
        {showCatalog ? (
          <ScrollView contentContainerStyle={styles.catalogContent}>
            <Text style={[styles.catalogHeading, readerTheme === "night" && styles.nightText]}>章节目录</Text>
            <Text style={[styles.catalogSub, readerTheme === "night" && styles.nightMuted]}>{currentBook.title} · 共 {activeChapterCount} 章{onlineReading ? "" : "（演示）"}</Text>
            {onlineReading ? loadedChapters.map((chapter, index) => (
              <Pressable key={chapter.id} onPress={() => void openOnlineChapter(chapter)} style={[styles.chapterRow, readerTheme === "night" && styles.nightCard, index === activeChapterIndex && styles.chapterRowActive]}>
                <Text style={[styles.chapterRowTitle, readerTheme === "night" && styles.nightText]}>{chapter.title}</Text>
                <Text style={styles.chapterRowMeta}>{index === activeChapterIndex ? "正在阅读" : "在线章节"}</Text>
              </Pressable>
            )) : SAMPLE_CHAPTERS.map((chapter, index) => (
              <Pressable key={chapter.title} onPress={() => { saveReadingPosition(currentBook.id, index); setShowCatalog(false); }} style={[styles.chapterRow, readerTheme === "night" && styles.nightCard, index === activeChapterIndex && styles.chapterRowActive]}>
                <Text style={[styles.chapterRowTitle, readerTheme === "night" && styles.nightText]}>{chapter.title}</Text>
                <Text style={styles.chapterRowMeta}>{index === activeChapterIndex ? "正在阅读" : "演示章节"}</Text>
              </Pressable>
            ))}
            {!onlineReading && <Text style={[styles.catalogDisclaimer, readerTheme === "night" && styles.nightMuted]}>当前为内置演示目录。</Text>}
          </ScrollView>
        ) : (
          <ScrollView
            ref={readerScrollRef}
            onTouchStart={(event) => {
              const { pageX, pageY } = event.nativeEvent;
              readerTapStartRef.current = { x: pageX, y: pageY, time: Date.now() };
            }}
            onTouchEnd={(event) => {
              const start = readerTapStartRef.current;
              readerTapStartRef.current = null;
              if (!start) return;
              const { pageX, pageY } = event.nativeEvent;
              const elapsed = Date.now() - start.time;
              const deltaX = pageX - start.x;
              const deltaY = pageY - start.y;
              const moved = Math.abs(deltaX) + Math.abs(deltaY);
              const screenWidth = Dimensions.get("window").width;
              const centerTap = pageX > screenWidth * 0.28 && pageX < screenWidth * 0.72;
              if (readerMode === "tap" && elapsed < 900 && Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
                const nextOffset = deltaX < 0
                  ? Math.min(readerMaxScrollOffset, readerScrollOffset + readerViewportHeight * 0.88)
                  : Math.max(0, readerScrollOffset - readerViewportHeight * 0.88);
                readerScrollRef.current?.scrollTo({ y: nextOffset, animated: true });
                return;
              }
              if (elapsed >= 280 || moved >= 14) return;
              if (readerMode === "tap") {
                if (pageX < screenWidth * 0.28) {
                  readerScrollRef.current?.scrollTo({ y: Math.max(0, readerScrollOffset - readerViewportHeight * 0.88), animated: true });
                } else if (pageX > screenWidth * 0.72) {
                  readerScrollRef.current?.scrollTo({ y: Math.min(readerMaxScrollOffset, readerScrollOffset + readerViewportHeight * 0.88), animated: true });
                } else {
                  setReaderChromeVisible((visible) => !visible);
                }
              } else if (centerTap) setReaderChromeVisible((visible) => !visible);
            }}
            contentContainerStyle={[styles.readerContent, { paddingHorizontal: readerHorizontalPadding }]}
            scrollEventThrottle={250}
            onLayout={(event) => setReaderViewportHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_width, height) => setReaderContentHeight(height)}
            onScroll={(event) => {
              if (restoreReaderPositionRef.current || loadingOnlineChapter || readingParagraphs.length === 0) return;
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const nextIndex = getReadingParagraphIndex(contentOffset.y, Math.max(0, contentSize.height - layoutMeasurement.height), readingParagraphs.length);
              if (nextIndex === readerParagraphIndex) return;
              setReaderParagraphIndex(nextIndex);
              const fraction = readingParagraphs.length > 1 ? nextIndex / (readingParagraphs.length - 1) : 0;
              const percent = Math.min(100, Math.round(((activeChapterIndex + fraction) / Math.max(1, activeChapterCount)) * 100));
              recordReading(currentBook, activeChapter.title, activeChapterIndex, percent);
              setBooks((current) => current.map((book) => book.id !== currentBook.id ? book : ({
                ...book,
                readerParagraphIndex: nextIndex,
                chapterIndex: activeChapterIndex,
                onlineChapterId: onlineReading ? loadedChapters[activeChapterIndex]?.id : book.onlineChapterId,
                lastChapter: activeChapter.title,
                progress: percent,
              })));
            }}
          >
            <Text style={styles.chapterLabel}>{activeChapter.title}</Text>
            <Text style={[styles.readerTitle, readerTheme === "night" && styles.nightText]}>{currentBook.title}</Text>
            {loadingOnlineChapter ? <ActivityIndicator size="large" color="#65745D" /> : readingParagraphs.map((paragraph, index) => (
              <Text key={index} style={[styles.readerParagraph, { fontSize: readerFontSize, lineHeight: Math.round(readerFontSize * readerLineSpacing), color: readerTextColor, marginBottom: readerParagraphSpacing }]}>{paragraph}</Text>
            ))}
            <View style={styles.readerFooter}>
              <Text style={[styles.muted, readerTheme === "night" && styles.nightMuted]}>第 {activeChapterIndex + 1} / {activeChapterCount} 章</Text>
              <Text style={[styles.muted, readerTheme === "night" && styles.nightMuted]}>已读 {currentBook.progress}%</Text>
            </View>
          </ScrollView>
        )}
        {showReaderSettings && !showCatalog && (
          <View style={[styles.readerSettings, readerTheme === "night" && styles.nightCard]}>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>阅读方式</Text>
              <Pressable style={[styles.themeButton, readerMode === "scroll" && styles.modeButtonActive]} onPress={() => setReaderMode("scroll")}><Text style={styles.fontButtonText}>上下滚动</Text></Pressable>
              <Pressable style={[styles.themeButton, readerMode === "tap" && styles.modeButtonActive]} onPress={() => setReaderMode("tap")}><Text style={styles.fontButtonText}>点击翻页</Text></Pressable>
              <Text style={[styles.note, readerTheme === "night" && styles.nightMuted]}>点击翻页可点按左右区域或左右滑动。</Text>
            </View>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>字体大小</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderFontSize((size) => Math.max(14, size - 1))}><Text style={styles.fontButtonText}>A−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{readerFontSize}</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderFontSize((size) => Math.min(28, size + 1))}><Text style={styles.fontButtonText}>A+</Text></Pressable>
            </View>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>行距</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderLineSpacing((v) => Math.max(1.4, Math.round((v - 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{readerLineSpacing.toFixed(1)}</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderLineSpacing((v) => Math.min(2.4, Math.round((v + 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>＋</Text></Pressable>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>段间距</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderParagraphSpacing((v) => Math.max(8, v - 2))}><Text style={styles.fontButtonText}>−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{readerParagraphSpacing}</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderParagraphSpacing((v) => Math.min(32, v + 2))}><Text style={styles.fontButtonText}>＋</Text></Pressable>
            </View>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>左右留白</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderHorizontalPadding((v) => Math.max(16, v - 2))}><Text style={styles.fontButtonText}>−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{readerHorizontalPadding}</Text>
              <Pressable style={styles.fontButton} onPress={() => setReaderHorizontalPadding((v) => Math.min(40, v + 2))}><Text style={styles.fontButtonText}>＋</Text></Pressable>
            </View>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>背景</Text>
              {([{ id: "paper", label: "纸白" }, { id: "green", label: "护眼绿" }, { id: "gray", label: "浅灰" }, { id: "night", label: "夜间" }] as const).map((option) => (
                <Pressable key={option.id} style={[styles.themeButton, readerTheme === option.id && styles.modeButtonActive]} onPress={() => setReaderTheme(option.id)}><Text style={styles.fontButtonText}>{option.label}</Text></Pressable>
              ))}
            </View>
          </View>
        )}
        {showSpeechSettings && !showCatalog && (
          <View style={[styles.readerSettings, styles.speechSettings, readerTheme === "night" && styles.nightCard]}>
            <View style={styles.speechHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>朗读声音</Text>
                <Text style={[styles.note, readerTheme === "night" && styles.nightMuted]}>使用 iPhone 已安装的系统语音；可在系统设置中下载更多声音。</Text>
              </View>
              <Pressable style={styles.fontButton} onPress={() => { setAvailableSpeechVoices([]); void loadAvailableSpeechVoices(); }}>
                <Text style={styles.fontButtonText}>{loadingSpeechVoices ? "读取中" : "刷新"}</Text>
              </Pressable>
              <Pressable style={styles.fontButton} onPress={previewSpeechVoice}>
                <Text style={styles.fontButtonText}>试听</Text>
              </Pressable>
            </View>
            {!!speechVoiceMessage && <Text style={[styles.speechMessage, readerTheme === "night" && styles.nightMuted]}>{speechVoiceMessage}</Text>}
            <ScrollView style={styles.voiceList} nestedScrollEnabled>
              {availableSpeechVoices.map((voice) => {
                const selected = speechVoiceIdentifier === voice.identifier;
                return (
                  <Pressable key={voice.identifier} style={[styles.voiceOption, selected && styles.voiceOptionSelected, readerTheme === "night" && styles.nightVoiceOption]} onPress={() => { setSpeechVoiceIdentifier(voice.identifier); Speech.stop(); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceName, readerTheme === "night" && styles.nightText]}>{voice.name}</Text>
                      <Text style={[styles.voiceLanguage, readerTheme === "night" && styles.nightMuted]}>{voice.language} · {String(voice.quality).toLowerCase().includes("enhanced") ? "增强音质" : "标准音质"}</Text>
                    </View>
                    <Text style={styles.voiceSelected}>{selected ? "已选择" : "选择"}</Text>
                  </Pressable>
                );
              })}
              {!loadingSpeechVoices && availableSpeechVoices.length === 0 && <Text style={[styles.note, readerTheme === "night" && styles.nightMuted]}>没有读取到语音。可以点刷新重试。</Text>}
            </ScrollView>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>语速</Text>
              <Pressable style={styles.fontButton} onPress={() => setSpeechRate((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{speechRate.toFixed(1)}×</Text>
              <Pressable style={styles.fontButton} onPress={() => setSpeechRate((v) => Math.min(2, Math.round((v + 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>＋</Text></Pressable>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>音调</Text>
              <Pressable style={styles.fontButton} onPress={() => setSpeechPitch((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>−</Text></Pressable>
              <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{speechPitch.toFixed(1)}</Text>
              <Pressable style={styles.fontButton} onPress={() => setSpeechPitch((v) => Math.min(2, Math.round((v + 0.1) * 10) / 10))}><Text style={styles.fontButtonText}>＋</Text></Pressable>
            </View>
          </View>
        )}
        {readerChromeVisible && <View style={[styles.readerBottomBar, readerTheme === "night" && styles.nightCard]}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: readerTheme === "night" ? "#3A4038" : "#EEECE5" }}>
            <View style={{ height: 2, width: `${readingProgressPercent}%`, backgroundColor: "#7D8B70" }} />
          </View>
          <Pressable disabled={activeChapterIndex === 0 || showCatalog || loadingOnlineChapter} onPress={() => changeChapter(-1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (activeChapterIndex === 0 || showCatalog || loadingOnlineChapter) && styles.disabledText]}>上一章</Text>
          </Pressable>
          <Pressable onPress={() => { setShowSpeechSettings(false); setShowReaderSettings((value) => !value); }} style={styles.playerButton}>
            <Text style={styles.playerAction}>Aa 设置</Text>
          </Pressable>
          <Pressable onPress={openSpeechSettings} style={styles.playerButton}>
            <Text style={styles.playerAction}>声音</Text>
          </Pressable>
          <Pressable onPress={speakCurrentBook} style={styles.playerButton}>
            <Text style={styles.playerAction}>{isSpeaking ? "停止朗读" : "听书"}</Text>
          </Pressable>
          <Pressable disabled={activeChapterIndex === activeChapterCount - 1 || showCatalog || loadingOnlineChapter} onPress={() => changeChapter(1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (activeChapterIndex === activeChapterCount - 1 || showCatalog || loadingOnlineChapter) && styles.disabledText]}>下一章</Text>
          </Pressable>
        </View>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>MY LITTLE LIBRARY</Text>
          <Text style={styles.pageTitle}>{tab}</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>阅</Text></View>
      </View>

      {tab === "书架" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>WELCOME BACK</Text>
            <Text style={styles.welcomeTitle}>给自己一点，安静阅读的时间。</Text>
            <Text style={styles.welcomeSub}>你的故事，从这里继续。</Text>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索书架中的书名、作者"
            placeholderTextColor="#9A9A9A"
            style={styles.search}
            returnKeyType="search"
          />
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>我的书架</Text>
            <Text style={styles.sectionMeta}>{filteredBooks.length} 本藏书</Text>
          </View>
          {filteredBooks.length === 0 ? (
            <Text style={styles.emptyText}>没有找到相关书籍，试试其他关键词。</Text>
          ) : filteredBooks.map((book) => (
            <Pressable key={book.id} style={styles.bookRow} onPress={() => openBook(book)}>
              <BookCover book={book} />
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookAuthor}>{book.author} · {book.category}</Text>
                <Text style={styles.bookDescription} numberOfLines={2}>{book.description}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${book.progress}%` as `${number}%` }]} />
                </View>
                <Text style={styles.progressText}>{book.progress > 0 ? "已读 " + book.progress + "%" : "尚未开始"}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={styles.storageNote}>书架和阅读进度会保存在当前设备中。</Text>
        </ScrollView>
      )}

      {tab === "发现" && (
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>DISCOVER</Text>
            <Text style={styles.welcomeTitle}>搜索你想读的小说。</Text>
            <Text style={styles.welcomeSub}>通过已启用的 JSON 书源搜索，结果会自动去重。</Text>
          </View>
          <View style={styles.onlineSearchCard}>
            <TextInput
              value={onlineQuery}
              onChangeText={(value) => { setOnlineQuery(value); setSearchMessage(""); }}
              placeholder="输入小说名称或关键词"
              placeholderTextColor="#9A9A9A"
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={searchOnlineNovels}
              editable={!searching}
            />
            <Pressable style={[styles.onlineSearchButton, searching && styles.importButtonDisabled]} onPress={searchOnlineNovels} disabled={searching}>
              {searching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.importButtonText}>搜索小说</Text>}
            </Pressable>
            <Text style={styles.note}>当前支持返回常见 JSON 列表的书源；HTML 页面和复杂脚本规则尚未支持。</Text>
          </View>
          {!!searchSummary && <Text style={styles.searchSummary}>{searchSummary}</Text>}
          {searching && <View style={styles.searchLoading}><ActivityIndicator color="#65745D" /><Text style={styles.note}>正在搜索，请稍候…</Text></View>}
          {!!searchMessage && <Text style={styles.searchFeedback}>{searchMessage}</Text>}
          {onlineResults.map((item) => (
            <Pressable key={item.id} style={styles.onlineResultCard} onPress={() => openSearchNovel(item)}>
              <View style={styles.onlineResultInfo}>
                <Text style={styles.onlineResultTitle}>{item.title}</Text>
              </View>
              <Text style={styles.resultChevron}>›</Text>
            </Pressable>
          ))}
          {!searching && onlineResults.length === 0 && !searchMessage && (
            <Text style={styles.emptyText}>输入书名开始搜索。需要先在「书源」页导入并启用可用书源。</Text>
          )}
        </ScrollView>
      )}

      {tab === "书源" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>SOURCES</Text>
            <Text style={styles.welcomeTitle}>管理你的阅读来源。</Text>
            <Text style={styles.welcomeSub}>导入 JSON 配置，书源保存在本机。</Text>
          </View>
          <View style={styles.sourceCard}>
            <Text style={styles.sourceTitle}>导入 JSON 书源</Text>
            <Text style={styles.note}>支持单个/批量 JSON 配置，也可粘贴仓库订阅清单。订阅中只有提供完整 JSON 接口配置的书源会导入；脚本规则会跳过，不执行任意代码。</Text>
            <Pressable style={styles.exampleButton} onPress={() => { setSourceDraft(SOURCE_EXAMPLE); setSourceMessage("已填入示例模板，请替换为你有权访问的网站地址。"); }}>
              <Text style={styles.exampleButtonText}>填入 JSON 示例</Text>
            </Pressable>
            <TextInput value={sourceDraft} onChangeText={(value) => { setSourceDraft(value); setSourceMessage(""); }} placeholder="粘贴 JSON 书源配置或订阅清单…" placeholderTextColor="#A39F94" multiline autoCapitalize="none" style={styles.sourceInput} textAlignVertical="top" />
            <Pressable style={[styles.importButton, !sourceDraft.trim() && styles.importButtonDisabled]} disabled={!sourceDraft.trim()} onPress={importSource}>
              <Text style={styles.importButtonText}>校验并批量导入</Text>
            </Pressable>
            {!!sourceMessage && <Text style={styles.sourceMessage}>{sourceMessage}</Text>}
          </View>
          <View style={styles.sourceListHeading}>
            <Text style={styles.sectionTitle}>已导入书源</Text>
            <Text style={styles.sectionMeta}>{sources.filter((item) => item.enabled).length} / {sources.length} 个启用</Text>
          </View>
          {sources.length === 0 ? (
            <Text style={styles.emptyText}>还没有书源。你可以先用上方示例了解格式。</Text>
          ) : sources.map((source) => (
            <View key={source.id} style={styles.sourceItem}>
              <View style={styles.sourceItemInfo}>
                <Text style={styles.sourceItemTitle}>{source.name}</Text>
                <Text style={styles.sourceItemUrl} numberOfLines={1}>{source.baseUrl}</Text>
                <Text style={styles.sourceItemStatus}>{source.enabled ? "已启用" : "已停用"} · 搜索和目录请求会使用此书源</Text>
              </View>
              <View style={styles.sourceItemActions}>
                <Pressable onPress={() => setSources((current) => current.map((item) => item.id === source.id ? { ...item, enabled: !item.enabled } : item))} style={styles.sourceAction}>
                  <Text style={styles.sourceActionText}>{source.enabled ? "停用" : "启用"}</Text>
                </Pressable>
                <Pressable onPress={() => Alert.alert("删除书源", "确定删除「" + source.name + "」吗？", [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: () => setSources((current) => current.filter((item) => item.id !== source.id)) }])} style={styles.sourceAction}>
                  <Text style={styles.sourceDeleteText}>删除</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={styles.note}>安全提示：只导入你有权使用的书源。当前仅接受 HTTPS 公网地址，不支持本机/局域网地址；不会执行书源附带的脚本。</Text>
        </ScrollView>
      )}

      {tab === "我的" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>阅</Text></View>
            <Text style={styles.profileTitle}>我的阅读空间</Text>
            <Text style={styles.note}>本地阅读器 · 持续开发中</Text>
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>最近阅读</Text>
            <Text style={styles.sectionMeta}>{readingHistory.length} 条记录</Text>
          </View>
          {readingHistory.length === 0 ? <Text style={styles.emptyText}>还没有阅读记录，打开一本小说后会自动记录。</Text> : readingHistory.map((entry) => (
            <Pressable key={entry.bookId} style={styles.historyRow} onPress={() => resumeReadingHistory(entry)}>
              <View style={styles.historyInfo}>
                <Text style={styles.bookTitle}>{entry.title}</Text>
                <Text style={styles.bookAuthor}>{entry.author} · {entry.chapterTitle}</Text>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${entry.progress}%` as `${number}%` }]} /></View>
                <Text style={styles.progressText}>已读 {entry.progress}% · {new Date(entry.updatedAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <View style={styles.updateCard}>
            <View style={styles.updateHeader}>
              <View style={styles.updateIcon}><Text style={styles.updateIconText}>↻</Text></View>
              <View style={styles.updateHeaderInfo}>
                <Text style={styles.updateTitle}>应用在线更新</Text>
                <Text style={styles.updateVersion}>运行环境：{Updates.runtimeVersion || "开发预览版"}</Text>
              </View>
              {appUpdateBusy ? <ActivityIndicator color="#65745D" /> : null}
            </View>
            <Text style={styles.updateStatus}>{appUpdateStatus}</Text>
            {appUpdateCheckedAt ? <Text style={styles.updateTime}>上次检查：{new Date(appUpdateCheckedAt).toLocaleString()}</Text> : null}
            {appUpdateDownloaded ? (
              <Pressable style={styles.updatePrimaryButton} onPress={applyAppUpdate}>
                <Text style={styles.updatePrimaryText}>立即重启并应用更新</Text>
              </Pressable>
            ) : appUpdateAvailable ? (
              <Pressable style={[styles.updatePrimaryButton, appUpdateBusy && styles.updateButtonDisabled]} disabled={appUpdateBusy} onPress={downloadAppUpdate}>
                <Text style={styles.updatePrimaryText}>下载并安装更新</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.updateSecondaryButton, appUpdateBusy && styles.updateButtonDisabled]} disabled={appUpdateBusy} onPress={() => void checkForAppUpdate(false)}>
                <Text style={styles.updateSecondaryText}>{appUpdateBusy ? "正在检查…" : "检查更新"}</Text>
              </Pressable>
            )}
            <Text style={styles.updateFootnote}>普通界面、功能逻辑和资源可在线热更新；涉及 iOS 原生组件、权限或底层依赖的改动仍需重新构建安装。</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>本地书架数据</Text>
            <Text style={styles.settingValue}>已启用</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>系统语音朗读</Text>
            <Text style={styles.settingValue}>已启用</Text>
          </View>
          <Pressable style={styles.settingRow} onPress={() => Alert.alert("私人小说", "当前版本为开发预览版，书源和章节功能正在建设中。")}>
            <Text style={styles.settingText}>关于私人小说</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </ScrollView>
      )}

      <View style={styles.tabBar}>
        {(["书架", "发现", "书源", "我的"] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => { setTab(item); setQuery(""); }} style={styles.tabItem}>
            <Text style={[styles.tabIcon, tab === item && styles.tabIconActive]}>
              {item === "书架" ? "▤" : item === "发现" ? "⌕" : item === "书源" ? "◈" : "◯"}
            </Text>
            <Text style={[styles.tabLabel, tab === item && styles.tabLabelActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={appUpdateAvailable || appUpdateDownloaded}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.forceUpdateOverlay}>
          <View style={styles.forceUpdateCard}>
            <View style={styles.forceUpdateIcon}>
              <Text style={styles.forceUpdateIconText}>↑</Text>
            </View>
            <Text style={styles.forceUpdateTitle}>发现新版本</Text>
            <Text style={styles.forceUpdateSubtitle}>私人小说需要更新后才能继续使用</Text>
            <View style={styles.forceUpdateNotice}>
              <Text style={styles.forceUpdateNoticeText}>
                {appUpdateDownloaded
                  ? "更新包已下载完成。重启应用后将自动切换到新版本。"
                  : appUpdateBusy
                    ? "正在安全下载更新内容，请保持网络连接并稍候…"
                    : appUpdateStatus}
              </Text>
            </View>
            {appUpdateBusy ? (
              <View style={styles.forceUpdateProgress}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.forceUpdateProgressText}>正在更新，请勿关闭应用</Text>
              </View>
            ) : appUpdateDownloaded ? (
              <Pressable style={styles.forceUpdateButton} onPress={applyAppUpdate}>
                <Text style={styles.forceUpdateButtonText}>立即重启并更新</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.forceUpdateButton} onPress={downloadAppUpdate}>
                <Text style={styles.forceUpdateButtonText}>下载并安装更新</Text>
              </Pressable>
            )}
            {!appUpdateBusy && !appUpdateDownloaded ? (
              <Pressable style={styles.forceUpdateRetry} onPress={() => void checkForAppUpdate(false)}>
                <Text style={styles.forceUpdateRetryText}>重新检查更新</Text>
              </Pressable>
            ) : null}
            <Text style={styles.forceUpdateFootnote}>这是必需更新，暂不支持跳过。更新失败时可检查网络后重试。</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F7F3" },
  loading: { alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#777368", marginTop: 14, fontSize: 13 },
  topBar: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#9A927F", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  pageTitle: { color: "#25251F", fontSize: 30, fontWeight: "800", marginTop: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#E9E5DA", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6F695B", fontSize: 17, fontWeight: "700" },
  pageContent: { paddingHorizontal: 22, paddingBottom: 30 },
  welcomeCard: { backgroundColor: "#343B32", borderRadius: 22, padding: 22, marginBottom: 20 },
  welcomeEyebrow: { color: "#C7CDBE", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  welcomeTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 31, fontWeight: "700", marginTop: 13, maxWidth: 270 },
  welcomeSub: { color: "#D0D4C9", fontSize: 13, marginTop: 10 },
  search: { height: 48, borderRadius: 14, backgroundColor: "#FFFFFF", paddingHorizontal: 16, color: "#25251F", fontSize: 14, marginBottom: 25, borderWidth: 1, borderColor: "#EEECE5" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  sectionTitle: { color: "#292A24", fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sectionMeta: { color: "#999486", fontSize: 12 },
  bookRow: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 17, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#F0EEE8" },
  cover: { width: 76, height: 104, borderRadius: 8, padding: 9, justifyContent: "space-between" },
  coverTitle: { color: "#45483E", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  coverRule: { height: 1, backgroundColor: "#77786C", opacity: 0.35 },
  coverAuthor: { color: "#66695F", fontSize: 9 },
  bookInfo: { flex: 1, paddingLeft: 13, paddingVertical: 2 },
  bookTitle: { color: "#292A24", fontSize: 16, fontWeight: "800" },
  bookAuthor: { color: "#928D80", fontSize: 11, marginTop: 5 },
  bookDescription: { color: "#77766E", fontSize: 11, lineHeight: 17, marginTop: 8 },
  progressTrack: { height: 3, backgroundColor: "#EEECE5", borderRadius: 3, marginTop: 10 },
  progressFill: { height: 3, backgroundColor: "#75836B", borderRadius: 3 },
  progressText: { color: "#989487", fontSize: 10, marginTop: 5 },
  emptyText: { color: "#888477", textAlign: "center", paddingVertical: 30, fontSize: 13 },
  storageNote: { color: "#AAA69B", fontSize: 11, textAlign: "center", marginTop: 12 },
  onlineSearchCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#EEECE5", marginBottom: 16 },
  searchInput: { minHeight: 48, borderRadius: 12, backgroundColor: "#F8F7F3", paddingHorizontal: 14, color: "#25251F", fontSize: 14, borderWidth: 1, borderColor: "#EEECE5" },
  onlineSearchButton: { alignItems: "center", justifyContent: "center", minHeight: 46, backgroundColor: "#65745D", borderRadius: 12, marginTop: 10 },
  searchSummary: { color: "#65745D", fontSize: 12, lineHeight: 18, marginBottom: 12 },
  searchLoading: { alignItems: "center", paddingVertical: 18 },
  searchFeedback: { color: "#9A6A50", fontSize: 12, lineHeight: 19, marginBottom: 12 },
  onlineResultCard: { backgroundColor: "#FFFFFF", borderRadius: 15, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: "#EEECE5" },
  detailHeader: { height: 54, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailHero: { backgroundColor: "#343B32", borderRadius: 20, padding: 22, marginBottom: 18 },
  detailTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 32, fontWeight: "800" },
  detailAuthor: { color: "#D0D4C9", fontSize: 13, marginTop: 10 },
  detailSection: { backgroundColor: "#FFFFFF", borderRadius: 17, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: "#EEECE5" },
  detailDescription: { color: "#66665D", fontSize: 14, lineHeight: 24 },
  catalogLoadButton: { alignItems: "center", justifyContent: "center", minHeight: 46, backgroundColor: "#65745D", borderRadius: 12, marginTop: 14 },
  sourceSortRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  sourceSortButton: { flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: "#F1F0EA", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#EEECE5" },
  sourceSortButtonActive: { backgroundColor: "#E9EEE5", borderColor: "#829078" },
  sourceSortText: { color: "#777368", fontSize: 12, fontWeight: "700" },
  sourceSortTextActive: { color: "#65745D" },
  sourceChoice: { minHeight: 62, backgroundColor: "#F8F7F3", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#EEECE5" },
  sourceChoiceSelected: { borderColor: "#829078", backgroundColor: "#F0F2EC" },
  sourceChoiceInfo: { flex: 1 },
  sourceChoiceName: { color: "#33352D", fontSize: 13, fontWeight: "700" },
  sourceChoiceLatency: { color: "#8D897F", fontSize: 10, marginTop: 5 },
  recommendTag: { color: "#65745D", fontSize: 10, fontWeight: "800", marginRight: 8 },
  selectedTag: { color: "#65745D", fontSize: 10, fontWeight: "800" },
  resultChevron: { color: "#A39F94", fontSize: 24, marginLeft: 10 },
  onlineResultInfo: { flex: 1 },
  onlineResultTitle: { color: "#292A24", fontSize: 16, fontWeight: "800" },
  onlineResultAuthor: { color: "#8D897F", fontSize: 11, marginTop: 5 },
  onlineResultDescription: { color: "#77766E", fontSize: 12, lineHeight: 18, marginTop: 8 },
  onlineResultUrl: { color: "#A09B8E", fontSize: 9, marginTop: 8 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 5 },
  categoryCard: { width: "30%", minHeight: 82, borderRadius: 16, backgroundColor: "#EAE9E1", alignItems: "center", justifyContent: "center" },
  categoryText: { color: "#55594D", fontSize: 16, fontWeight: "700" },
  note: { color: "#918D82", fontSize: 12, lineHeight: 19, marginTop: 12 },
  sourceCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#EEECE5" },
  sourceTitle: { color: "#33352D", fontSize: 16, fontWeight: "800" },
  sourceInput: { minHeight: 170, backgroundColor: "#F8F7F3", borderRadius: 12, borderWidth: 1, borderColor: "#EEECE5", padding: 12, marginTop: 14, color: "#33352D", fontSize: 12, fontFamily: "monospace" },
  exampleButton: { alignSelf: "flex-start", marginTop: 14, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#EEF0E9" },
  exampleButtonText: { color: "#65745D", fontSize: 12, fontWeight: "700" },
  importButton: { alignItems: "center", backgroundColor: "#65745D", borderRadius: 12, paddingVertical: 13, marginTop: 12 },
  importButtonDisabled: { opacity: 0.45 },
  importButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sourceMessage: { color: "#65745D", fontSize: 12, lineHeight: 18, marginTop: 10 },
  sourceListHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
  sourceItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 15, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEECE5" },
  sourceItemInfo: { flex: 1, paddingRight: 8 },
  sourceItemTitle: { color: "#33352D", fontSize: 14, fontWeight: "800" },
  sourceItemUrl: { color: "#8D897F", fontSize: 10, marginTop: 5 },
  sourceItemStatus: { color: "#8D987F", fontSize: 10, marginTop: 5 },
  sourceItemActions: { alignItems: "flex-end", gap: 9 },
  sourceAction: { paddingVertical: 5, paddingHorizontal: 9, backgroundColor: "#EEF0E9", borderRadius: 8 },
  sourceActionText: { color: "#65745D", fontSize: 11, fontWeight: "700" },
  sourceDeleteText: { color: "#A66D62", fontSize: 11, fontWeight: "700" },
  historyRow: { minHeight: 76, backgroundColor: "#FFFFFF", borderRadius: 15, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#EEECE5" },
  historyInfo: { flex: 1, paddingRight: 10 },
  updateCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 17, marginBottom: 16, borderWidth: 1, borderColor: "#EAE8E0" },
  updateHeader: { flexDirection: "row", alignItems: "center" },
  updateIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EEF0E9", alignItems: "center", justifyContent: "center", marginRight: 12 },
  updateIconText: { color: "#65745D", fontSize: 26, fontWeight: "700" },
  updateHeaderInfo: { flex: 1 },
  updateTitle: { color: "#33352D", fontSize: 15, fontWeight: "800" },
  updateVersion: { color: "#999486", fontSize: 10, marginTop: 5 },
  updateStatus: { color: "#65745D", fontSize: 12, lineHeight: 19, marginTop: 14 },
  updateTime: { color: "#AAA69B", fontSize: 10, marginTop: 4 },
  updatePrimaryButton: { minHeight: 43, borderRadius: 11, backgroundColor: "#65745D", alignItems: "center", justifyContent: "center", marginTop: 13 },
  updatePrimaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  updateSecondaryButton: { minHeight: 43, borderRadius: 11, backgroundColor: "#EEF0E9", alignItems: "center", justifyContent: "center", marginTop: 13 },
  updateSecondaryText: { color: "#65745D", fontSize: 12, fontWeight: "800" },
  updateButtonDisabled: { opacity: 0.5 },
  updateFootnote: { color: "#AAA69B", fontSize: 10, lineHeight: 16, marginTop: 11 },
  forceUpdateOverlay: { flex: 1, backgroundColor: "rgba(24, 27, 23, 0.78)", alignItems: "center", justifyContent: "center", paddingHorizontal: 25 },
  forceUpdateCard: { width: "100%", maxWidth: 390, backgroundColor: "#F8F7F3", borderRadius: 24, padding: 24, alignItems: "center" },
  forceUpdateIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#E7ECE2", alignItems: "center", justifyContent: "center", marginBottom: 17 },
  forceUpdateIconText: { color: "#65745D", fontSize: 34, fontWeight: "800" },
  forceUpdateTitle: { color: "#292A24", fontSize: 22, fontWeight: "800" },
  forceUpdateSubtitle: { color: "#77766E", fontSize: 12, marginTop: 9, textAlign: "center" },
  forceUpdateNotice: { width: "100%", backgroundColor: "#EEEFE9", borderRadius: 13, padding: 14, marginTop: 20 },
  forceUpdateNoticeText: { color: "#62665B", fontSize: 12, lineHeight: 19, textAlign: "center" },
  forceUpdateProgress: { width: "100%", minHeight: 46, borderRadius: 12, backgroundColor: "#65745D", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 17 },
  forceUpdateProgressText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  forceUpdateButton: { width: "100%", minHeight: 48, borderRadius: 12, backgroundColor: "#65745D", alignItems: "center", justifyContent: "center", marginTop: 17 },
  forceUpdateButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  forceUpdateRetry: { paddingVertical: 12, paddingHorizontal: 18, marginTop: 4 },
  forceUpdateRetryText: { color: "#65745D", fontSize: 12, fontWeight: "700" },
  forceUpdateFootnote: { color: "#AAA69B", fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 12 },
  profileCard: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 25, marginBottom: 16 },
  avatarLarge: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#E9E5DA", alignItems: "center", justifyContent: "center" },
  avatarLargeText: { color: "#6F695B", fontSize: 25, fontWeight: "800" },
  profileTitle: { color: "#292A24", fontSize: 18, fontWeight: "800", marginTop: 12 },
  settingRow: { height: 55, backgroundColor: "#FFFFFF", borderRadius: 13, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  settingText: { color: "#44443D", fontSize: 14 },
  settingValue: { color: "#75836B", fontSize: 12 },
  chevron: { color: "#A39F94", fontSize: 24 },
  tabBar: { height: 68, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingBottom: 5 },
  tabItem: { alignItems: "center", justifyContent: "center", width: "25%" },
  tabIcon: { color: "#AAA69B", fontSize: 20, height: 25 },
  tabIconActive: { color: "#65745D" },
  tabLabel: { color: "#AAA69B", fontSize: 10, marginTop: 2 },
  tabLabelActive: { color: "#65745D", fontWeight: "800" },
  catalogContent: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 35 },
  catalogHeading: { color: "#292A24", fontSize: 23, fontWeight: "800" },
  catalogSub: { color: "#999486", fontSize: 12, marginTop: 8, marginBottom: 20 },
  chapterRow: { minHeight: 62, backgroundColor: "#FFFFFF", borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chapterRowActive: { borderWidth: 1, borderColor: "#829078", backgroundColor: "#F0F2EC" },
  chapterRowTitle: { color: "#383A32", fontSize: 14, fontWeight: "600", flex: 1 },
  chapterRowMeta: { color: "#87917E", fontSize: 10, marginLeft: 8 },
  catalogDisclaimer: { color: "#A09B8E", fontSize: 11, lineHeight: 18, marginTop: 10 },
  readerSettings: { maxHeight: 300, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", paddingHorizontal: 14, paddingVertical: 9 },
  readerSettingRow: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  speechSettings: { maxHeight: 370 },
  speechHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  speechMessage: { color: "#65745D", fontSize: 11, marginVertical: 7 },
  voiceList: { maxHeight: 150, marginVertical: 5 },
  voiceOption: { minHeight: 48, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: "#F8F7F3", flexDirection: "row", alignItems: "center", marginBottom: 6 },
  voiceOptionSelected: { borderWidth: 1, borderColor: "#829078", backgroundColor: "#EEF0E9" },
  nightVoiceOption: { backgroundColor: "#353B33" },
  voiceName: { color: "#33352D", fontSize: 12, fontWeight: "700" },
  voiceLanguage: { color: "#8D897F", fontSize: 10, marginTop: 3 },
  voiceSelected: { color: "#65745D", fontSize: 10, fontWeight: "800" },
  settingsLabel: { color: "#777368", fontSize: 11 },
  fontButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#EEF0E9" },
  fontButtonText: { color: "#65745D", fontWeight: "800", fontSize: 12 },
  fontSizeValue: { color: "#45453D", fontSize: 12, minWidth: 18, textAlign: "center" },
  themeButton: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12, backgroundColor: "#EEF0E9" },
  modeButtonActive: { backgroundColor: "#DDE5D6", borderWidth: 1, borderColor: "#8A9A7C" },
  readerBottomBar: { minHeight: 64, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", paddingHorizontal: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chapterNavButton: { paddingVertical: 10, paddingHorizontal: 7 },
  chapterNavText: { color: "#65745D", fontSize: 11, fontWeight: "700" },
  disabledText: { color: "#C5C2B9" },
  nightCard: { backgroundColor: "#2B2F29", borderColor: "#3A4038" },
  nightText: { color: "#E6E3D9" },
  nightMuted: { color: "#A9AA9F" },
  readerHeader: { height: 54, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backText: { color: "#68765F", fontSize: 15, fontWeight: "600" },
  readerHeaderTitle: { color: "#777368", fontSize: 12 },
  headerAction: { color: "#68765F", fontSize: 15, fontWeight: "700" },
  readerContent: { paddingHorizontal: 27, paddingTop: 45, paddingBottom: 50 },
  chapterLabel: { color: "#9B9688", fontSize: 12, letterSpacing: 1, textAlign: "center" },
  readerTitle: { color: "#2B2C25", fontSize: 25, fontWeight: "800", textAlign: "center", marginTop: 18, marginBottom: 42 },
  readerParagraph: { color: "#45453D", fontSize: 18, lineHeight: 34, letterSpacing: 0.4 },
  readerFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 55 },
  muted: { color: "#A09B8E", fontSize: 11 },
  playerBar: { minHeight: 60, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  playerHint: { color: "#6F6B61", fontSize: 12, fontWeight: "700" },
  playerSub: { color: "#AAA69B", fontSize: 10, marginTop: 4 },
  playerButton: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: "#EEF0E9", borderRadius: 20 },
  playerAction: { color: "#65745D", fontWeight: "800", fontSize: 12 },
});
