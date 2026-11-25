import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import type { NovelSource } from "./src/source";
import { parseSourceSubscription } from "./src/source-subscription";
import { normalizeBookAlias, parseBookAliasDictionary } from "./src/book-alias-dictionary";
import { searchNovelSource } from "./src/source-search";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "./src/source-catalog";
import { normalizeNovelTitle, type NovelSummary, type NovelSearchPage, type NovelDetail, type NovelChapter } from "./src/novel";
import { compareChapterUpdates } from "./src/subscription";
import { DEFAULT_READER_SETTINGS, normalizeReaderSettings, type PageTurnMode, type ReaderSettings, type ReaderTheme } from "./src/reader-settings";
import { getReadingParagraphIndex, getReadingScrollOffset, splitReadingText } from "./src/reading-progress";
import { getOrFetchChapterContent, prefetchNextChapters } from "./src/chapter-cache";
import { normalizeReadingHistory, upsertReadingHistory, type ReadingHistoryEntry } from "./src/reading-history";
import { parseLocalTextBook, type LocalTextChapter } from "./src/local-book";
import {
  AppState,
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
  Share,
  Image,
  Animated,
  Easing,
} from "react-native";

type Tab = "书架" | "搜索" | "源" | "我的";
type Book = {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  progress: number;
  color: string;
  coverUrl?: string;
  lastChapter?: string;
  chapterIndex?: number;
  onlineSourceId?: string;
  onlineSourceName?: string;
  onlineSummary?: NovelSummary;
  onlineChapters?: NovelChapter[];
  onlineChapterId?: string;
  onlineLastCheckedAt?: number;
  unreadUpdateCount?: number;
  readerParagraphIndex?: number;
  localFileUri?: string;
  localFileName?: string;
  localChapterCount?: number;
};

const STORAGE_KEY = "@private_novel/books_v1";
const SOURCES_STORAGE_KEY = "@private_novel/sources_v1";
const SUBSCRIPTION_URLS_STORAGE_KEY = "@private_novel/subscription_urls_v1";
const BOOK_ALIAS_MAP_STORAGE_KEY = "@private_novel/book_alias_map_v1";
const DEFAULT_SUBSCRIPTION_URL = "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/subscription.json";
const READER_SETTINGS_STORAGE_KEY = "@private_novel/reader_settings_v1";
const READING_HISTORY_STORAGE_KEY = "@private_novel/reading_history_v1";
const SEARCH_LOGS_STORAGE_KEY = "@private_novel/search_logs_v1";
const SEARCH_HISTORY_STORAGE_KEY = "@private_novel/search_history_v1";
const SHELF_VIEW_STORAGE_KEY = "@private_novel/shelf_view_v1";
const APPEARANCE_STORAGE_KEY = "@private_novel/appearance_v1";
type SearchSourceOption = { summary: NovelSummary; latencyMs: number; chapterCount?: number | null; chapterError?: string };
type SearchNovelGroup = { id: string; title: string; author: string; description: string; coverUrl?: string; sources: SearchSourceOption[] };
type SearchLogEntry = { id: string; sourceId: string; sourceName: string; keyword: string; ok: boolean; resultCount: number; error?: string; searchedAt: number };
type Chapter = { title: string; content: string };
const HOT_SEARCH_TERMS = ["斗罗大陆", "斗破苍穹", "凡人修仙传", "仙逆", "遮天", "诡秘之主", "全职高手"];
const SAMPLE_CHAPTERS: Chapter[] = [
  { title: "第一章 · 故事的开始", content: "清晨的光从窗边慢慢铺开，新的旅程也在这一刻开始。\n\n这是用于测试阅读器的演示章节。正式接入书源后，这里会显示所选小说的真实章节正文。\n\n阅读器会记录你读到的章节，方便下次从上次的位置继续。\n\n请注意：当前内容仅为应用内置演示文本，并非真实小说正文。" },
  { title: "第二章 · 远方来信", content: "桌面上多了一封没有署名的信。信纸很薄，字迹却清晰。\n\n这是一段演示文本，用来检查章节切换、目录跳转和阅读位置保存是否正常。\n\n真正的章节内容将在后续接入经过授权的在线书源或用户导入的本地文本后展示。" },
  { title: "第三章 · 向前一步", content: "有些答案需要亲自走出去才能找到。合上信纸，他决定在今天启程。\n\n你现在看到的是第三段演示内容。可以通过底部按钮切换章节，也可以打开目录直接跳转。\n\n章节阅读进度会保存在当前设备。" },
];




function getSourceClient(_source: NovelSource) {
  return undefined;
}

function getOnlineBookId(title: string, author: string): string {
  return "online:" + normalizeNovelTitle(title) + "::" + normalizeNovelTitle(author);
}

function BookCover({ book, grid = false, failedCoverUrls, onCoverError }: {
  book: Book;
  grid?: boolean;
  failedCoverUrls?: Record<string, boolean>;
  onCoverError?: (url: string) => void;
}) {
  const coverUrl = book.coverUrl || book.onlineSummary?.coverUrl;
  if (coverUrl && !failedCoverUrls?.[coverUrl]) {
    return (
      <Image
        source={{ uri: coverUrl }}
        style={[styles.cover, grid && styles.gridCover]}
        resizeMode="cover"
        onError={() => onCoverError?.(coverUrl)}
      />
    );
  }
  return (
    <View style={[styles.cover, grid && styles.gridCover, { backgroundColor: book.color || "#E5E9DF" }]}>
      <Text style={styles.coverTitle} numberOfLines={3}>{book.title}</Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverAuthor}>{book.author}</Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("书架");
  const [appearanceMode, setAppearanceMode] = useState<"light" | "dark">("light");
  const appIsDark = appearanceMode === "dark";
  const [shelfView, setShelfView] = useState<"list" | "grid">("grid");
  const autoSubscriptionCheckRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [showReadingHistory, setShowReadingHistory] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const [chapterIndex, setChapterIndex] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(DEFAULT_READER_SETTINGS.fontSize);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(DEFAULT_READER_SETTINGS.theme);
  const [readerLineSpacing, setReaderLineSpacing] = useState(DEFAULT_READER_SETTINGS.lineSpacing);
  const [readerParagraphSpacing, setReaderParagraphSpacing] = useState(DEFAULT_READER_SETTINGS.paragraphSpacing);
  const [readerHorizontalPadding, setReaderHorizontalPadding] = useState(DEFAULT_READER_SETTINGS.horizontalPadding);
  const [readerMode, setReaderMode] = useState<PageTurnMode>(DEFAULT_READER_SETTINGS.pageTurnMode);
  const [readerParagraphIndex, setReaderParagraphIndex] = useState(0);
  const [readerChromeVisible, setReaderChromeVisible] = useState(true);
  const readerTapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [readerContentHeight, setReaderContentHeight] = useState(0);
  const [readerViewportHeight, setReaderViewportHeight] = useState(0);
  const readerScrollRef = useRef<ScrollView | null>(null);
  const pageTurnProgress = useRef(new Animated.Value(0)).current;
  const restoreReaderPositionRef = useRef(false);
  const [sources, setSources] = useState<NovelSource[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"全部" | "成功源" | "失败源">("全部");
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [testingSourceIds, setTestingSourceIds] = useState<string[]>([]);
  const [sourceTestMessage, setSourceTestMessage] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState(DEFAULT_SUBSCRIPTION_URL);
  const [subscriptionUrlMessage, setSubscriptionUrlMessage] = useState("");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const defaultSubscriptionAttemptedRef = useRef(false);
  const [onlineQuery, setOnlineQuery] = useState("");
  const [bookAliasMap, setBookAliasMap] = useState<Record<string, string>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [onlineResults, setOnlineResults] = useState<SearchNovelGroup[]>([]);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, boolean>>({});
  const [chapterSortOrder, setChapterSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedSearchNovel, setSelectedSearchNovel] = useState<SearchNovelGroup | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchLogs, setSearchLogs] = useState<SearchLogEntry[]>([]);
  const [showSearchLogs, setShowSearchLogs] = useState(false);
  const [searchLogFilter, setSearchLogFilter] = useState<"成功" | "失败">("成功");
  const [selectedSearchLogIds, setSelectedSearchLogIds] = useState<string[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchSummary, setSearchSummary] = useState("");
  const [loadedNovelDetail, setLoadedNovelDetail] = useState<NovelDetail | null>(null);
  const [loadedChapters, setLoadedChapters] = useState<NovelChapter[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [onlineReading, setOnlineReading] = useState(false);
  const [localReading, setLocalReading] = useState(false);
  const [localChapters, setLocalChapters] = useState<LocalTextChapter[]>([]);
  const [onlineChapterIndex, setOnlineChapterIndex] = useState(0);
  const [onlineChapterContent, setOnlineChapterContent] = useState("");
  const [onlineChapterTitle, setOnlineChapterTitle] = useState("");
  const [loadingOnlineChapter, setLoadingOnlineChapter] = useState(false);
  const [openedFromShelf, setOpenedFromShelf] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [appUpdateDownloaded, setAppUpdateDownloaded] = useState(false);
  const [appUpdateBusy, setAppUpdateBusy] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState("尚未检查");
  const [appUpdateCheckedAt, setAppUpdateCheckedAt] = useState<number | null>(null);
  const [appUpdateDismissed, setAppUpdateDismissed] = useState(false);
  const appUpdateOperationRef = useRef(false);
  const lastAutomaticUpdateCheckRef = useRef(0);

  const checkForAppUpdate = async (silent = false) => {
    if (__DEV__) {
      setAppUpdateStatus("开发预览模式暂不支持在线热更新检查");
      return;
    }
    if (!Updates.isEnabled) {
      setAppUpdateStatus("更新服务尚未完成云端配置；完成首次正式构建后即可启用");
      return;
    }
    if (appUpdateOperationRef.current) return;
    appUpdateOperationRef.current = true;
    setAppUpdateBusy(true);
    if (!silent) setAppUpdateStatus("正在连接更新服务器…");
    try {
      const result = await Updates.checkForUpdateAsync();
      setAppUpdateCheckedAt(Date.now());
      if (result.isAvailable) {
        setAppUpdateAvailable(true);
        setAppUpdateDismissed(false);
        if (silent) {
          setAppUpdateStatus("发现新版本，正在后台下载…");
          const downloaded = await Updates.fetchUpdateAsync();
          if (downloaded.isNew) {
            setAppUpdateDownloaded(true);
            setAppUpdateAvailable(false);
            setAppUpdateStatus("更新已在后台下载完成。你可以立即重启应用，或稍后再应用。");
          } else {
            setAppUpdateStatus("发现更新，但暂时没有可下载的新内容。");
          }
        } else {
          setAppUpdateDownloaded(false);
          setAppUpdateStatus("发现可用更新。你可以现在下载，也可以稍后更新。");
        }
      } else {
        setAppUpdateAvailable(false);
        setAppUpdateDownloaded(false);
        setAppUpdateStatus("当前已是最新版本");
      }
    } catch {
      lastAutomaticUpdateCheckRef.current = 0;
      setAppUpdateStatus("更新检查或后台下载失败，当前版本仍可继续使用。回到前台后会再次尝试。");
    } finally {
      appUpdateOperationRef.current = false;
      setAppUpdateBusy(false);
    }
  };

  const downloadAppUpdate = async () => {
    if (!Updates.isEnabled || appUpdateOperationRef.current) return;
    appUpdateOperationRef.current = true;
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
      setAppUpdateStatus("更新下载失败，当前版本仍可继续使用。请检查网络后重试。");
    } finally {
      appUpdateOperationRef.current = false;
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
    const checkIfDue = () => {
      // Check on launch and when returning to the foreground, at most once
      // every six hours. This avoids repeated requests while the app is active.
      if (Date.now() - lastAutomaticUpdateCheckRef.current < 6 * 60 * 60 * 1000) return;
      lastAutomaticUpdateCheckRef.current = Date.now();
      void checkForAppUpdate(true);
    };
    checkIfDue();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkIfDue();
    });
    return () => subscription.remove();
  }, [isLoaded]);

  useEffect(() => {
    let active = true;
    const loadBooks = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && active) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) setBooks((parsed as Book[]).filter((book) => !["1", "2", "3"].includes(book.id)));
        }
        const savedSources = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
        if (savedSources && active) {
          const parsedSources: unknown = JSON.parse(savedSources);
          if (Array.isArray(parsedSources)) {
            setSources(parsedSources as NovelSource[]);
          } else {
            setSources([]);
          }
        } else if (active) {
          setSources([]);
        }
        const savedAliases = await AsyncStorage.getItem(BOOK_ALIAS_MAP_STORAGE_KEY);
        if (savedAliases && active) {
          const parsedAliases: unknown = JSON.parse(savedAliases);
          if (parsedAliases && typeof parsedAliases === "object" && !Array.isArray(parsedAliases)) {
            const safeAliases: Record<string, string> = Object.create(null);
            for (const [key, value] of Object.entries(parsedAliases as Record<string, unknown>)) {
              if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
              if (typeof value === "string" && value.trim()) safeAliases[key] = value.trim();
            }
            setBookAliasMap(safeAliases);
          }
        }
        const savedSubscriptionUrls = await AsyncStorage.getItem(SUBSCRIPTION_URLS_STORAGE_KEY);
        if (savedSubscriptionUrls && active) {
          const parsedUrls: unknown = JSON.parse(savedSubscriptionUrls);
          if (parsedUrls && typeof parsedUrls === "object") {
            const urls = parsedUrls as { url?: unknown; normal?: unknown };
            const legacySubscriptionUrl = "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/app-subscription.json";
            if (typeof urls.url === "string" && urls.url.trim()) {
              setSubscriptionUrl(urls.url === legacySubscriptionUrl ? DEFAULT_SUBSCRIPTION_URL : urls.url);
            } else if (typeof urls.normal === "string" && urls.normal.trim() && urls.normal !== DEFAULT_SUBSCRIPTION_URL) {
              setSubscriptionUrl(urls.normal === legacySubscriptionUrl ? DEFAULT_SUBSCRIPTION_URL : urls.normal);
            } else {
              setSubscriptionUrl(DEFAULT_SUBSCRIPTION_URL);
            }
          }
        }
        const savedShelfView = await AsyncStorage.getItem(SHELF_VIEW_STORAGE_KEY);
        if (active) setShelfView(savedShelfView === "list" ? "list" : "grid");
        const savedAppearance = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
        setAppearanceMode(savedAppearance === "dark" ? "dark" : "light");
        const savedSearchHistory = await AsyncStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
        if (savedSearchHistory && active) {
          const parsedHistory: unknown = JSON.parse(savedSearchHistory);
          if (Array.isArray(parsedHistory)) {
            const normalizedHistory = parsedHistory.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
            setSearchHistory([...new Set(normalizedHistory.map((item) => item.trim()))].slice(0, 10));
          }
        }
        const savedSearchLogs = await AsyncStorage.getItem(SEARCH_LOGS_STORAGE_KEY);
        if (savedSearchLogs && active) {
          const parsedLogs: unknown = JSON.parse(savedSearchLogs);
          if (Array.isArray(parsedLogs)) setSearchLogs(parsedLogs as SearchLogEntry[]);
        }
        const savedHistory = await AsyncStorage.getItem(READING_HISTORY_STORAGE_KEY);
        if (savedHistory && active) setReadingHistory(normalizeReadingHistory(JSON.parse(savedHistory)));
        const savedReaderSettings = await AsyncStorage.getItem(READER_SETTINGS_STORAGE_KEY);
        if (savedReaderSettings && active) {
          const settings = normalizeReaderSettings(JSON.parse(savedReaderSettings));
          setReaderFontSize(settings.fontSize);
          setReaderTheme(settings.theme);
          setReaderMode(settings.pageTurnMode);
          setReaderLineSpacing(settings.lineSpacing);
          setReaderParagraphSpacing(settings.paragraphSpacing);
          setReaderHorizontalPadding(settings.horizontalPadding);
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
    AsyncStorage.setItem(SUBSCRIPTION_URLS_STORAGE_KEY, JSON.stringify({ url: subscriptionUrl })).catch(() => {
      setSubscriptionUrlMessage("订阅地址保存失败，请稍后重试。");
    });
  }, [subscriptionUrl, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(BOOK_ALIAS_MAP_STORAGE_KEY, JSON.stringify(bookAliasMap)).catch(() => {
      setSubscriptionUrlMessage("别名库缓存保存失败，请稍后重试。");
    });
  }, [bookAliasMap, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(SHELF_VIEW_STORAGE_KEY, shelfView).catch(() => undefined);
  }, [shelfView, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, appearanceMode).catch(() => undefined);
  }, [appearanceMode, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(SEARCH_LOGS_STORAGE_KEY, JSON.stringify(searchLogs.slice(0, 500))).catch(() => undefined);
  }, [searchLogs, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory.slice(0, 10))).catch(() => undefined);
  }, [searchHistory, isLoaded]);

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
    const settings: ReaderSettings = normalizeReaderSettings({ fontSize: readerFontSize, theme: readerTheme, pageTurnMode: readerMode, lineSpacing: readerLineSpacing, paragraphSpacing: readerParagraphSpacing, horizontalPadding: readerHorizontalPadding });
    AsyncStorage.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {
      Alert.alert("保存失败", "阅读设置暂时未能保存，请检查手机存储空间。");
    });
  }, [readerFontSize, readerTheme, readerMode, readerLineSpacing, readerParagraphSpacing, readerHorizontalPadding, isLoaded]);

  useEffect(() => {
    if (!restoreReaderPositionRef.current || readerContentHeight <= 0 || readerViewportHeight <= 0) return;
    const text = onlineReading ? onlineChapterContent : localReading ? (localChapters[chapterIndex]?.content || "") : (selectedBook?.description || "") + "\n\n" + (SAMPLE_CHAPTERS[chapterIndex]?.content || "");
    const count = splitReadingText(text).length;
    const maxOffset = Math.max(0, readerContentHeight - readerViewportHeight);
    readerScrollRef.current?.scrollTo({ y: getReadingScrollOffset(readerParagraphIndex, count, maxOffset), animated: false });
    restoreReaderPositionRef.current = false;
  }, [readerContentHeight, readerViewportHeight, readerParagraphIndex, onlineReading, onlineChapterContent, chapterIndex, selectedBook?.id]);

  const updateSourceHealth = (sourceId: string, stages: NonNullable<NovelSource["healthStages"]>, level: "完全可用" | "部分可用" | "不可用") => {
    setSources((current) => current.map((item) => item.id === sourceId ? { ...item, healthStatus: level === "完全可用" ? "success" : "failed", healthLevel: level, healthCheckedAt: Date.now(), healthStages: stages, healthMessage: Object.entries(stages).map(([key, value]) => key + "：" + (value.ok ? "通过" : value.message)).join("；") } : item));
  };

  const testOneSource = async (source: NovelSource) => {
    setTestingSourceIds((current) => current.includes(source.id) ? current : [...current, source.id]);
    setSourceTestMessage("正在检测 " + source.name + "…");
    const stages: NonNullable<NovelSource["healthStages"]> = {
      connection: { ok: false, message: "尚未检测" }, search: { ok: false, message: "尚未检测" },
      detail: { ok: false, message: "尚未检测" }, chapters: { ok: false, message: "尚未检测" },
      content: { ok: false, message: "尚未检测" },
    };
    try {
      const runnable = source.enabled ? source : { ...source, enabled: true };
      const { createSourceHttpClient } = await import("./src/source-runtime");
      const client = createSourceHttpClient(runnable);
      try {
        const response = await client.get("searchUrl", runnable.baseUrl);
        stages.connection = { ok: true, message: "HTTP " + response.status };
      } catch (error) {
        stages.connection = { ok: false, message: error instanceof Error ? error.message : "连接失败" };
      }
      if (stages.connection.ok) {
        let summary: NovelSummary | null = null;
        for (const keyword of ["斗罗大陆", "斗破苍穹"]) {
          try {
            const page = await searchNovelSource(runnable, keyword, client);
            if (page.items.length > 0) {
              stages.search = { ok: true, message: "搜索到 " + page.items.length + " 本（" + keyword + "）" };
              summary = page.items[0];
              break;
            }
            stages.search = { ok: false, message: "请求成功但返回 0 本（" + keyword + "）" };
          } catch (error) {
            stages.search = { ok: false, message: error instanceof Error ? error.message : "搜索解析失败" };
          }
        }
        if (summary) {
          try { await fetchNovelDetail(runnable, summary, client); stages.detail = { ok: true, message: "小说详情获取成功" }; }
          catch (error) { stages.detail = { ok: false, message: error instanceof Error ? error.message : "详情获取失败" }; }
          let chapters: NovelChapter[] = [];
          try { chapters = await fetchNovelChapterList(runnable, summary, client); stages.chapters = { ok: true, message: "获取 " + chapters.length + " 章" }; }
          catch (error) { stages.chapters = { ok: false, message: error instanceof Error ? error.message : "目录获取失败" }; }
          if (chapters.length) {
            try {
              const content = await fetchNovelChapterContent(runnable, chapters[0], client);
              if (!content.content.trim()) throw new Error("正文内容为空");
              stages.content = { ok: true, message: "首章正文获取成功（" + content.content.length + " 字符）" };
            } catch (error) { stages.content = { ok: false, message: error instanceof Error ? error.message : "正文获取失败" }; }
          } else stages.content = { ok: false, message: "目录不可用，跳过正文检测" };
        } else {
          stages.detail = { ok: false, message: "无搜索结果，无法检测详情" };
          stages.chapters = { ok: false, message: "无搜索结果，无法检测目录" };
          stages.content = { ok: false, message: "无搜索结果，无法检测正文" };
        }
      } else {
        stages.search = stages.detail = stages.chapters = stages.content = { ok: false, message: "连接失败，未继续检测" };
      }
      const passed = Object.values(stages).filter((stage) => stage.ok).length;
      const level = passed === 5 ? "完全可用" : passed > 0 ? "部分可用" : "不可用";
      updateSourceHealth(source.id, stages, level);
      setSourceTestMessage(source.name + "： " + level + "（" + passed + "/5 项通过）");
    } catch (error) {
      stages.connection = { ok: false, message: error instanceof Error ? error.message : "检测异常" };
      updateSourceHealth(source.id, stages, "不可用");
      setSourceTestMessage(source.name + "：检测异常");
    } finally {
      setTestingSourceIds((current) => current.filter((id) => id !== source.id));
    }
  };

  const filteredSources = sources.filter((source) => sourceFilter === "全部" || (sourceFilter === "成功源" ? source.healthLevel === "完全可用" : source.healthLevel !== "完全可用")).sort((a, b) => Number(b.healthLevel === "完全可用") - Number(a.healthLevel === "完全可用"));
  const exportSourceFailures = async () => {
    const cell = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    const rows = [["书源名称", "失败原因"], ...sources.map((source) => {
      const failures = source.healthStages ? Object.entries(source.healthStages).filter(([, stage]) => !stage.ok).map(([key, stage]) => key + "：" + stage.message) : [];
      const reason = source.healthLevel === "完全可用" ? "无" : failures.join("；") || source.healthMessage || "尚未检测";
      return [source.name, reason];
    })];
    const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    try {
      if (!FileSystem.documentDirectory) throw new Error("无法访问本地文档目录。");
      const uri = FileSystem.documentDirectory + "书源检测结果-" + new Date().toISOString().slice(0, 10) + ".csv";
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({ title: "书源检测结果.csv", message: "书源名称与失败原因", url: uri });
    } catch (error) { Alert.alert("导出失败", error instanceof Error ? error.message : "无法生成书源检测文件。"); }
  };
  const testSelectedSources = async () => {
    const targets = sources.filter((source) => selectedSourceIds.includes(source.id));
    if (!targets.length) { Alert.alert("请先选择书源", "勾选书源后再批量测试。"); return; }
    for (const source of targets) await testOneSource(source);
    setSourceTestMessage("批量测试完成，共检测 " + targets.length + " 个书源。");
  };
  const toggleSelectedSource = (id: string) => setSelectedSourceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAllVisibleSources = () => {
    const ids = filteredSources.map((source) => source.id);
    setSelectedSourceIds((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };
  const bulkSetSourceEnabled = (enabled: boolean) => setSources((current) => current.map((source) => selectedSourceIds.includes(source.id) ? { ...source, enabled } : source));
  const bulkDeleteSources = () => Alert.alert("删除所选书源", "确定删除选中的 " + selectedSourceIds.length + " 个书源？", [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: () => { setSources((current) => current.filter((source) => !selectedSourceIds.includes(source.id))); setSelectedSourceIds([]); } },
  ]);


  const filteredSearchLogs = searchLogs.filter((entry) => entry.ok === (searchLogFilter === "成功"));
  const toggleAllVisibleSearchLogs = () => {
    const ids = filteredSearchLogs.map((entry) => entry.id);
    setSelectedSearchLogIds((current) => ids.length > 0 && ids.every((id) => current.includes(id))
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  };
  const exportSelectedSearchLogs = async () => {
    const selected = filteredSearchLogs.filter((entry) => selectedSearchLogIds.includes(entry.id));
    if (!selected.length) { Alert.alert("请先选择日志", "勾选要导出的搜索记录。"); return; }
    const cell = (value: string) => '"' + value.replace(/"/g, '""') + '"';
    const rows = [["搜索关键词", "书源名称", "搜索状态", "结果数量", "失败原因", "搜索时间"],
      ...selected.map((entry) => [entry.keyword, entry.sourceName, entry.ok ? "成功" : "失败", String(entry.resultCount), entry.error || "", new Date(entry.searchedAt).toLocaleString()])];
    const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    try {
      if (!FileSystem.documentDirectory) throw new Error("无法访问本地文档目录。");
      const uri = FileSystem.documentDirectory + "搜索日志-" + new Date().toISOString().slice(0, 10) + ".csv";
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({ title: "搜索日志.csv", message: "所选书源搜索记录", url: uri });
    } catch (error) { Alert.alert("导出失败", error instanceof Error ? error.message : "无法生成搜索日志文件。"); }
  };

  const importSubscriptionFromUrl = async (action: "add" | "update" = "add") => {
    if (subscriptionLoading) return;
    const address = subscriptionUrl.trim();
    setSubscriptionLoading(true);
    setSubscriptionUrlMessage("");
    try {
      const url = new URL(address);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("订阅地址必须是无账号密码的 HTTPS 公网地址。");
      const host = url.hostname.toLowerCase();
      if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || /^(10\.|127\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        throw new Error("订阅地址不能指向本机或局域网。");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: "GET",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("订阅下载失败，HTTP " + response.status + "。");
      const length = Number(response.headers.get("content-length") || 0);
      if (length > 2 * 1024 * 1024) throw new Error("订阅文件超过 2 MB 限制。");
      const raw = await response.text();
      if (raw.length > 2 * 1024 * 1024) throw new Error("订阅文件超过 2 MB 限制。");
      const subscription = parseSourceSubscription(raw);
      const importedAliases: Record<string, string> = {};
      let aliasRecordCount = 0;
      let aliasCount = 0;
      let aliasConflictCount = 0;
      const ambiguousAliases = new Set<string>();
      for (const aliasSource of subscription.aliasSources) {
        const aliasController = new AbortController();
        const aliasTimeout = setTimeout(() => aliasController.abort(), 15000);
        let aliasResponse: Response;
        try {
          aliasResponse = await fetch(aliasSource.dataUrl, {
            method: "GET", credentials: "omit", redirect: "error", signal: aliasController.signal,
            headers: { Accept: "application/json" },
          });
        } finally {
          clearTimeout(aliasTimeout);
        }
        if (!aliasResponse.ok) throw new Error("别名库下载失败，HTTP " + aliasResponse.status + "。");
        const aliasLength = Number(aliasResponse.headers.get("content-length") || 0);
        if (aliasLength > 1024 * 1024) throw new Error("别名库文件超过 1 MB 限制。");
        const aliasRaw = await aliasResponse.text();
        if (aliasRaw.length > 1024 * 1024) throw new Error("别名库文件超过 1 MB 限制。");
        const parsedDictionary = parseBookAliasDictionary(aliasRaw);
        for (const [key, title] of Object.entries(parsedDictionary.aliases)) {
          if (importedAliases[key] && importedAliases[key] !== title) {
            delete importedAliases[key];
            ambiguousAliases.add(key);
          } else if (!ambiguousAliases.has(key)) {
            importedAliases[key] = title;
          }
        }
        for (const key of parsedDictionary.conflicts) {
          delete importedAliases[key];
          ambiguousAliases.add(key);
        }
        aliasRecordCount += parsedDictionary.recordCount;
        aliasCount += parsedDictionary.aliasCount;
        aliasConflictCount += parsedDictionary.conflictCount;
      }
      if (subscription.compatible.length === 0 && subscription.aliasSources.length === 0) {
        setBookAliasMap({});
        setSubscriptionUrlMessage(subscription.name + " 已连接，但目前没有可导入的兼容书源。" + (subscription.unsupported.length ? " 已跳过 " + subscription.unsupported.length + " 个不兼容条目。" : ""));
        return;
      }
      const importedAt = Date.now();
      // Reconcile this subscription as a complete snapshot: remove entries that
      // were previously imported from this subscription but are no longer listed.
      const currentRemoteIds = new Set(subscription.compatible.map((item) => item.remoteId));
      const next = sources.filter((source) =>
        source.subscriptionId !== subscription.subscriptionId ||
        !source.remoteSourceId ||
        currentRemoteIds.has(source.remoteSourceId)
      );
      const removed = sources.length - next.length;
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const item of subscription.compatible) {
        const existingIndex = next.findIndex((source) => source.subscriptionId === subscription.subscriptionId && source.remoteSourceId === item.remoteId);
        const { remoteId, version, ...config } = item;
        if (existingIndex >= 0) {
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...config,
            id: existing.id,
            enabled: existing.enabled,
            importedAt: existing.importedAt,
            subscriptionGroup: "normal",
            subscriptionId: subscription.subscriptionId,
            remoteSourceId: remoteId,
            remoteVersion: version,
          };
          updated++;
        } else if (next.some((source) => source.baseUrl.toLowerCase() === item.baseUrl.toLowerCase())) {
          skipped++;
        } else {
          next.push({
            ...config,
            id: "sub:" + subscription.subscriptionId + ":" + remoteId,
            enabled: true,
            importedAt,
            subscriptionGroup: "normal",
            subscriptionId: subscription.subscriptionId,
            remoteSourceId: remoteId,
            remoteVersion: version,
          });
          added++;
        }
      }
      setSources(next);
      setBookAliasMap(importedAliases);
      const totalAliasConflicts = aliasConflictCount + ambiguousAliases.size;
      setSubscriptionUrlMessage(subscription.name + (action === "add" ? " 添加完成：" : " 更新完成：") + "正文源新增 " + added + "，更新 " + updated + "，移除已下架 " + removed + "，重复跳过 " + skipped + "；别名源 " + subscription.aliasSources.length + " 个，别名记录 " + aliasRecordCount + " 条，别名条目 " + aliasCount + " 条，可用映射 " + Object.keys(importedAliases).length + " 条，冲突 " + totalAliasConflicts + " 条；不兼容 " + subscription.unsupported.length + "。");
    } catch (error) {
      setSubscriptionUrlMessage(error instanceof Error ? error.message : "订阅导入失败，请检查地址和网络。");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded || sources.length > 0 || subscriptionUrl !== DEFAULT_SUBSCRIPTION_URL || defaultSubscriptionAttemptedRef.current) return;
    defaultSubscriptionAttemptedRef.current = true;
    void importSubscriptionFromUrl("add");
  }, [isLoaded, sources.length, subscriptionUrl]);

  const filteredBooks = useMemo(
    () => books.filter((book) =>
      (book.title + book.author + book.category).toLowerCase().includes(query.trim().toLowerCase())
    ),
    [books, query]
  );

  const searchOnlineNovels = async (searchTerm = onlineQuery) => {
    const keyword = searchTerm.trim();
    if (!keyword) {
      setSearchMessage("先输入小说名称再搜索。");
      setOnlineResults([]);
      return;
    }
    setSearchHistory((current) => [keyword, ...current.filter((item) => item.toLocaleLowerCase() !== keyword.toLocaleLowerCase())].slice(0, 10));
    const aliasKey = normalizeBookAlias(keyword);
    const resolvedKeyword = bookAliasMap[aliasKey] || keyword;
    const enabledSources = sources.filter((source) => source.enabled);
    if (enabledSources.length === 0) {
      setSearchMessage("还没有启用的书源。请先到「源」页面添加订阅。");
      setOnlineResults([]);
      setSearchSummary("");
      return;
    }
    setSearching(true);
    setSearchMessage("");
    setSearchSummary((resolvedKeyword !== keyword ? "别名「" + keyword + "」已匹配真实书名「" + resolvedKeyword + "」。" : "") + "正在向 " + enabledSources.length + " 个书源发起搜索…");
    setOnlineResults([]);
    const settled = await Promise.allSettled(enabledSources.map(async (source) => {
      const startedAt = Date.now();
      const page = await searchNovelSource(source, resolvedKeyword, getSourceClient(source));
      return { page, latencyMs: Date.now() - startedAt };
    }));
    const groups = new Map<string, SearchNovelGroup>();
    let failed = 0;
    const completedAt = Date.now();
    const nextSearchLogs: SearchLogEntry[] = [];
    settled.forEach((result, index) => {
      const source = enabledSources[index];
      if (result.status !== "fulfilled") {
        failed += 1;
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason || "搜索请求失败");
        nextSearchLogs.push({ id: completedAt + ":" + index + ":" + source.id, sourceId: source.id, sourceName: source.name, keyword, ok: false, resultCount: 0, error: reason, searchedAt: completedAt });
        return;
      }
      const { page, latencyMs } = result.value;
      nextSearchLogs.push({ id: completedAt + ":" + index + ":" + source.id, sourceId: source.id, sourceName: source.name, keyword, ok: true, resultCount: page.items.length, searchedAt: completedAt });
      page.items.forEach((item) => {
        const key = [normalizeNovelTitle(item.title), normalizeNovelTitle(item.author)].join("::");
        const existing = groups.get(key);
        const option = { summary: item, latencyMs };
        if (!existing) {
          groups.set(key, { id: key, title: item.title, author: item.author, description: item.description, coverUrl: item.coverUrl, sources: [option] });
        } else {
          if (item.description.length > existing.description.length) existing.description = item.description;
          if (!existing.coverUrl && item.coverUrl) existing.coverUrl = item.coverUrl;
          if (!existing.sources.some((entry) => entry.summary.sourceId === item.sourceId)) existing.sources.push(option);
        }
      });
    });
    const groupedResults = [...groups.values()].map((group) => ({
      ...group,
      sources: [...group.sources].sort((a, b) => a.latencyMs - b.latencyMs),
    }));
    setSearchLogs((current) => [...nextSearchLogs, ...current].slice(0, 500));
    setOnlineResults(groupedResults);
    setSearching(false);
    setSearchSummary((resolvedKeyword !== keyword ? "别名「" + keyword + "」→「" + resolvedKeyword + "」；" : "") + "搜索完成：成功 " + (enabledSources.length - failed) + " 个，失败 " + failed + " 个书源，共找到 " + groupedResults.length + " 本（已合并重复结果）。");
    setSearchMessage(groupedResults.length === 0 ? "没有找到结果。可能是书源暂不可用，或该书源返回的格式暂不支持（支持常见 JSON 与已配置规则的 HTML）。" : "点击小说名称即可自动获取可用阅读源和章节目录。");
  };

  const loadNovelCatalogFor = async (novel: SearchNovelGroup) => {
    setLoadingCatalog(true);
    setCatalogMessage("");
    setSelectedSourceId(null);
    setLoadedNovelDetail(null);
    setLoadedChapters([]);
    const candidates = [...novel.sources]
      .filter((option) => sources.some((source) => source.id === option.summary.sourceId && source.enabled))
      .sort((a, b) => a.latencyMs - b.latencyMs);
    let lastError = "没有可用的已启用书源。";
    try {
      for (const option of candidates) {
        const source = sources.find((item) => item.id === option.summary.sourceId && item.enabled);
        if (!source) continue;
        try {
          const chapters = await fetchNovelChapterList(source, option.summary, getSourceClient(source));
          if (!chapters.length) throw new Error("该书源没有返回章节目录。");
          let detail: NovelDetail | null = null;
          try { detail = await fetchNovelDetail(source, option.summary, getSourceClient(source)); } catch {
            // Description is optional; a valid chapter list is enough to read.
          }
          setSelectedSourceId(source.id);
          setLoadedNovelDetail(detail);
          setLoadedChapters(chapters);
          setSelectedSearchNovel((current) => current?.id === novel.id ? {
            ...current,
            sources: current.sources.map((item) => item.summary.sourceId === source.id
              ? { ...item, chapterCount: chapters.length, chapterError: undefined }
              : item),
          } : current);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "书源目录读取失败。";
        }
      }
      setCatalogMessage(candidates.length ? "暂时无法自动获取小说目录，请稍后重试。" : lastError);
    } finally { setLoadingCatalog(false); }
  };

  const openSearchNovel = (novel: SearchNovelGroup) => {
    setSelectedSearchNovel(novel);
    setSelectedSourceId(null);
    setCatalogMessage("");
    void loadNovelCatalogFor(novel);
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
        coverUrl: selectedSearchNovel.coverUrl || option.summary.coverUrl || existing?.coverUrl || existing?.onlineSummary?.coverUrl,
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

  const addCurrentBookToShelf = () => {
    if (!selectedBook) return;
    setBooks((current) => current.some((book) => book.id === selectedBook.id)
      ? current.map((book) => book.id === selectedBook.id ? { ...book, ...selectedBook } : book)
      : [selectedBook, ...current]);
    Alert.alert("已加入书架", "这本小说已保存到本地书架，之后可以从书架继续阅读。");
  };

  const closeSearchNovel = () => {
    setSelectedSearchNovel(null);
    setSelectedSourceId(null);
    setLoadedNovelDetail(null);
    setLoadedChapters([]);
    setCatalogMessage("");
  };

  const loadSelectedNovelCatalog = async () => {
    if (selectedSearchNovel) await loadNovelCatalogFor(selectedSearchNovel);
  };

  const openOnlineChapter = async (chapter: NovelChapter) => {
    if (!selectedSearchNovel || !selectedSourceId) return;
    const source = sources.find((item) => item.id === selectedSourceId);
    const option = selectedSearchNovel.sources.find((item) => item.summary.sourceId === selectedSourceId);
    if (!source || !source.enabled || !option) {
      setCatalogMessage("所选书源已不可用，请重新选择书源。");
      return;
    }

    setLoadingOnlineChapter(true);
    setCatalogMessage("");
    try {
      const novelCacheId = selectedSearchNovel.id;
      const fetchChapter = (target: NovelChapter) => fetchNovelChapterContent(source, target, getSourceClient(source));
      const result = await getOrFetchChapterContent(novelCacheId, chapter.id, () => fetchChapter(chapter));
      void prefetchNextChapters(novelCacheId, loadedChapters, chapter.index, fetchChapter, 5);
      setOnlineChapterIndex(chapter.index);
      setReaderParagraphIndex(0);
      restoreReaderPositionRef.current = true;
      setReaderContentHeight(0);
      setOnlineChapterContent(result.content);
      setOnlineChapterTitle(result.title || chapter.title);
      setOnlineReading(true);
      setLocalReading(false);
      setLocalChapters([]);
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

  const checkOnlineSubscription = async (book: Book, showNoUpdates = false): Promise<Book | null> => {
    if (!book.onlineSourceId || !book.onlineSummary) return null;
    const source = sources.find((item) => item.id === book.onlineSourceId && item.enabled);
    if (!source) {
      Alert.alert("书源不可用", "这本小说的阅读源已停用或删除，请到书源列表启用后重试。");
      return null;
    }
    setCheckingSubscription(true);
    try {
      const latestChapters = await fetchNovelChapterList(source, book.onlineSummary, getSourceClient(source));
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
        unreadUpdateCount: update.newChapters.length > 0 ? update.newChapters.length : (book.unreadUpdateCount || 0),
        progress: latestChapters.length
          ? Math.round(((update.currentChapterIndex + 1) / latestChapters.length) * 100)
          : book.progress,
      };
      setBooks((current) => current.map((item) => item.id === book.id ? refreshedBook : item));
      setSelectedBook((current) => current?.id === book.id ? refreshedBook : current);
      setLoadedChapters(latestChapters);
      setOnlineChapterIndex(update.currentChapterIndex);
      if (update.newChapters.length > 0) {
        // Updates are shown as a quiet badge on the shelf, never as a popup.
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

  useEffect(() => {
    if (!isLoaded || sources.length === 0 || autoSubscriptionCheckRef.current) return;
    autoSubscriptionCheckRef.current = true;
    const subscribed = books.filter((book) => !!book.onlineSourceId && !!book.onlineSummary && !!book.onlineChapters?.length);
    void (async () => { for (const book of subscribed) await checkOnlineSubscription(book, false); })();
  }, [isLoaded, sources.length]);

  const recordReading = (book: Book, chapterTitle: string, chapterIndexValue: number, progress: number) => {
    setReadingHistory((current) => upsertReadingHistory(current, {
      bookId: book.id, title: book.title, author: book.author, chapterTitle,
      chapterIndex: chapterIndexValue, progress, updatedAt: Date.now(),
    }));
  };

  const removeBookFromShelf = (book: Book) => {
    Alert.alert("移出书架", "确定移出《" + book.title + "》吗？本地导入文件也会从 App 存储中删除。", [
      { text: "取消", style: "cancel" },
      { text: "移出", style: "destructive", onPress: () => {
        setBooks((current) => current.filter((item) => item.id !== book.id));
        setReadingHistory((current) => current.filter((entry) => entry.bookId !== book.id));
        if (book.localFileUri) void FileSystem.deleteAsync(book.localFileUri, { idempotent: true }).catch(() => undefined);
      } },
    ]);
  };

  const resumeReadingHistory = (entry: ReadingHistoryEntry) => {
    const book = books.find((item) => item.id === entry.bookId);
    if (!book) { Alert.alert("无法继续阅读", "这本书当前不在书架中，请重新搜索并添加后再继续。"); return; }
    void openBook(book);
  };

  const openBook = async (book: Book) => {

    if (books.some((item) => item.id === book.id)) setBooks((current) => current.map((item) => item.id === book.id ? { ...item, unreadUpdateCount: 0 } : item));
    if (book.localFileUri) {
      try {
        const info = await FileSystem.getInfoAsync(book.localFileUri);
        if (!info.exists) throw new Error("本地小说文件不存在，可能已被系统清理。");
        const rawText = await FileSystem.readAsStringAsync(book.localFileUri, { encoding: FileSystem.EncodingType.UTF8 });
        const parsed = parseLocalTextBook(book.localFileName || book.title + ".txt", rawText);
        const safeIndex = Math.min(Math.max(book.chapterIndex ?? 0, 0), parsed.chapters.length - 1);
        setOpenedFromShelf(true);
        setOnlineReading(false);
        setLocalReading(true);
        setLocalChapters(parsed.chapters);
        setSelectedBook(book);
        setChapterIndex(safeIndex);
        setReaderParagraphIndex(Math.max(0, book.readerParagraphIndex ?? 0));
        restoreReaderPositionRef.current = true;
        setReaderContentHeight(0);
        setShowCatalog(false);
        setShowReaderSettings(false);
        recordReading(book, parsed.chapters[safeIndex]?.title || "全文", safeIndex, book.progress);
      } catch (error) {
        Alert.alert("打开本地小说失败", error instanceof Error ? error.message : "请重新导入文本文件。");
      }
      return;
    }
    setLocalReading(false);
    setLocalChapters([]);
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
      setLocalReading(false);
      setLocalChapters([]);
      setOnlineChapterIndex(initialIndex);
      setSelectedBook(book);
      recordReading(book, book.lastChapter || initialChapters[initialIndex]?.title || "尚未开始", initialIndex, book.progress);
      setLoadingOnlineChapter(true);

      // Check the subscribed source every time a saved online novel is opened.
      const refreshedBook = await checkOnlineSubscription(book);
      setBooks((current) => current.map((item) => item.id === book.id ? { ...item, unreadUpdateCount: 0 } : item));
      const chapters = refreshedBook?.onlineChapters || initialChapters;
      const targetIndex = refreshedBook?.chapterIndex ?? initialIndex;
      const targetChapter = chapters[targetIndex] || chapters[0];
      if (!targetChapter) {
        setLoadingOnlineChapter(false);
        Alert.alert("目录为空", "当前没有可打开的章节，请稍后重新检查订阅。");
        return;
      }
      try {
        const novelCacheId = getOnlineBookId(book.title, book.author);
        const fetchChapter = (target: NovelChapter) => fetchNovelChapterContent(source, target, getSourceClient(source));
        const result = await getOrFetchChapterContent(novelCacheId, targetChapter.id, () => fetchChapter(targetChapter));
        void prefetchNextChapters(novelCacheId, chapters, targetChapter.index, fetchChapter, 5);
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
    setLocalReading(false);
    setLocalChapters([]);
    setSelectedBook({ ...book, unreadUpdateCount: 0 });
    setBooks((current) => current.map((item) => item.id === book.id ? { ...item, unreadUpdateCount: 0 } : item));
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

    setSelectedBook(null);
    setOnlineReading(false);
    setLocalReading(false);
    setLocalChapters([]);
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

  const saveReadingPosition = (bookId: string, nextChapterIndex: number) => {
    const chapters = localReading ? localChapters : SAMPLE_CHAPTERS;
    const chapterCount = Math.max(1, chapters.length);
    const safeIndex = Math.min(Math.max(nextChapterIndex, 0), chapterCount - 1);
    const chapter = chapters[safeIndex];
    const progress = Math.round(((safeIndex + 1) / chapterCount) * 100);
    setChapterIndex(safeIndex);
    setReaderParagraphIndex(0);
    restoreReaderPositionRef.current = true;
    setReaderContentHeight(0);
    setBooks((current) => current.map((book) => book.id !== bookId ? book : ({ ...book, chapterIndex: safeIndex, readerParagraphIndex: 0, progress, lastChapter: chapter?.title || "全文" })));
    const current = books.find((book) => book.id === bookId);
    if (current) recordReading({ ...current, chapterIndex: safeIndex, progress, lastChapter: chapter?.title || "全文" }, chapter?.title || "全文", safeIndex, progress);

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
    if (localReading) {
      if (next >= 0 && next < localChapters.length) saveReadingPosition(selectedBook.id, next);
      return;
    }
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

  if (showSearchLogs && !selectedBook && !selectedSearchNovel) {
    return (
      <SafeAreaView style={[styles.safe, appIsDark && styles.appDarkBackground]}>
        <StatusBar barStyle={appIsDark ? "light-content" : "dark-content"} />
              <Modal visible={showSearchLogs} animationType="slide" onRequestClose={() => setShowSearchLogs(false)}>
                <SafeAreaView style={[styles.safe, appIsDark && styles.appDarkBackground]}>
                  <View style={[styles.topBar, appIsDark && styles.darkTopBar]}>
                    <Pressable onPress={() => setShowSearchLogs(false)}><Text style={[styles.backText, appIsDark && styles.darkPrimaryText]}>返回</Text></Pressable>
                    <Text style={[styles.pageTitle, appIsDark && styles.darkPrimaryText]}>搜索日志</Text>
                    <Pressable onPress={exportSelectedSearchLogs}><Text style={styles.sourceActionText}>导出</Text></Pressable>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingVertical: 12 }}>
                    {(["成功", "失败"] as const).map((filter) => (
                      <Pressable key={filter} onPress={() => { setSearchLogFilter(filter); setSelectedSearchLogIds([]); }} style={[styles.sourceFilterButton, { flex: 1, alignItems: "center" }, searchLogFilter === filter && styles.sourceFilterActive]}>
                        <Text style={[styles.sourceFilterText, searchLogFilter === filter && styles.sourceFilterTextActive]}>{filter === "成功" ? "搜索成功" : "搜索失败"}（{searchLogs.filter((entry) => entry.ok === (filter === "成功")).length}）</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 }}>
                    <Pressable onPress={toggleAllVisibleSearchLogs}><Text style={styles.sourceActionText}>{filteredSearchLogs.length > 0 && filteredSearchLogs.every((entry) => selectedSearchLogIds.includes(entry.id)) ? "取消全选" : "全选"}</Text></Pressable>
                    <Text style={[styles.note, appIsDark && styles.darkMutedText]}>已选 {selectedSearchLogIds.length} 条</Text>
                  </View>
                  <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
                    {filteredSearchLogs.length === 0 ? <Text style={[styles.emptyText, { marginTop: 24 }]}>暂无{searchLogFilter === "成功" ? "成功" : "失败"}搜索记录。</Text> : filteredSearchLogs.map((entry) => (
                      <Pressable key={entry.id} onPress={() => setSelectedSearchLogIds((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])} style={[styles.sourceItem, appIsDark && styles.darkCard]}>
                        <Text style={[styles.sourceSelectText, { marginRight: 10 }]}>{selectedSearchLogIds.includes(entry.id) ? "☑" : "□"}</Text>
                        <View style={styles.sourceItemInfo}>
                          <Text style={[styles.sourceItemTitle, appIsDark && styles.darkPrimaryText]}>{entry.sourceName}</Text>
                          <Text style={[styles.sourceItemUrl, appIsDark && styles.darkMutedText]}>关键词：{entry.keyword} · 结果：{entry.resultCount} 本</Text>
                          {!!entry.error && <Text style={[styles.sourceItemStatus, { color: "#A66D62" }]}>{entry.error}</Text>}
                          <Text style={[styles.sourceItemUrl, appIsDark && styles.darkMutedText]}>{new Date(entry.searchedAt).toLocaleString()}</Text>
                        </View>
                        <Text style={{ color: entry.ok ? "#65745D" : "#A66D62", fontWeight: "700" }}>{entry.ok ? "成功" : "失败"}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </SafeAreaView>
              </Modal>
      </SafeAreaView>
    );
  }

  if (showReadingHistory && !selectedBook && !selectedSearchNovel) {
    return (
      <SafeAreaView style={[styles.safe, appIsDark && styles.appDarkBackground]}>
        <StatusBar barStyle={appIsDark ? "light-content" : "dark-content"} />

        <View style={[styles.detailHeader, appIsDark && styles.darkTopBar]}>
          <Pressable onPress={() => setShowReadingHistory(false)}><Text style={[styles.backText, appIsDark && styles.darkSecondaryText]}>‹ 返回我的</Text></Pressable>
          <Text style={[styles.readerHeaderTitle, appIsDark && styles.darkSecondaryText]}>最近阅读</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, appIsDark && styles.darkPrimaryText]}>最近阅读</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={[styles.sectionMeta, appIsDark && styles.darkMutedText]}>{readingHistory.length} 条记录</Text>
              {readingHistory.length > 0 && <Pressable onPress={() => Alert.alert("清空阅读记录", "只清除阅读历史，不会删除书架中的小说。", [{ text: "取消", style: "cancel" }, { text: "清空", style: "destructive", onPress: () => setReadingHistory([]) }])}><Text style={styles.sourceActionText}>清空</Text></Pressable>}
            </View>
          </View>
          {readingHistory.length === 0 ? <Text style={styles.emptyText}>还没有阅读记录，打开一本小说后会自动记录。</Text> : readingHistory.map((entry) => (
            <Pressable key={entry.bookId} style={[styles.historyRow, appIsDark && styles.darkCard]} onPress={() => resumeReadingHistory(entry)}>
              <View style={styles.historyInfo}>
                <Text style={[styles.bookTitle, appIsDark && styles.darkPrimaryText]}>{entry.title}</Text>
                <Text style={[styles.bookAuthor, appIsDark && styles.darkSecondaryText]}>{entry.author} · {entry.chapterTitle}</Text>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${entry.progress}%` as `${number}%` }]} /></View>
                <Text style={[styles.progressText, appIsDark && styles.darkMutedText]}>已读 {entry.progress}% · {new Date(entry.updatedAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedSearchNovel && !selectedBook) {
    const detailChapters = [...loadedChapters].sort((a, b) => chapterSortOrder === "asc" ? a.index - b.index : b.index - a.index);
    const detailCoverUrl = (selectedSearchNovel.coverUrl && !failedCoverUrls[selectedSearchNovel.coverUrl] ? selectedSearchNovel.coverUrl : undefined) || selectedSearchNovel.sources.find((entry) => !!entry.summary.coverUrl && !failedCoverUrls[entry.summary.coverUrl as string])?.summary.coverUrl;
    return (
      <SafeAreaView style={[styles.safe, appIsDark && styles.appDarkBackground]}>
        <StatusBar barStyle={appIsDark ? "light-content" : "dark-content"} />
        <View style={[styles.detailHeader, appIsDark && styles.darkTopBar]}>
          <Pressable onPress={closeSearchNovel}><Text style={[styles.backText, appIsDark && styles.darkSecondaryText]}>‹ 返回搜索</Text></Pressable>
          <Text style={[styles.readerHeaderTitle, appIsDark && styles.darkSecondaryText]}>小说详情</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={[styles.detailHero, appIsDark && styles.darkCard, { flexDirection: "row", alignItems: "center", gap: 16 }]}>
            {detailCoverUrl ? (
              <Image source={{ uri: detailCoverUrl }} style={{ width: 104, height: 142, borderRadius: 10, backgroundColor: "#EAE9E1" }} resizeMode="cover" onError={() => setFailedCoverUrls((current) => ({ ...current, [detailCoverUrl]: true }))} />
            ) : (
              <View style={{ width: 104, height: 142, borderRadius: 10, backgroundColor: "#DDE4D6", alignItems: "center", justifyContent: "center", padding: 9 }}>
                <Text style={{ color: "#394336", fontWeight: "800", textAlign: "center" }} numberOfLines={4}>{selectedSearchNovel.title}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailTitle, appIsDark && styles.darkPrimaryText]}>{loadedNovelDetail?.title || selectedSearchNovel.title}</Text>
              <Text style={[styles.detailAuthor, appIsDark && styles.darkSecondaryText]}>作者：{loadedNovelDetail?.author || selectedSearchNovel.author || "未知作者"}</Text>
              {!!loadedNovelDetail?.status && <Text style={[styles.detailAuthor, appIsDark && styles.darkSecondaryText]}>{loadedNovelDetail.status === "completed" ? "已完结" : loadedNovelDetail.status === "serializing" ? "连载中" : "状态未知"}</Text>}
              {!!loadedNovelDetail?.wordCount && <Text style={[styles.detailAuthor, appIsDark && styles.darkSecondaryText]}>{loadedNovelDetail.wordCount.toLocaleString()} 字</Text>}
            </View>
          </View>
          <View style={[styles.detailSection, appIsDark && styles.darkCard]}>
            <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText]}>小说介绍</Text>
            <Text style={[styles.detailDescription, appIsDark && styles.darkSecondaryText]}>{loadedNovelDetail?.description || selectedSearchNovel.description || "暂未获取到小说介绍。"}</Text>
          </View>
          {loadingCatalog && <View style={styles.searchLoading}><ActivityIndicator color="#65745D" /><Text style={[styles.note, appIsDark && styles.darkMutedText]}>正在获取作者介绍和章节目录…</Text></View>}
          {!!catalogMessage && !loadingCatalog && (
            <View style={[styles.detailSection, appIsDark && styles.darkCard]}>
              <Text style={[styles.searchFeedback, appIsDark && styles.darkMutedText]}>{catalogMessage}</Text>
              <Pressable style={[styles.onlineSearchButton, appIsDark && styles.darkAccentButton]} onPress={() => void loadSelectedNovelCatalog()}>
                <Text style={styles.importButtonText}>重新获取详情和目录</Text>
              </Pressable>
            </View>
          )}
          {!!loadedChapters.length && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <View>
                  <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText]}>章节目录</Text>
                  <Text style={[styles.note, appIsDark && styles.darkMutedText]}>共 {loadedChapters.length} 章</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable style={[styles.themeButton, chapterSortOrder === "asc" && styles.modeButtonActive]} onPress={() => setChapterSortOrder("asc")}><Text style={styles.fontButtonText}>正序</Text></Pressable>
                  <Pressable style={[styles.themeButton, chapterSortOrder === "desc" && styles.modeButtonActive]} onPress={() => setChapterSortOrder("desc")}><Text style={styles.fontButtonText}>倒序</Text></Pressable>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable style={[styles.catalogLoadButton, { flex: 1 }]} onPress={() => void openOnlineChapter(detailChapters[0])} disabled={loadingOnlineChapter}>
                  <Text style={styles.importButtonText}>{loadingOnlineChapter ? "正在打开…" : "从第一章开始"}</Text>
                </Pressable>
                <Pressable style={[styles.catalogLoadButton, { flex: 1, backgroundColor: "#EEF0E9" }, appIsDark && styles.darkCard]} onPress={saveOnlineBookToShelf}>
                  <Text style={[styles.fontButtonText]}>{books.some((book) => book.id === getOnlineBookId(selectedSearchNovel.title, selectedSearchNovel.author)) ? "更新书架" : "加入书架"}</Text>
                </Pressable>
              </View>
              {detailChapters.map((chapter, index) => (
                <Pressable key={chapter.id} onPress={() => void openOnlineChapter(chapter)} disabled={loadingOnlineChapter} style={[styles.chapterRow, appIsDark && styles.darkCard]}>
                  <Text style={[styles.chapterRowTitle, appIsDark && styles.darkPrimaryText]}>{chapter.title}</Text>
                  <Text style={styles.chapterRowMeta}>{index + 1}</Text>
                </Pressable>
              ))}
            </>
          )}
          {loadingOnlineChapter && <ActivityIndicator color="#65745D" style={{ marginVertical: 12 }} />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedBook) {
    const currentBook = books.find((book) => book.id === selectedBook.id) || selectedBook;
    const activeChapter = onlineReading ? { title: onlineChapterTitle, content: onlineChapterContent } : localReading ? (localChapters[chapterIndex] || { title: "全文", content: "" }) : SAMPLE_CHAPTERS[chapterIndex];
    const activeChapterIndex = onlineReading ? onlineChapterIndex : chapterIndex;
    const activeChapterCount = onlineReading ? loadedChapters.length : localReading ? localChapters.length : SAMPLE_CHAPTERS.length;
    const activeReadingText = onlineReading || localReading ? activeChapter.content : currentBook.description + "\n\n" + activeChapter.content;
    const readingParagraphs = splitReadingText(activeReadingText);
    const readerBackground = readerTheme === "night" ? "#20231F" : readerTheme === "green" ? "#E8EFE3" : readerTheme === "gray" ? "#E9EAEC" : "#F8F7F3";
    const readerTextColor = readerTheme === "night" ? "#E6E3D9" : readerTheme === "green" ? "#3F4A3B" : readerTheme === "gray" ? "#41464D" : "#45453D";
    const readingProgressPercent = Math.min(100, Math.max(0, Math.round(((activeChapterIndex + (readingParagraphs.length > 1 ? readerParagraphIndex / (readingParagraphs.length - 1) : 0)) / Math.max(1, activeChapterCount)) * 100)));
    const readerScrollOffset = getReadingScrollOffset(readerParagraphIndex, readingParagraphs.length, Math.max(0, readerContentHeight - readerViewportHeight));
    const readerMaxScrollOffset = Math.max(0, readerContentHeight - readerViewportHeight);
    const turnReaderPage = (nextOffset: number, direction: number) => {
      const targetOffset = Math.max(0, Math.min(readerMaxScrollOffset, nextOffset));
      if (readerMode !== "simulation" && readerMode !== "cover") {
        readerScrollRef.current?.scrollTo({ y: targetOffset, animated: readerMode !== "none" });
        return;
      }
      pageTurnProgress.stopAnimation();
      pageTurnProgress.setValue(0);
      Animated.timing(pageTurnProgress, {
        toValue: direction,
        duration: readerMode === "simulation" ? 260 : 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        readerScrollRef.current?.scrollTo({ y: targetOffset, animated: false });
        pageTurnProgress.setValue(-direction);
        Animated.timing(pageTurnProgress, {
          toValue: 0,
          duration: readerMode === "simulation" ? 260 : 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    };
    const pageTurnTranslateX = pageTurnProgress.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [-Dimensions.get("window").width, 0, Dimensions.get("window").width],
    });
    const pageTurnRotateY = pageTurnProgress.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: ["-8deg", "0deg", "8deg"],
    });
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: readerBackground }]}>
        <StatusBar barStyle={readerTheme === "night" ? "light-content" : "dark-content"} />
        {readerChromeVisible && <View style={styles.readerHeader}>
          <Pressable onPress={closeReader}><Text style={styles.backText}>‹ 返回</Text></Pressable>
          <Text style={[styles.readerHeaderTitle, readerTheme === "night" && styles.nightMuted]}>正在阅读</Text>
          {!books.some((book) => book.id === currentBook.id) && <Pressable onPress={addCurrentBookToShelf}><Text style={styles.headerAction}>加入书架</Text></Pressable>}
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
            <Text style={[styles.catalogSub, readerTheme === "night" && styles.nightMuted]}>{currentBook.title} · 共 {activeChapterCount} 章{onlineReading ? "" : localReading ? "（本地导入）" : "（演示）"}</Text>
            {onlineReading && <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}><Pressable style={[styles.themeButton, chapterSortOrder === "asc" && styles.modeButtonActive]} onPress={() => setChapterSortOrder("asc")}><Text style={styles.fontButtonText}>正序</Text></Pressable><Pressable style={[styles.themeButton, chapterSortOrder === "desc" && styles.modeButtonActive]} onPress={() => setChapterSortOrder("desc")}><Text style={styles.fontButtonText}>倒序</Text></Pressable></View>}
            {onlineReading ? [...loadedChapters].sort((a, b) => chapterSortOrder === "asc" ? a.index - b.index : b.index - a.index).map((chapter, index) => (
              <Pressable key={chapter.id} onPress={() => void openOnlineChapter(chapter)} style={[styles.chapterRow, readerTheme === "night" && styles.nightCard, index === activeChapterIndex && styles.chapterRowActive]}>
                <Text style={[styles.chapterRowTitle, readerTheme === "night" && styles.nightText]}>{chapter.title}</Text>
                <Text style={styles.chapterRowMeta}>{index === activeChapterIndex ? "正在阅读" : "在线章节"}</Text>
              </Pressable>
            )) : (localReading ? localChapters : SAMPLE_CHAPTERS).map((chapter, index) => (
              <Pressable key={chapter.title + '-' + index} onPress={() => { saveReadingPosition(currentBook.id, index); setShowCatalog(false); }} style={[styles.chapterRow, readerTheme === "night" && styles.nightCard, index === activeChapterIndex && styles.chapterRowActive]}>
                <Text style={[styles.chapterRowTitle, readerTheme === "night" && styles.nightText]}>{chapter.title}</Text>
                <Text style={styles.chapterRowMeta}>{index === activeChapterIndex ? "正在阅读" : localReading ? "本地章节" : "演示章节"}</Text>
              </Pressable>
            ))}
            {!onlineReading && !localReading && <Text style={[styles.catalogDisclaimer, readerTheme === "night" && styles.nightMuted]}>当前为内置演示目录。</Text>}
          </ScrollView>
        ) : (
          <Animated.View
            style={[
              { flex: 1 },
              readerMode === "cover" && { transform: [{ translateX: pageTurnTranslateX }] },
              readerMode === "simulation" && {
                transform: [{ perspective: 1200 }, { translateX: pageTurnTranslateX }, { rotateY: pageTurnRotateY }],
              },
            ]}
          >
          <ScrollView
            ref={readerScrollRef}
            scrollEnabled={readerMode === "vertical-scroll"}
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
              if (readerMode !== "vertical-scroll" && elapsed < 900 && Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
                const nextOffset = deltaX < 0
                  ? Math.min(readerMaxScrollOffset, readerScrollOffset + readerViewportHeight * 0.88)
                  : Math.max(0, readerScrollOffset - readerViewportHeight * 0.88);
                turnReaderPage(nextOffset, deltaX < 0 ? -1 : 1);
                return;
              }
              if (elapsed >= 280 || moved >= 14) return;
              if (centerTap) {
                setReaderChromeVisible((visible) => !visible);
                setShowReaderSettings((visible) => !visible);
                return;
              }
              if (readerMode !== "vertical-scroll") {
                const nextOffset = pageX < screenWidth * 0.28
                  ? Math.max(0, readerScrollOffset - readerViewportHeight * 0.88)
                  : pageX > screenWidth * 0.72
                    ? Math.min(readerMaxScrollOffset, readerScrollOffset + readerViewportHeight * 0.88)
                    : readerScrollOffset;
                if (nextOffset !== readerScrollOffset) turnReaderPage(nextOffset, pageX > screenWidth * 0.72 ? -1 : 1);
              }
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
          </Animated.View>
        )}
        {showReaderSettings && !showCatalog && (
          <View style={[styles.readerSettings, readerTheme === "night" && styles.nightCard]}>
            <View style={styles.readerSettingRow}>
              <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>翻页方式</Text>
              {([{ id: "left-right", label: "左右滑动" }, { id: "vertical-scroll", label: "上下滚动" }, { id: "simulation", label: "仿真翻页" }, { id: "cover", label: "覆盖翻页" }, { id: "none", label: "无动画翻页" }] as const).map((option) => (
                <Pressable key={option.id} style={[styles.themeButton, readerMode === option.id && styles.modeButtonActive]} onPress={() => setReaderMode(option.id)}><Text style={styles.fontButtonText}>{option.label}</Text></Pressable>
              ))}
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

        {readerChromeVisible && <View style={[styles.readerBottomBar, readerTheme === "night" && styles.nightCard]}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: readerTheme === "night" ? "#3A4038" : "#EEECE5" }}>
            <View style={{ height: 2, width: `${readingProgressPercent}%`, backgroundColor: "#7D8B70" }} />
          </View>
          <Pressable disabled={activeChapterIndex === 0 || showCatalog || loadingOnlineChapter} onPress={() => changeChapter(-1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (activeChapterIndex === 0 || showCatalog || loadingOnlineChapter) && styles.disabledText]}>上一章</Text>
          </Pressable>
          <Pressable disabled={activeChapterIndex === activeChapterCount - 1 || showCatalog || loadingOnlineChapter} onPress={() => changeChapter(1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (activeChapterIndex === activeChapterCount - 1 || showCatalog || loadingOnlineChapter) && styles.disabledText]}>下一章</Text>
          </Pressable>
        </View>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, appIsDark && styles.appDarkBackground]}>
      <StatusBar barStyle={appIsDark ? "light-content" : "dark-content"} />
      <View style={[styles.topBar, appIsDark && styles.darkTopBar]}>
        <View>
          {tab !== "源" && <Text style={[styles.eyebrow, appIsDark && styles.darkEyebrow]}>MY LITTLE LIBRARY</Text>}
          <Text style={[styles.pageTitle, appIsDark && styles.darkPrimaryText]}>{tab}</Text>
        </View>
        {tab === "搜索" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={() => setShowSearchLogs(true)} style={[{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#E9E5DA" }, appIsDark && styles.darkCard]}>
              <Text style={[{ color: "#514F45", fontSize: 13, fontWeight: "700" }, appIsDark && styles.darkPrimaryText]}>搜索日志</Text>
            </Pressable>
            <Pressable onPress={() => setTab("源")} style={[{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#E9E5DA" }, appIsDark && styles.darkCard]}>
              <Text style={[{ color: "#514F45", fontSize: 13, fontWeight: "700" }, appIsDark && styles.darkPrimaryText]}>源</Text>
            </Pressable>
          </View>
        ) : tab === "源" ? null : tab === "书架" ? <Pressable onPress={() => { setTab("搜索"); setQuery(""); }} style={[styles.avatar, appIsDark && styles.darkCard]}><Text style={[styles.avatarText, appIsDark && styles.darkPrimaryText]}>搜</Text></Pressable> : <View style={[styles.avatar, appIsDark && styles.darkCard]}><Text style={[styles.avatarText, appIsDark && styles.darkPrimaryText]}>我</Text></View>}
      </View>

      {tab === "书架" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索书架中的书名、作者"
            placeholderTextColor="#9A9A9A"
            style={[styles.search, appIsDark && styles.darkSearch]}
            returnKeyType="search"
          />
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, appIsDark && styles.darkPrimaryText]}>我的书架</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.sectionMeta, appIsDark && styles.darkMutedText]}>{filteredBooks.length} 本藏书</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={shelfView === "grid" ? "切换为列表模式" : "切换为三列网格模式"} onPress={() => {
                const nextView = shelfView === "grid" ? "list" : "grid";
                setShelfView(nextView);
                void AsyncStorage.setItem(SHELF_VIEW_STORAGE_KEY, nextView).catch(() => undefined);
              }} style={[styles.themeButton, { paddingVertical: 7, paddingHorizontal: 10 }, appIsDark && styles.darkCard]}>
                <Text style={[styles.fontButtonText, appIsDark && styles.darkPrimaryText]}>{shelfView === "grid" ? "列表" : "3×3"}</Text>
              </Pressable>
            </View>
          </View>
          {filteredBooks.length === 0 ? (
            <Text style={styles.emptyText}>{query.trim() ? "没有找到相关书籍，试试其他关键词。" : "书架还是空的。去「搜索」发现并添加喜欢的小说吧。"}</Text>
          ) : (
            <View style={shelfView === "grid" ? styles.bookGrid : undefined}>
              {filteredBooks.map((book) => (
                <Pressable key={book.id} style={[styles.bookRow, shelfView === "grid" ? styles.bookGridCard : undefined, appIsDark && styles.darkCard]} onPress={() => openBook(book)} onLongPress={() => removeBookFromShelf(book)} delayLongPress={550}>
                  <View style={shelfView === "grid" ? styles.bookGridCoverWrap : { position: "relative" }}>
                    <BookCover
                      book={book}
                      grid={shelfView === "grid"}
                      failedCoverUrls={failedCoverUrls}
                      onCoverError={(url) => setFailedCoverUrls((current) => ({ ...current, [url]: true }))}
                    />
                    {!!book.unreadUpdateCount && <View style={styles.updateBadge}><Text style={styles.updateBadgeText}>有更新</Text></View>}
                  </View>
                  <View style={shelfView === "grid" ? styles.bookGridInfo : styles.bookInfo}>
                    <Text style={[shelfView === "grid" ? styles.bookGridTitle : styles.bookTitle, appIsDark && styles.darkPrimaryText]} numberOfLines={2}>{book.title}</Text>
                    <Text style={[shelfView === "grid" ? styles.bookGridAuthor : styles.bookAuthor, appIsDark && styles.darkSecondaryText]} numberOfLines={1}>{book.author}</Text>
                    {shelfView === "list" && !!book.description && <Text style={[styles.bookDescription, appIsDark && styles.darkMutedText]} numberOfLines={2}>{book.description}</Text>}
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${book.progress}%` as `${number}%` }]} /></View>
                    <Text style={[styles.progressText, appIsDark && styles.darkMutedText]}>{book.progress > 0 ? "已读 " + book.progress + "%" : "尚未开始"}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={[styles.storageNote, appIsDark && styles.darkMutedText]}>书架和阅读进度保存在当前设备。长按书籍可将其移出书架。</Text>
        </ScrollView>
      )}

      {tab === "搜索" && (
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          {!!onlineQuery.trim() && (
            <View style={{ marginBottom: 18 }}>
              <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText, { marginBottom: 10 }]}>书架内匹配</Text>
              {books.filter((book) => (book.title + book.author).toLocaleLowerCase().includes(onlineQuery.trim().toLocaleLowerCase())).length === 0
                ? <Text style={[styles.note, appIsDark && styles.darkMutedText]}>书架中没有匹配项，下面继续搜索全部书源。</Text>
                : books.filter((book) => (book.title + book.author).toLocaleLowerCase().includes(onlineQuery.trim().toLocaleLowerCase())).map((book) => (
                  <Pressable key={book.id} onPress={() => void openBook(book)} style={[styles.historyRow, appIsDark && styles.darkCard]}>
                    <View style={styles.historyInfo}>
                      <Text style={[styles.bookTitle, appIsDark && styles.darkPrimaryText]}>{book.title}</Text>
                      <Text style={[styles.bookAuthor, appIsDark && styles.darkSecondaryText]}>{book.author} · 书架藏书</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
            </View>
          )}
          <View style={[styles.onlineSearchCard, appIsDark && styles.darkCard]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TextInput
                value={onlineQuery}
                onChangeText={(value) => { setOnlineQuery(value); setSearchMessage(""); }}
                placeholder="输入小说名称或关键词"
                placeholderTextColor="#9A9A9A"
                style={[styles.searchInput, appIsDark && styles.darkInput, { flex: 1, marginBottom: 0 }]}
                returnKeyType="search"
                onSubmitEditing={() => { void searchOnlineNovels(); }}
                editable={!searching}
              />
              {!!onlineQuery && <Pressable onPress={() => { setOnlineQuery(""); setOnlineResults([]); setSearchSummary(""); setSearchMessage(""); }} disabled={searching} style={{ paddingVertical: 10, paddingHorizontal: 3 }}>
                <Text style={[{ color: "#65745D", fontSize: 13, fontWeight: "700" }, appIsDark && styles.darkPrimaryText]}>取消</Text>
              </Pressable>}
            </View>
            <Pressable style={[styles.onlineSearchButton, searching && styles.importButtonDisabled]} onPress={() => { void searchOnlineNovels(); }} disabled={searching}>
              {searching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.importButtonText}>搜索小说</Text>}
            </Pressable>
          </View>
          <View style={{ marginBottom: 18 }}>
            <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText, { marginBottom: 11 }]}>热门搜索</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              {HOT_SEARCH_TERMS.map((item, index) => (
                <Pressable key={item} onPress={() => { setOnlineQuery(item); void searchOnlineNovels(item); }} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, backgroundColor: appIsDark ? "#30362F" : "#F0F0EB", borderWidth: 1, borderColor: appIsDark ? "#41483F" : "#E8E7E0" }}>
                  <Text style={{ color: index < 3 ? "#A66D62" : (appIsDark ? "#E8E8E0" : "#55564E"), fontSize: 11, fontWeight: "800", marginRight: 6 }}>{index + 1}</Text>
                  <Text style={{ color: appIsDark ? "#E8E8E0" : "#55564E", fontSize: 12 }}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {searchHistory.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText]}>搜索历史</Text>
                <Pressable onPress={() => Alert.alert("清空搜索历史", "确定清空最近 10 条搜索记录吗？", [{ text: "取消", style: "cancel" }, { text: "清空", style: "destructive", onPress: () => setSearchHistory([]) }])}>
                  <Text style={styles.sourceActionText}>清空</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                {searchHistory.map((item) => (
                  <Pressable key={item} onPress={() => { setOnlineQuery(item); void searchOnlineNovels(item); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: appIsDark ? "#30362F" : "#F0F0EB", borderWidth: 1, borderColor: appIsDark ? "#41483F" : "#E8E7E0" }}>
                    <Text style={[{ color: appIsDark ? "#E8E8E0" : "#55564E", fontSize: 12 }]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {!!searchSummary && <Text style={styles.searchSummary}>{searchSummary}</Text>}
          {searching && <View style={styles.searchLoading}><ActivityIndicator color="#65745D" /><Text style={styles.note}>正在搜索，请稍候…</Text></View>}
          {!!searchMessage && <Text style={styles.searchFeedback}>{searchMessage}</Text>}
          {onlineResults.length > 0 && (
            <View style={styles.searchResultGrid}>
              {onlineResults.map((item) => {
                const coverUrl = (item.coverUrl && !failedCoverUrls[item.coverUrl] ? item.coverUrl : undefined) || item.sources.find((entry) => !!entry.summary.coverUrl && !failedCoverUrls[entry.summary.coverUrl as string])?.summary.coverUrl;
                return (
                <Pressable key={item.id} style={styles.searchResultTile} onPress={() => openSearchNovel(item)}>
                  {coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={styles.searchResultCover} resizeMode="cover" onError={() => setFailedCoverUrls((current) => ({ ...current, [coverUrl]: true }))} />
                  ) : (
                    <View style={[styles.searchResultCover, styles.searchResultCoverFallback]}>
                      <Text style={styles.searchResultFallbackTitle} numberOfLines={4}>{item.title}</Text>
                      <Text style={styles.searchResultFallbackLabel}>封面暂不可用</Text>
                    </View>
                  )}
                  <Text style={[styles.searchResultTitle, appIsDark && styles.darkPrimaryText]} numberOfLines={2}>{item.title}</Text>
                  {!!item.author && <Text style={[styles.searchResultAuthor, appIsDark && styles.darkMutedText]} numberOfLines={1}>{item.author}</Text>}
                </Pressable>
                );
              })}
            </View>
          )}
          {!searching && onlineResults.length === 0 && !searchMessage && (
            <Text style={styles.emptyText}>输入书名开始搜索。需要先在搜索页右上角「源」中添加书源订阅。</Text>
          )}
        </ScrollView>
      )}

      {tab === "源" && (
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.sourceCard, appIsDark && styles.darkCard]}>
            <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText]}>添加订阅</Text>
            <TextInput
              value={subscriptionUrl}
              onChangeText={(value) => { setSubscriptionUrl(value); setSubscriptionUrlMessage(""); }}
              placeholder="请输入书源订阅链接"
              placeholderTextColor="#A39F94"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.searchInput, { marginTop: 8 }]}
            />
            <View style={{ flexDirection: "row", gap: 7, marginTop: 12 }}>
              <Pressable style={[styles.importButton, { flex: 1, marginTop: 0 }, (!subscriptionUrl.trim() || subscriptionLoading) && styles.importButtonDisabled]} disabled={!subscriptionUrl.trim() || subscriptionLoading} onPress={() => void importSubscriptionFromUrl("add")}>
                {subscriptionLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.importButtonText}>添加订阅</Text>}
              </Pressable>
              <Pressable style={[styles.importButton, styles.updateSubscriptionButton, { flex: 1, marginTop: 0 }, (!subscriptionUrl.trim() || subscriptionLoading) && styles.importButtonDisabled]} disabled={!subscriptionUrl.trim() || subscriptionLoading} onPress={() => void importSubscriptionFromUrl("update")}>
                {subscriptionLoading ? <ActivityIndicator color="#65745D" /> : <Text style={styles.updateSubscriptionButtonText}>更新订阅</Text>}
              </Pressable>
              <Pressable style={[styles.importButton, { flex: 1, marginTop: 0 }, (!sources.length || testingSourceIds.length > 0) && styles.importButtonDisabled]} disabled={!sources.length || testingSourceIds.length > 0} onPress={() => { if (selectedSourceIds.length) void testSelectedSources(); else void (async () => { for (const source of sources) await testOneSource(source); })(); }}>
                <Text style={styles.importButtonText}>测试源</Text>
              </Pressable>
            </View>
            {!!subscriptionUrlMessage && <Text style={styles.sourceMessage}>{subscriptionUrlMessage}</Text>}
          </View>
          <View style={[styles.sourceCard, appIsDark && styles.darkCard, { marginTop: 14 }]}>
            <View style={styles.sourceListHeading}>
              <Text style={[styles.sourceTitle, appIsDark && styles.darkPrimaryText]}>书源列表（{sources.length + (Object.keys(bookAliasMap).length > 0 ? 1 : 0)}）</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable onPress={() => void exportSourceFailures()}><Text style={styles.sourceActionText}>导出</Text></Pressable>
                <Pressable onPress={() => setSourcesCollapsed((value) => !value)}><Text style={styles.sourceActionText}>{sourcesCollapsed ? "展开" : "折叠"}</Text></Pressable>
                <Pressable onPress={toggleAllVisibleSources}><Text style={styles.sourceActionText}>{filteredSources.length > 0 && filteredSources.every((item) => selectedSourceIds.includes(item.id)) ? "取消全选" : "全选"}</Text></Pressable>
              </View>
            </View>
            
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {(["全部", "成功源", "失败源"] as const).map((filter) => <Pressable key={filter} onPress={() => setSourceFilter(filter)} style={[styles.sourceFilterButton, sourceFilter === filter && styles.sourceFilterActive]}><Text style={[styles.sourceFilterText, sourceFilter === filter && styles.sourceFilterTextActive]}>{filter}</Text></Pressable>)}
            </View>
            {Object.keys(bookAliasMap).length > 0 && <View style={[styles.sourceItem, appIsDark && styles.darkCard, { marginTop: 10 }]}>
              <View style={styles.sourceItemInfo}>
                <Text style={[styles.sourceItemTitle, appIsDark && styles.darkPrimaryText]}>小说别名库 · 特殊源</Text>
                <Text style={[styles.sourceItemUrl, appIsDark && styles.darkMutedText]}>{Object.keys(bookAliasMap).length} 条别名映射已启用，不参与正文抓取</Text>
                <Text style={[styles.sourceItemStatus, appIsDark && styles.darkSecondaryText]}>已启用 · 搜索时自动转换为真实书名</Text>
              </View>
            </View>}
            {selectedSourceIds.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <Text style={[styles.sourceMessage, { alignSelf: "center" }]}>已选 {selectedSourceIds.length} 个</Text>
              <Pressable style={styles.sourceAction} onPress={() => void testSelectedSources()}><Text style={styles.sourceActionText}>测试</Text></Pressable>
              <Pressable style={styles.sourceAction} onPress={() => bulkSetSourceEnabled(true)}><Text style={styles.sourceActionText}>启用</Text></Pressable>
              <Pressable style={styles.sourceAction} onPress={() => bulkSetSourceEnabled(false)}><Text style={styles.sourceActionText}>停用</Text></Pressable>
              <Pressable style={styles.sourceAction} onPress={bulkDeleteSources}><Text style={styles.sourceDeleteText}>删除</Text></Pressable>
            </View>}
            {!!sourceTestMessage && <Text style={styles.sourceMessage}>{sourceTestMessage}</Text>}
            {!sourcesCollapsed && (filteredSources.length === 0 ? <Text style={[styles.note, appIsDark && styles.darkMutedText, { marginTop: 14 }]}>{sources.length ? "当前分类没有书源。" : "还没有书源，请先添加订阅。"}</Text> : filteredSources.map((source) => (
              <View key={source.id} style={[styles.sourceItem, appIsDark && styles.darkCard, { marginTop: 10 }]}>
                <Pressable onPress={() => toggleSelectedSource(source.id)} style={styles.sourceSelect}><Text style={styles.sourceSelectText}>{selectedSourceIds.includes(source.id) ? "☑" : "□"}</Text></Pressable>
                <View style={styles.sourceItemInfo}>
                  <Text style={[styles.sourceItemTitle, appIsDark && styles.darkPrimaryText]} numberOfLines={1}>{source.name}</Text>
                  <Text style={[styles.sourceItemUrl, appIsDark && styles.darkMutedText]} numberOfLines={1}>{source.baseUrl}</Text>
                  <Text style={[styles.sourceItemStatus, appIsDark && styles.darkSecondaryText]}>{source.healthLevel || "待检测"} · {source.enabled ? "已启用" : "已停用"}</Text>
                  {source.healthStages ? <Text style={[styles.sourceItemUrl, appIsDark && styles.darkMutedText]} numberOfLines={3}>{Object.entries(source.healthStages).map(([key, value]) => key + " " + (value.ok ? "✓" : "×") + " " + value.message).join("；")}</Text> : null}
                </View>
                <View style={styles.sourceItemActions}>
                  <Pressable style={styles.sourceAction} disabled={testingSourceIds.includes(source.id)} onPress={() => void testOneSource(source)}><Text style={styles.sourceActionText}>{testingSourceIds.includes(source.id) ? "检测中" : "测试"}</Text></Pressable>
                  <Pressable style={styles.sourceAction} onPress={() => setSources((current) => current.map((item) => item.id === source.id ? { ...item, enabled: !item.enabled } : item))}><Text style={styles.sourceActionText}>{source.enabled ? "☑ 选中使用" : "□ 选中不使用"}</Text></Pressable>
                  <Pressable onPress={() => Alert.alert("删除书源", "确定删除「" + source.name + "」？", [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: () => { setSources((current) => current.filter((item) => item.id !== source.id)); setSelectedSourceIds((current) => current.filter((id) => id !== source.id)); } }])}><Text style={styles.sourceDeleteText}>删除</Text></Pressable>
                </View>
              </View>
            )))}
          </View>
        </ScrollView>
      )}

      {tab === "我的" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={[styles.profileCard, appIsDark && styles.darkCard]}>
            <View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>阅</Text></View>
            <Text style={[styles.profileTitle, appIsDark && styles.darkPrimaryText]}>我的阅读空间</Text>
            <Text style={[styles.note, appIsDark && styles.darkMutedText]}>本地阅读器 · 持续开发中</Text>
          </View>
          <Pressable style={[styles.settingRow, appIsDark && styles.darkCard]} onPress={() => setShowReadingHistory(true)}>
            <Text style={[styles.settingText, appIsDark && styles.darkPrimaryText]}>最近阅读</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.settingValue, appIsDark && styles.darkSecondaryText]}>{readingHistory.length} 条记录</Text>
              <Text style={[styles.chevron, appIsDark && styles.darkMutedText]}>›</Text>
            </View>
          </Pressable>
          <View style={[styles.updateCard, appIsDark && styles.darkCard]}>
            <View style={styles.updateHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="检测应用更新" disabled={appUpdateBusy} onPress={() => void checkForAppUpdate(false)} style={styles.updateIcon}><Text style={styles.updateIconText}>↻</Text></Pressable>
              <View style={styles.updateHeaderInfo}>
                <Text style={[styles.updateTitle, appIsDark && styles.darkPrimaryText]}>应用在线更新</Text>
                <Text style={styles.updateVersion}>当前版本：{Constants.expoConfig?.version || "1.0.0"} · {Updates.isEnabled ? "在线更新已启用" : "等待云端配置"}</Text>
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
            ) : null}
            <Text style={styles.updateFootnote}>普通界面、功能逻辑和资源会自动检查并后台下载更新；确认重启即可应用，无需重新签名安装。涉及 iOS 原生组件、权限或底层依赖的改动仍需重新构建安装。</Text>
          </View>
          <View style={[styles.appearanceCard, appIsDark && styles.darkCard]}>
            <Text style={[styles.settingText, appIsDark && styles.darkPrimaryText]}>外观主题</Text>
            <View style={styles.appearanceOptions}>
              {([{ value: "light", label: "白色主题" }, { value: "dark", label: "黑色主题" }] as const).map((option) => (
                <Pressable key={option.value} onPress={() => setAppearanceMode(option.value)} style={[styles.appearanceOption, appearanceMode === option.value && styles.appearanceOptionActive]}>
                  <Text style={[styles.appearanceOptionText, appearanceMode === option.value && styles.appearanceOptionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      <View style={[styles.tabBar, appIsDark && styles.darkCard]}>
        {(["书架", "搜索", "我的"] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => { setTab(item); setQuery(""); }} style={styles.tabItem}>
            <Text style={[styles.tabIcon, appIsDark && styles.darkMutedText, tab === item && styles.tabIconActive]}>
              {item === "书架" ? "▤" : item === "搜索" ? "⌕" : "◯"}
            </Text>
            <Text style={[styles.tabLabel, appIsDark && styles.darkMutedText, tab === item && styles.tabLabelActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={(appUpdateAvailable || appUpdateDownloaded) && !appUpdateDismissed}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          if (!appUpdateBusy) setAppUpdateDismissed(true);
        }}
      >
        <View style={styles.forceUpdateOverlay}>
          <View style={styles.forceUpdateCard}>
            <View style={styles.forceUpdateIcon}>
              <Text style={styles.forceUpdateIconText}>↑</Text>
            </View>
            <Text style={styles.forceUpdateTitle}>发现新版本</Text>
            <Text style={styles.forceUpdateSubtitle}>私人小说发现了一个可用更新</Text>
            <View style={styles.forceUpdateNotice}>
              <Text style={styles.forceUpdateNoticeText}>
                {appUpdateDownloaded
                  ? "更新包已下载完成。重启应用后将自动切换到新版本。"
                  : appUpdateStatus}
              </Text>
            </View>
            {appUpdateBusy ? (
              <View style={styles.forceUpdateProgress}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.forceUpdateProgressText}>{appUpdateStatus}</Text>
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
            {!appUpdateBusy ? (
              <Pressable style={styles.forceUpdateRetry} onPress={() => setAppUpdateDismissed(true)}>
                <Text style={styles.forceUpdateRetryText}>稍后更新</Text>
              </Pressable>
            ) : null}
            <Text style={styles.forceUpdateFootnote}>更新失败不会删除当前版本；你可以稍后重试。原生组件、权限或底层依赖变更仍需重新安装新版本。</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F7F3" },
  appDarkBackground: { backgroundColor: "#171916" },
  darkAccentButton: { backgroundColor: "#586B50" },
  darkSourceChoiceSelected: { backgroundColor: "#343B32", borderColor: "#829078" },
  darkTopBar: { backgroundColor: "#171916" },
  darkPrimaryText: { color: "#E8E8E0" },
  darkEyebrow: { color: "#9AA394" },
  darkSecondaryText: { color: "#B0B5A9" },
  darkMutedText: { color: "#92998C" },
  darkInput: { backgroundColor: "#252923", color: "#E8E8E0", borderColor: "#3A4038" },
  darkSearch: { backgroundColor: "#252923", color: "#E8E8E0", borderColor: "#3A4038" },
  darkCard: { backgroundColor: "#252923", borderColor: "#3A4038" },
  shelfViewToggle: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#EAECE5" },
  shelfViewToggleText: { color: "#65745D", fontSize: 21, fontWeight: "700" },
  bookGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  bookGridCard: { width: "31.7%", flexDirection: "column", alignItems: "stretch", padding: 7, marginBottom: 0, borderRadius: 13 },
  bookGridCoverWrap: { width: "100%", position: "relative" },
  gridCover: { width: "100%", height: 132, borderRadius: 8, padding: 9 },
  bookGridInfo: { paddingLeft: 0, paddingTop: 7, width: "100%" },
  bookGridTitle: { color: "#292A24", fontSize: 11, lineHeight: 15, fontWeight: "800", minHeight: 30 },
  bookGridAuthor: { color: "#928D80", fontSize: 9, marginTop: 3 },
  updateBadge: { position: "absolute", top: 6, right: 0, backgroundColor: "#D94B43", paddingHorizontal: 7, paddingVertical: 4, borderTopLeftRadius: 7, borderBottomLeftRadius: 7 },
  updateBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  appearanceCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EEECE5", padding: 16, marginTop: 16 },
  appearanceOptions: { flexDirection: "row", gap: 8, marginTop: 12 },
  appearanceOption: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: "#F1F0EA", alignItems: "center", justifyContent: "center" },
  appearanceOptionActive: { backgroundColor: "#DDE5D6", borderWidth: 1, borderColor: "#8A9A7C" },
  appearanceOptionText: { color: "#777368", fontSize: 11, fontWeight: "700" },
  appearanceOptionTextActive: { color: "#52634A" },
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
  searchResultGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18, marginTop: 4 },
  searchResultTile: { width: "31.5%", marginBottom: 2 },
  searchResultTitle: { color: "#292A24", fontSize: 12, lineHeight: 17, fontWeight: "800", minHeight: 36, marginBottom: 7 },
  searchResultCover: { width: "100%", aspectRatio: 0.68, borderRadius: 9, backgroundColor: "#EAE9E1" },
  searchResultCoverFallback: { alignItems: "center", justifyContent: "center", padding: 9, borderWidth: 1, borderColor: "#DDDCD2" },
  searchResultFallbackTitle: { color: "#59614F", fontSize: 13, lineHeight: 19, fontWeight: "800", textAlign: "center" },
  searchResultFallbackLabel: { color: "#999486", fontSize: 9, marginTop: 10 },
  searchResultAuthor: { color: "#8D897F", fontSize: 10, marginTop: 5 },
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
  updateSubscriptionButton: { backgroundColor: "#EEF0E9", borderWidth: 1, borderColor: "#D8DED2" },
  updateSubscriptionButtonText: { color: "#65745D", fontSize: 13, fontWeight: "800" },
  importLocalButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: "#D8DED2", backgroundColor: "#EEF0E9", alignItems: "center", justifyContent: "center", marginTop: -12, marginBottom: 22 },
  importLocalButtonText: { color: "#65745D", fontSize: 12, fontWeight: "800" },
  importButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sourceMessage: { color: "#65745D", fontSize: 12, lineHeight: 18, marginTop: 10 },
  sourceListHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
  sourceFilterButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#F1F0EA" },
  sourceFilterActive: { backgroundColor: "#65745D" },
  sourceFilterText: { color: "#777368", fontSize: 11, fontWeight: "700" },
  sourceFilterTextActive: { color: "#FFFFFF" },
  sourceSelect: { paddingRight: 10, paddingVertical: 10 },
  sourceSelectText: { color: "#65745D", fontSize: 19 },
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
