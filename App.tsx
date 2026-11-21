import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { NovelSource, parseNovelSourceJsonBatch } from "./src/source";
import { BUILTIN_MOCK_SOURCE, createBuiltinMockSourceClient } from "./src/mock-source";
import { parseSourceSubscription } from "./src/source-subscription";
import { searchNovelSource } from "./src/source-search";
import { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } from "./src/source-catalog";
import { normalizeNovelTitle, type NovelSummary, type NovelSearchPage, type NovelDetail, type NovelChapter } from "./src/novel";
import { compareChapterUpdates } from "./src/subscription";
import { DEFAULT_READER_SETTINGS, normalizeReaderSettings, type ReaderSettings, type ReaderTheme } from "./src/reader-settings";
import { getReadingParagraphIndex, getReadingScrollOffset, splitReadingText } from "./src/reading-progress";
import { normalizeReadingHistory, upsertReadingHistory, type ReadingHistoryEntry } from "./src/reading-history";
import { SPEECH_VOICES } from "./src/speech-voice-catalog";
import { splitSpeechText } from "./src/speech-engine";
import {
  createOfflineKokoroEngine, deleteOfflineKokoroModel, downloadOfflineKokoroModel,
  getOfflineKokoroModel, isOfflineKokoroPause, pauseOfflineKokoroModel,
  resumeOfflineKokoroModel, synthesizeOfflineKokoro, verifyOfflineKokoroNativeModule,
  type OfflineKokoroEngine, type OfflineKokoroProgress,
} from "./src/offline-kokoro-runtime";
import { playWavAudio, type WavAudioPlayback } from "./src/wav-audio-playback";
import { parseLocalTextBook, type LocalTextChapter } from "./src/local-book";
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
  localFileUri?: string;
  localFileName?: string;
  localChapterCount?: number;
};

const STORAGE_KEY = "@private_novel/books_v1";
const SOURCES_STORAGE_KEY = "@private_novel/sources_v1";
const SUBSCRIPTION_URLS_STORAGE_KEY = "@private_novel/subscription_urls_v1";
const DEFAULT_NORMAL_SUBSCRIPTION_URL = "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/subscription.json";
const DEFAULT_ADULT_SUBSCRIPTION_URL = "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/adult-subscription.json";
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

function getSourceClient(source: NovelSource) {
  return source.isBuiltinMock ? createBuiltinMockSourceClient(source) : undefined;
}

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
  const [speechModelVoiceId, setSpeechModelVoiceId] = useState(DEFAULT_READER_SETTINGS.speechModelVoiceId);
  const [offlineModelStatus, setOfflineModelStatus] = useState<"checking" | "not-downloaded" | "downloading" | "paused" | "installed" | "failed" | "unavailable">("checking");
  const [offlineModelProgress, setOfflineModelProgress] = useState(0);
  const [offlineModelPhase, setOfflineModelPhase] = useState<OfflineKokoroProgress["phase"] | null>(null);
  const [offlineModelPath, setOfflineModelPath] = useState<string | null>(null);
  const [offlineModelError, setOfflineModelError] = useState<string | null>(null);
  const offlineModelPhaseRef = useRef<OfflineKokoroProgress["phase"]>("downloading");
  const offlineModelBusyRef = useRef(false);
  const offlineEngineRef = useRef<OfflineKokoroEngine | null>(null);
  const [speechPaused, setSpeechPaused] = useState(false);
  const speechPausedRef = useRef(false);
  const speechRunIdRef = useRef(0);
  const speechPlaybackRef = useRef<WavAudioPlayback | null>(null);
  const [speechVoiceCategoryFilter, setSpeechVoiceCategoryFilter] = useState<"全部" | "中文女声" | "中文男声" | "英语女声">("全部");
  const [speechRate, setSpeechRate] = useState(DEFAULT_READER_SETTINGS.speechRate);
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
  const [normalSubscriptionUrl, setNormalSubscriptionUrl] = useState(DEFAULT_NORMAL_SUBSCRIPTION_URL);
  const [adultSubscriptionUrl, setAdultSubscriptionUrl] = useState(DEFAULT_ADULT_SUBSCRIPTION_URL);
  const [subscriptionUrlMessage, setSubscriptionUrlMessage] = useState("");
  const [subscriptionLoading, setSubscriptionLoading] = useState<"normal" | "adult" | null>(null);
  const [onlineQuery, setOnlineQuery] = useState("");
  const [sourceSearchMode, setSourceSearchMode] = useState<"normal" | "adult">("normal");
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
  const [localReading, setLocalReading] = useState(false);
  const [localChapters, setLocalChapters] = useState<LocalTextChapter[]>([]);
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
          if (Array.isArray(parsedSources)) {
            const storedSources = parsedSources as NovelSource[];
            const storedMock = storedSources.find((item) => item.id === BUILTIN_MOCK_SOURCE.id);
            setSources([
              storedMock ? { ...BUILTIN_MOCK_SOURCE, enabled: storedMock.enabled !== false } : BUILTIN_MOCK_SOURCE,
              ...storedSources.filter((item) => item.id !== BUILTIN_MOCK_SOURCE.id),
            ]);
          } else {
            setSources([BUILTIN_MOCK_SOURCE]);
          }
        } else if (active) {
          setSources([BUILTIN_MOCK_SOURCE]);
        }
        const savedSubscriptionUrls = await AsyncStorage.getItem(SUBSCRIPTION_URLS_STORAGE_KEY);
        if (savedSubscriptionUrls && active) {
          const parsedUrls: unknown = JSON.parse(savedSubscriptionUrls);
          if (parsedUrls && typeof parsedUrls === "object") {
            const urls = parsedUrls as { normal?: unknown; adult?: unknown };
            if (typeof urls.normal === "string") setNormalSubscriptionUrl(urls.normal);
            if (typeof urls.adult === "string") setAdultSubscriptionUrl(urls.adult);
          }
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
          setSpeechModelVoiceId(settings.speechModelVoiceId);
          setSpeechRate(settings.speechRate);
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
    AsyncStorage.setItem(SUBSCRIPTION_URLS_STORAGE_KEY, JSON.stringify({ normal: normalSubscriptionUrl, adult: adultSubscriptionUrl })).catch(() => {
      setSubscriptionUrlMessage("订阅地址保存失败，请稍后重试。");
    });
  }, [normalSubscriptionUrl, adultSubscriptionUrl, isLoaded]);

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
    const settings: ReaderSettings = normalizeReaderSettings({ fontSize: readerFontSize, theme: readerTheme, readingMode: readerMode, lineSpacing: readerLineSpacing, paragraphSpacing: readerParagraphSpacing, horizontalPadding: readerHorizontalPadding, speechModelVoiceId, speechRate });
    AsyncStorage.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {
      Alert.alert("保存失败", "阅读设置暂时未能保存，请检查手机存储空间。");
    });
  }, [readerFontSize, readerTheme, readerMode, readerLineSpacing, readerParagraphSpacing, readerHorizontalPadding, speechModelVoiceId, speechRate, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    void verifyOfflineKokoroNativeModule().then(() => getOfflineKokoroModel()).then((model) => {
      if (!active) return;
      console.log("[KOKORO_NATIVE_READY] SherpaOnnx TurboModule is registered and responsive.");
      if (model.installed && model.localPath) {
        setOfflineModelPath(model.localPath); setOfflineModelStatus("installed"); setOfflineModelProgress(100);
      } else if (model.pendingPhase) {
        offlineModelPhaseRef.current = model.pendingPhase; setOfflineModelPhase(model.pendingPhase); setOfflineModelStatus("paused");
      } else setOfflineModelStatus("not-downloaded");
    }).catch((error) => {
      if (!active) return;
      console.error("[KOKORO_NATIVE_UNAVAILABLE]", error instanceof Error ? error.message : String(error));
      setOfflineModelStatus("unavailable");
      setOfflineModelError(error instanceof Error ? error.message : "当前构建暂未包含离线语音原生模块。");
    });
    return () => { active = false; };
  }, [isLoaded]);

  useEffect(() => () => {
    const engine = offlineEngineRef.current; offlineEngineRef.current = null;
    if (engine) void engine.destroy().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!restoreReaderPositionRef.current || readerContentHeight <= 0 || readerViewportHeight <= 0) return;
    const text = onlineReading ? onlineChapterContent : localReading ? (localChapters[chapterIndex]?.content || "") : (selectedBook?.description || "") + "\n\n" + (SAMPLE_CHAPTERS[chapterIndex]?.content || "");
    const count = splitReadingText(text).length;
    const maxOffset = Math.max(0, readerContentHeight - readerViewportHeight);
    readerScrollRef.current?.scrollTo({ y: getReadingScrollOffset(readerParagraphIndex, count, maxOffset), animated: false });
    restoreReaderPositionRef.current = false;
  }, [readerContentHeight, readerViewportHeight, readerParagraphIndex, onlineReading, onlineChapterContent, chapterIndex, selectedBook?.id]);

  const importLocalTextBook = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/markdown"], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if (!/\\.(txt|text|md)$/i.test(asset.name)) {
        Alert.alert("暂不支持此文件", "目前支持 TXT、TEXT 和 Markdown 文本文件。");
        return;
      }
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (!info.exists) throw new Error("无法读取所选文件，请重新选择。");
      if (typeof info.size === "number" && info.size > 20 * 1024 * 1024) throw new Error("文件超过 20 MB。请先拆分文件再导入。");
      const rawText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = parseLocalTextBook(asset.name, rawText);
      const root = FileSystem.documentDirectory;
      if (!root) throw new Error("当前设备暂时无法创建本地小说存储目录。");
      const folder = root + "novels/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedUri = folder + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + safeName;
      await FileSystem.copyAsync({ from: asset.uri, to: storedUri });
      const book: Book = {
        id: "local:" + Date.now().toString() + ":" + Math.random().toString(36).slice(2, 8),
        title: parsed.title, author: "本地导入",
        description: "本地文本 · " + parsed.characterCount.toLocaleString() + " 字 · " + parsed.chapters.length + " 章",
        category: "本地小说", progress: 0, color: "#E5E9DF",
        lastChapter: parsed.chapters[0]?.title || "全文", chapterIndex: 0, readerParagraphIndex: 0,
        localFileUri: storedUri, localFileName: asset.name, localChapterCount: parsed.chapters.length,
      };
      setBooks((current) => [book, ...current]);
      setTab("书架");
      Alert.alert("导入成功", "《" + book.title + "》已加入书架，共 " + parsed.chapters.length + " 章。文件已复制到 App 本地存储。");
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "读取文本文件失败，请重试。");
    }
  };

  const importSource = () => {
    try {
      type ImportEntry = Omit<NovelSource, "id" | "enabled" | "importedAt"> & { remoteId?: string; version?: string };
      let parsed: ImportEntry[];
      let subscriptionNote = "";
      const decoded: unknown = JSON.parse(sourceDraft);
      if (decoded && typeof decoded === "object" && !Array.isArray(decoded) && "subscriptionId" in decoded) {
        const subscription = parseSourceSubscription(sourceDraft);
        const group: "normal" | "adult" = subscription.subscriptionId.toLowerCase().includes("adult") || /成人/.test(subscription.name) ? "adult" : "normal";
        parsed = subscription.compatible.map((item) => ({
          ...item,
          subscriptionGroup: group,
          subscriptionId: subscription.subscriptionId,
          remoteSourceId: item.remoteId,
          remoteVersion: item.version,
        }));
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
      const additions: NovelSource[] = parsed.map((item, index) => {
        const { remoteId, version, ...config } = item;
        return {
          ...config,
          id: importedAt.toString() + "-" + index.toString(),
          enabled: true,
          importedAt,
          subscriptionGroup: item.subscriptionGroup || "normal",
          ...(remoteId ? { remoteSourceId: remoteId } : {}),
          ...(version ? { remoteVersion: version } : {}),
        };
      });
      setSources((current) => [...current, ...additions]);
      setSourceDraft("");
      setSourceMessage("导入成功：已导入 " + additions.length + " 个书源" + subscriptionNote + "。");
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "书源校验失败。");
    }
  };

  const importSubscriptionFromUrl = async (group: "normal" | "adult") => {
    if (subscriptionLoading) return;
    const address = (group === "adult" ? adultSubscriptionUrl : normalSubscriptionUrl).trim();
    setSubscriptionLoading(group);
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
      const isAdult = subscription.subscriptionId.toLowerCase().includes("adult") || /成人/.test(subscription.name);
      if (isAdult !== (group === "adult")) throw new Error(group === "adult" ? "此地址不是成人订阅，已阻止导入。" : "此地址是成人订阅，请使用成人订阅入口导入。");
      if (subscription.compatible.length === 0) {
        setSubscriptionUrlMessage(subscription.name + " 已连接，但目前没有可导入的兼容书源。" + (subscription.unsupported.length ? " 已跳过 " + subscription.unsupported.length + " 个不兼容条目。" : ""));
        return;
      }
      const importedAt = Date.now();
      const next = [...sources];
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
            subscriptionGroup: group,
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
            subscriptionGroup: group,
            subscriptionId: subscription.subscriptionId,
            remoteSourceId: remoteId,
            remoteVersion: version,
          });
          added++;
        }
      }
      setSources(next);
      setSubscriptionUrlMessage(subscription.name + " 更新完成：新增 " + added + "，更新 " + updated + "，重复跳过 " + skipped + "，不兼容 " + subscription.unsupported.length + "。");
    } catch (error) {
      setSubscriptionUrlMessage(error instanceof Error ? error.message : "订阅导入失败，请检查地址和网络。");
    } finally {
      setSubscriptionLoading(null);
    }
  };

  const filteredBooks = useMemo(
   N��q�^v�h��x�M4��z׭�o+^���{X�����-�)ޞ�l��'�w�T^i�az�����Ƨu�1{�~��ũ���v}x�J�j�m����j)\��4�_횟���lž���s�4�