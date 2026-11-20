import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { NovelSource, parseNovelSourceJson } from "./src/source";
import { searchNovelSource } from "./src/source-search";
import { mergeNovelSearchResults, type NovelSummary, type NovelSearchPage } from "./src/novel";
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
};

const STORAGE_KEY = "@private_novel/books_v1";
const SOURCES_STORAGE_KEY = "@private_novel/sources_v1";
const SOURCE_EXAMPLE = `{
  "name": "我的书源",
  "baseUrl": "https://example.com",
  "searchUrl": "https://example.com/search",
  "bookUrl": "https://example.com/book",
  "chapterListUrl": "https://example.com/chapters",
  "chapterUrl": "https://example.com/chapter"
}`;
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [readerTheme, setReaderTheme] = useState<"paper" | "night">("paper");
  const [sources, setSources] = useState<NovelSource[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");
  const [onlineQuery, setOnlineQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<NovelSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchSummary, setSearchSummary] = useState("");

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
    AsyncStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources)).catch(() => {
      Alert.alert("保存失败", "书源列表暂时未能保存，请检查手机存储空间。");
    });
  }, [sources, isLoaded]);

  const importSource = () => {
    try {
      const parsed = parseNovelSourceJson(sourceDraft);
      if (sources.some((item) => item.name.toLowerCase() === parsed.name.toLowerCase() || item.baseUrl === parsed.baseUrl)) {
        setSourceMessage("导入失败：相同名称或网址的书源已经存在。");
        return;
      }
      setSources((current) => [...current, { ...parsed, id: String(Date.now()), enabled: true, importedAt: Date.now() }]);
      setSourceDraft("");
      setSourceMessage("书源导入成功，已默认启用。");
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
    const settled = await Promise.allSettled(enabledSources.map((source) => searchNovelSource(source, keyword)));
    const pages: NovelSearchPage[] = [];
    let failed = 0;
    settled.forEach((result) => {
      if (result.status === "fulfilled") pages.push(result.value);
      else failed += 1;
    });
    const merged = mergeNovelSearchResults(pages);
    setOnlineResults(merged);
    setSearching(false);
    setSearchSummary("搜索完成：成功 " + pages.length + " 个，失败 " + failed + " 个书源，共找到 " + merged.length + " 本（已去重）。");
    setSearchMessage(merged.length === 0 ? "没有找到结果。可能是书源暂不可用，或该书源返回的格式暂不支持（目前仅支持常见 JSON 列表）。" : "");
  };

  const stopSpeech = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  const openBook = (book: Book) => {
    stopSpeech();
    setSelectedBook(book);
    setChapterIndex(Math.min(Math.max(book.chapterIndex ?? 0, 0), SAMPLE_CHAPTERS.length - 1));
    setShowCatalog(false);
    setShowReaderSettings(false);
  };

  const closeReader = () => {
    stopSpeech();
    setSelectedBook(null);
    setShowCatalog(false);
    setShowReaderSettings(false);
  };

  const speakCurrentBook = () => {
    if (!selectedBook) return;
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    const textToRead = selectedBook.title + "。" + SAMPLE_CHAPTERS[chapterIndex].title + "。" + SAMPLE_CHAPTERS[chapterIndex].content;
    setIsSpeaking(true);
    Speech.speak(textToRead, {
      language: "zh-CN",
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const saveReadingPosition = (bookId: string, nextChapterIndex: number) => {
    const safeIndex = Math.min(Math.max(nextChapterIndex, 0), SAMPLE_CHAPTERS.length - 1);
    setChapterIndex(safeIndex);
    setBooks((current) => current.map((book) => {
      if (book.id !== bookId) return book;
      return {
        ...book,
        chapterIndex: safeIndex,
        progress: Math.max(book.progress, Math.round(((safeIndex + 1) / SAMPLE_CHAPTERS.length) * 100)),
        lastChapter: SAMPLE_CHAPTERS[safeIndex].title,
      };
    }));
    stopSpeech();
  };

  const changeChapter = (delta: number) => {
    if (!selectedBook) return;
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

  if (selectedBook) {
    const currentBook = books.find((book) => book.id === selectedBook.id) || selectedBook;
    const activeChapter = SAMPLE_CHAPTERS[chapterIndex];
    const readerBackground = readerTheme === "night" ? "#20231F" : "#F8F7F3";
    const readerTextColor = readerTheme === "night" ? "#E6E3D9" : "#45453D";
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: readerBackground }]}>
        <StatusBar barStyle={readerTheme === "night" ? "light-content" : "dark-content"} />
        <View style={styles.readerHeader}>
          <Pressable onPress={closeReader}><Text style={styles.backText}>‹ 返回</Text></Pressable>
          <Text style={[styles.readerHeaderTitle, readerTheme === "night" && styles.nightMuted]}>正在阅读</Text>
          <Pressable onPress={() => { setShowCatalog((value) => !value); setShowReaderSettings(false); }}>
            <Text style={styles.headerAction}>{showCatalog ? "返回正文" : "目录"}</Text>
          </Pressable>
        </View>
        {showCatalog ? (
          <ScrollView contentContainerStyle={styles.catalogContent}>
            <Text style={[styles.catalogHeading, readerTheme === "night" && styles.nightText]}>章节目录</Text>
            <Text style={[styles.catalogSub, readerTheme === "night" && styles.nightMuted]}>{currentBook.title} · 共 {SAMPLE_CHAPTERS.length} 章（演示）</Text>
            {SAMPLE_CHAPTERS.map((chapter, index) => (
              <Pressable key={chapter.title} onPress={() => { saveReadingPosition(currentBook.id, index); setShowCatalog(false); }} style={[styles.chapterRow, readerTheme === "night" && styles.nightCard, index === chapterIndex && styles.chapterRowActive]}>
                <Text style={[styles.chapterRowTitle, readerTheme === "night" && styles.nightText]}>{chapter.title}</Text>
                <Text style={styles.chapterRowMeta}>{index === chapterIndex ? "正在阅读" : "演示章节"}</Text>
              </Pressable>
            ))}
            <Text style={[styles.catalogDisclaimer, readerTheme === "night" && styles.nightMuted]}>当前为内置演示目录，接入书源后将替换为小说真实章节。</Text>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.readerContent}>
            <Text style={styles.chapterLabel}>{activeChapter.title}</Text>
            <Text style={[styles.readerTitle, readerTheme === "night" && styles.nightText]}>{currentBook.title}</Text>
            <Text style={[styles.readerParagraph, { fontSize: readerFontSize, lineHeight: Math.round(readerFontSize * 1.9), color: readerTextColor }]}>
              {currentBook.description}{"\n\n"}{activeChapter.content}
            </Text>
            <View style={styles.readerFooter}>
              <Text style={[styles.muted, readerTheme === "night" && styles.nightMuted]}>第 {chapterIndex + 1} / {SAMPLE_CHAPTERS.length} 章</Text>
              <Text style={[styles.muted, readerTheme === "night" && styles.nightMuted]}>已读 {currentBook.progress}%</Text>
            </View>
          </ScrollView>
        )}
        {showReaderSettings && !showCatalog && (
          <View style={[styles.readerSettings, readerTheme === "night" && styles.nightCard]}>
            <Text style={[styles.settingsLabel, readerTheme === "night" && styles.nightText]}>字体</Text>
            <Pressable style={styles.fontButton} onPress={() => setReaderFontSize((size) => Math.max(14, size - 1))}><Text style={styles.fontButtonText}>A−</Text></Pressable>
            <Text style={[styles.fontSizeValue, readerTheme === "night" && styles.nightText]}>{readerFontSize}</Text>
            <Pressable style={styles.fontButton} onPress={() => setReaderFontSize((size) => Math.min(28, size + 1))}><Text style={styles.fontButtonText}>A+</Text></Pressable>
            <Pressable style={styles.themeButton} onPress={() => setReaderTheme((theme) => theme === "paper" ? "night" : "paper")}><Text style={styles.fontButtonText}>{readerTheme === "paper" ? "夜间" : "日间"}</Text></Pressable>
          </View>
        )}
        <View style={[styles.readerBottomBar, readerTheme === "night" && styles.nightCard]}>
          <Pressable disabled={chapterIndex === 0 || showCatalog} onPress={() => changeChapter(-1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (chapterIndex === 0 || showCatalog) && styles.disabledText]}>上一章</Text>
          </Pressable>
          <Pressable onPress={() => setShowReaderSettings((value) => !value)} style={styles.playerButton}>
            <Text style={styles.playerAction}>Aa 设置</Text>
          </Pressable>
          <Pressable onPress={speakCurrentBook} style={styles.playerButton}>
            <Text style={styles.playerAction}>{isSpeaking ? "停止朗读" : "听书"}</Text>
          </Pressable>
          <Pressable disabled={chapterIndex === SAMPLE_CHAPTERS.length - 1 || showCatalog} onPress={() => changeChapter(1)} style={styles.chapterNavButton}>
            <Text style={[styles.chapterNavText, (chapterIndex === SAMPLE_CHAPTERS.length - 1 || showCatalog) && styles.disabledText]}>下一章</Text>
          </Pressable>
        </View>
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
            <View key={item.id} style={styles.onlineResultCard}>
              <View style={styles.onlineResultInfo}>
                <Text style={styles.onlineResultTitle}>{item.title}</Text>
                <Text style={styles.onlineResultAuthor}>{item.author} · {item.sourceName}</Text>
                {!!item.description && <Text style={styles.onlineResultDescription} numberOfLines={3}>{item.description}</Text>}
                <Text style={styles.onlineResultUrl} numberOfLines={1}>{item.bookUrl}</Text>
              </View>
            </View>
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
            <Text style={styles.note}>粘贴书源配置后导入。当前版本先完成格式校验和本地管理，尚未请求网站或解析小说内容。</Text>
            <Pressable style={styles.exampleButton} onPress={() => { setSourceDraft(SOURCE_EXAMPLE); setSourceMessage("已填入示例模板，请替换为你有权访问的网站地址。"); }}>
              <Text style={styles.exampleButtonText}>填入 JSON 示例</Text>
            </Pressable>
            <TextInput value={sourceDraft} onChangeText={(value) => { setSourceDraft(value); setSourceMessage(""); }} placeholder="在这里粘贴 JSON 书源配置…" placeholderTextColor="#A39F94" multiline autoCapitalize="none" style={styles.sourceInput} textAlignVertical="top" />
            <Pressable style={[styles.importButton, !sourceDraft.trim() && styles.importButtonDisabled]} disabled={!sourceDraft.trim()} onPress={importSource}>
              <Text style={styles.importButtonText}>校验并导入</Text>
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
                <Text style={styles.sourceItemStatus}>{source.enabled ? "已启用" : "已停用"} · 仅保存配置，尚未联网测试</Text>
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
  readerSettings: { minHeight: 58, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingsLabel: { color: "#777368", fontSize: 11 },
  fontButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#EEF0E9" },
  fontButtonText: { color: "#65745D", fontWeight: "800", fontSize: 12 },
  fontSizeValue: { color: "#45453D", fontSize: 12, minWidth: 18, textAlign: "center" },
  themeButton: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12, backgroundColor: "#EEF0E9" },
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
