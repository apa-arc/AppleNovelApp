import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
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
};

const STORAGE_KEY = "@private_novel/books_v1";
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

  useEffect(() => {
    let active = true;
    const loadBooks = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && active) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) setBooks(parsed as Book[]);
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

  const filteredBooks = useMemo(
    () => books.filter((book) =>
      (book.title + book.author + book.category).toLowerCase().includes(query.trim().toLowerCase())
    ),
    [books, query]
  );

  const stopSpeech = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  const openBook = (book: Book) => {
    stopSpeech();
    setSelectedBook(book);
  };

  const closeReader = () => {
    stopSpeech();
    setSelectedBook(null);
  };

  const speakCurrentBook = () => {
    if (!selectedBook) return;
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    const textToRead = selectedBook.title + "。" + selectedBook.description +
      "。这是私人小说阅读器的演示章节。后续将接入真实章节内容。";
    setIsSpeaking(true);
    Speech.speak(textToRead, {
      language: "zh-CN",
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
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
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.readerHeader}>
          <Pressable onPress={closeReader}><Text style={styles.backText}>‹ 返回</Text></Pressable>
          <Text style={styles.readerHeaderTitle}>正在阅读</Text>
          <Text style={styles.headerAction}>Aa</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.readerContent}
          onScrollBeginDrag={() => updateProgress(currentBook.id, 37)}
          scrollEventThrottle={300}
        >
          <Text style={styles.chapterLabel}>第一章 · 故事的开始</Text>
          <Text style={styles.readerTitle}>{currentBook.title}</Text>
          <Text style={styles.readerParagraph}>
            {currentBook.description}
            {"\n\n"}
            这是私人小说阅读器的第一版阅读页面。接下来我们会加入真正的章节内容、目录跳转、字体设置、阅读背景和更精确的阅读进度记录。
            {"\n\n"}
            阅读器会尽量保持清爽，让文字成为页面的主角。你可以在这里继续阅读，也可以随时返回书架。
            {"\n\n"}
            当前显示的是内置演示文本，不代表真实小说内容。
          </Text>
          <View style={styles.readerFooter}>
            <Text style={styles.muted}>第 1 章</Text>
            <Text style={styles.muted}>已读 {currentBook.progress}%</Text>
          </View>
        </ScrollView>
        <View style={styles.playerBar}>
          <View>
            <Text style={styles.playerHint}>系统中文语音朗读</Text>
            <Text style={styles.playerSub}>可使用 iPhone 系统语音</Text>
          </View>
          <Pressable onPress={speakCurrentBook} style={styles.playerButton}>
            <Text style={styles.playerAction}>{isSpeaking ? "停止朗读" : "开始朗读"}</Text>
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
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>DISCOVER</Text>
            <Text style={styles.welcomeTitle}>发现下一段好故事。</Text>
            <Text style={styles.welcomeSub}>在线搜索将在书源功能完成后开放。</Text>
          </View>
          <Text style={styles.sectionTitle}>题材分类</Text>
          <View style={styles.categoryGrid}>
            {["玄幻", "都市", "科幻", "悬疑", "历史", "奇幻"].map((item) => (
              <View key={item} style={styles.categoryCard}><Text style={styles.categoryText}>{item}</Text></View>
            ))}
          </View>
          <Text style={styles.note}>目前展示的是界面原型，后续会接入可用的在线书源。</Text>
        </ScrollView>
      )}

      {tab === "书源" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>SOURCES</Text>
            <Text style={styles.welcomeTitle}>管理你的阅读来源。</Text>
            <Text style={styles.welcomeSub}>计划支持导入 GitHub JSON 书源。</Text>
          </View>
          <View style={styles.sourceCard}>
            <Text style={styles.sourceTitle}>书源功能开发中</Text>
            <Text style={styles.note}>下一阶段会实现订阅地址、导入校验、启用/禁用和更新状态。</Text>
          </View>
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
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 5 },
  categoryCard: { width: "30%", minHeight: 82, borderRadius: 16, backgroundColor: "#EAE9E1", alignItems: "center", justifyContent: "center" },
  categoryText: { color: "#55594D", fontSize: 16, fontWeight: "700" },
  note: { color: "#918D82", fontSize: 12, lineHeight: 19, marginTop: 12 },
  sourceCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#EEECE5" },
  sourceTitle: { color: "#33352D", fontSize: 16, fontWeight: "800" },
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
