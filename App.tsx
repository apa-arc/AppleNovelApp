import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  StyleSheet,
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
};

const SAMPLE_BOOKS: Book[] = [
  {
    id: "1",
    title: "星海漫游指南",
    author: "示例作者",
    description: "一段关于远方、选择与成长的故事。这里是演示书籍，用于体验书架和阅读界面。",
    category: "科幻",
    progress: 36,
    color: "#DCE8F8",
  },
  {
    id: "2",
    title: "山海旧闻",
    author: "示例作者",
    description: "从一座临海小城开始，寻找散落在旧时光里的故事。",
    category: "奇幻",
    progress: 12,
    color: "#F4E6D8",
  },
  {
    id: "3",
    title: "长街灯火",
    author: "示例作者",
    description: "平凡街巷里的日常与温暖。",
    category: "都市",
    progress: 0,
    color: "#E5E9DF",
  },
];

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  return (
    <View style={[styles.cover, { backgroundColor: book.color }, large && styles.coverLarge]}>
      <Text style={[styles.coverTitle, large && styles.coverTitleLarge]} numberOfLines={3}>
        {book.title}
      </Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverAuthor}>{book.author}</Text>
    </View>
  );
}

function AppButton({
  label,
  onPress,
  active = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("书架");
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [books, setBooks] = useState(SAMPLE_BOOKS);

  const filteredBooks = useMemo(
    () =>
      books.filter((book) =>
        `${book.title}${book.author}${book.category}`.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [books, query]
  );

  const openBook = (book: Book) => {
    setSelectedBook(book);
    setBooks((current) =>
      current.map((item) => (item.id === book.id ? { ...item, progress: Math.max(item.progress, 37) } : item))
    );
  };

  if (selectedBook) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.readerHeader}>
          <Pressable onPress={() => setSelectedBook(null)}>
            <Text style={styles.backText}>‹ 返回</Text>
          </Pressable>
          <Text style={styles.readerHeaderTitle}>正在阅读</Text>
          <Text style={styles.headerAction}>Aa</Text>
        </View>
        <ScrollView contentContainerStyle={styles.readerContent}>
          <Text style={styles.chapterLabel}>第一章 · 故事的开始</Text>
          <Text style={styles.readerTitle}>{selectedBook.title}</Text>
          <Text style={styles.readerParagraph}>
            {selectedBook.description}
            {"\n\n"}
            这是私人小说阅读器的第一版阅读页面。接下来我们会加入真正的章节内容、目录跳转、字体设置、阅读背景、进度保存和听书控制。
            {"\n\n"}
            阅读器会尽量保持清爽，让文字成为页面的主角。你可以在这里继续阅读，也可以随时返回书架。
            {"\n\n"}
            当前显示的是内置演示文本，不代表真实小说内容。
          </Text>
          <View style={styles.readerFooter}>
            <Text style={styles.muted}>第 1 章</Text>
            <Text style={styles.muted}>演示阅读页面</Text>
          </View>
        </ScrollView>
        <View style={styles.playerBar}>
          <Text style={styles.playerHint}>♫ 听书功能将在下一阶段接入</Text>
          <Text style={styles.playerAction}>朗读</Text>
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
          <Text style={styles.pageTitle}>{tab === "书架" ? "书架" : tab}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>阅</Text>
        </View>
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
            <Text style={styles.sectionTitle}>最近在读</Text>
            <Text style={styles.sectionMeta}>{filteredBooks.length} 本藏书</Text>
          </View>

          {filteredBooks.length === 0 ? (
            <Text style={styles.emptyText}>没有找到相关书籍，试试其他关键词。</Text>
          ) : (
            filteredBooks.map((book) => (
              <Pressable key={book.id} style={styles.bookRow} onPress={() => openBook(book)}>
                <BookCover book={book} />
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle}>{book.title}</Text>
                  <Text style={styles.bookAuthor}>{book.author} · {book.category}</Text>
                  <Text style={styles.bookDescription} numberOfLines={2}>{book.description}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${book.progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{book.progress > 0 ? `已读 ${book.progress}%` : "尚未开始"}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {tab === "发现" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>DISCOVER</Text>
            <Text style={styles.welcomeTitle}>发现下一段好故事。</Text>
            <Text style={styles.welcomeSub}>书源接入后，这里将支持在线搜索。</Text>
          </View>
          <Text style={styles.sectionTitle}>题材分类</Text>
          <View style={styles.categoryGrid}>
            {["玄幻", "都市", "科幻", "悬疑", "历史", "奇幻"].map((item) => (
              <View key={item} style={styles.categoryCard}>
                <Text style={styles.categoryText}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>目前展示的是界面原型，在线搜索和真实书籍数据将在书源模块完成后接入。</Text>
        </ScrollView>
      )}

      {tab === "书源" && (
        <ScrollView contentContainerStyle={styles.pageContent}>
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeEyebrow}>SOURCES</Text>
            <Text style={styles.welcomeTitle}>管理你的阅读来源。</Text>
            <Text style={styles.welcomeSub}>后续支持导入 GitHub 上的 JSON 书源。</Text>
          </View>
          <View style={styles.sourceCard}>
            <Text style={styles.sourceTitle}>尚未添加书源</Text>
            <Text style={styles.note}>下一阶段会实现书源订阅地址、导入校验、启用/禁用和更新状态。</Text>
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
          {["阅读设置", "听书设置", "数据与备份", "关于私人小说"].map((item) => (
            <View key={item} style={styles.settingRow}>
              <Text style={styles.settingText}>{item}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          ))}
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
  coverLarge: { width: 120, height: 166, padding: 13 },
  coverTitle: { color: "#45483E", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  coverTitleLarge: { fontSize: 19, lineHeight: 26 },
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
  playerBar: { minHeight: 52, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEECE5", paddingHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  playerHint: { color: "#8D897F", fontSize: 12 },
  playerAction: { color: "#65745D", fontWeight: "800", fontSize: 13 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#F0EFE9" },
  pillActive: { backgroundColor: "#65745D" },
  pillText: { color: "#777368", fontSize: 12 },
  pillTextActive: { color: "#FFFFFF" },
});
