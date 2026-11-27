const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJsonSearchResults, buildSearchRequestUrl, searchNovelSource, resolveCoverImageUrl } = require("../.test-build/source-search.js");
const source = { id:"s1", name:"测试源", baseUrl:"https://books.example", searchUrl:"https://books.example/search?keyword={keyword}", bookUrl:"https://books.example/book", chapterListUrl:"https://books.example/toc", chapterUrl:"https://books.example/chapter", enabled:true, importedAt:1 };

test("builds encoded keyword URL from template", () => {
  assert.equal(buildSearchRequestUrl(source.searchUrl,"三体 星空"),"https://books.example/search?keyword=%E4%B8%89%E4%BD%93%20%E6%98%9F%E7%A9%BA");
});
test("adds q parameter without template", () => {
  assert.equal(buildSearchRequestUrl("https://books.example/search","三体"),"https://books.example/search?q=%E4%B8%89%E4%BD%93");
});
test("parses common JSON envelopes and fields", () => {
  const page=parseJsonSearchResults(JSON.stringify({data:{list:[
    {bookName:"三体",authorName:"刘慈欣",intro:"科幻小说",bookUrl:"/book/1",cover:"/cover/1.jpg"},
    {title:"流浪地球",author:"刘慈欣",url:"https://books.example/book/2"},
    {title:"缺少链接",author:"作者"}
  ]}}),source,"三体","https://books.example/search");
  assert.equal(page.items.length,2);
  assert.equal(page.items[0].title,"三体");
  assert.equal(page.items[0].bookUrl,"https://books.example/book/1");
  assert.equal(page.items[0].coverUrl,"https://books.example/cover/1.jpg");
});
test("rejects non-JSON and unknown list shape", () => {
  assert.throws(()=>parseJsonSearchResults("<html/>",source,"x",source.baseUrl),/不是 JSON/);
  assert.throws(()=>parseJsonSearchResults(JSON.stringify({message:"none"}),source,"x",source.baseUrl),/没有在 JSON/);
});
test("search uses bounded client and maps result", async () => {
  let calledUrl="";
  const client={get:async(_endpoint,url)=>{calledUrl=url;return {url:"https://books.example/search?keyword=x",status:200,contentType:"application/json",body:JSON.stringify({results:[{title:"测试书",author:"作者",url:"/book/x"}]})};}};
  const page=await searchNovelSource(source,"x",client);
  assert.equal(calledUrl,"https://books.example/search?keyword=x");
  assert.equal(page.items[0].title,"测试书");
});
test("empty keyword is rejected", async () => {
  await assert.rejects(searchNovelSource(source," ",{get:async()=>{throw Error("unexpected");}}),/请输入小说名称/);
});

test("replaces page placeholder in search templates",()=>{assert.equal(buildSearchRequestUrl("https://books.example/search?keyword={keyword}&page={page}","斗罗大陆"),"https://books.example/search?keyword=%E6%96%97%E7%BD%97%E5%A4%A7%E9%99%86&page=1");});

test("accepts external CDN cover URLs and upgrades legacy HTTP image links", () => {
  const page = parseJsonSearchResults(JSON.stringify({ data: [{ title: "封面测试", author: "作者", url: "/book/cover", cover: "http://img.cdn.example/cover.jpg" }] }), source, "封面", "https://books.example/search");
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/cover.jpg");
  assert.equal(resolveCoverImageUrl("//img.cdn.example/cover2.jpg", "https://books.example/search"), "https://img.cdn.example/cover2.jpg");
  assert.equal(resolveCoverImageUrl("javascript:alert(1)", "https://books.example/search"), undefined);
});

test("recognizes additional common JSON cover field names and nested image objects", () => {
  const page = parseJsonSearchResults(JSON.stringify({ data: [
    { title: "封面字段一", author: "作者", url: "/book/1", cover_image_url: "https://img.cdn.example/one.jpg" },
    { title: "封面字段二", author: "作者", url: "/book/2", bookCoverUrl: { src: "//img.cdn.example/two.jpg" } },
    { title: "封面字段三", author: "作者", url: "/book/3", image_url: "http://img.cdn.example/three.jpg" }
  ] }), source, "封面", "https://books.example/search");
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/one.jpg");
  assert.equal(page.items[1].coverUrl, "https://img.cdn.example/two.jpg");
  assert.equal(page.items[2].coverUrl, "https://img.cdn.example/three.jpg");
});

test("finds nested cover metadata and skips placeholder URLs before trying another field", () => {
  const page = parseJsonSearchResults(JSON.stringify({ data: [
    { title: "嵌套封面", author: "作者", url: "/book/nested", bookInfo: { coverImage: { url: "//img.cdn.example/nested.jpg" } } },
    { title: "占位后真实封面", author: "作者", url: "/book/fallback", cover: "blank.png", bookCoverImg: "/images/real-cover.jpg" },
    { title: "无有效封面", author: "作者", url: "/book/empty", cover: "data:image/gif;base64,AAAA", poster: "https://img.cdn.example/no-cover.png" }
  ] }), source, "封面", "https://books.example/search");
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/nested.jpg");
  assert.equal(page.items[1].coverUrl, "https://books.example/images/real-cover.jpg");
  assert.equal(page.items[2].coverUrl, undefined);
});


test("recognizes legacy cover path and small/medium image field names", () => {
  const page = parseJsonSearchResults(JSON.stringify({ data: [
    { title: "旧版封面路径", author: "作者", url: "/book/path", coverPath: "/covers/path.jpg" },
    { title: "小图字段", author: "作者", url: "/book/small", cover_small: "//img.cdn.example/small.jpg" },
    { title: "中图字段", author: "作者", url: "/book/medium", coverMedium: { href: "https://img.cdn.example/medium.jpg" } }
  ] }), source, "封面", "https://books.example/search");
  assert.equal(page.items[0].coverUrl, "https://books.example/covers/path.jpg");
  assert.equal(page.items[1].coverUrl, "https://img.cdn.example/small.jpg");
  assert.equal(page.items[2].coverUrl, "https://img.cdn.example/medium.jpg");
});


test("caches successful source searches briefly and returns independent result objects", async () => {
  const cacheSource = { ...source, id: "cache-test-source" };
  let calls = 0;
  const client = { get: async (_endpoint, url) => {
    calls += 1;
    return {
      url,
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ title: "缓存测试书", author: "作者", url: "/book/cache" }] })
    };
  } };
  const first = await searchNovelSource(cacheSource, "缓存测试", client);
  first.items[0].title = "调用方修改";
  const second = await searchNovelSource(cacheSource, "缓存测试", client);
  assert.equal(calls, 1);
  assert.equal(second.items[0].title, "缓存测试书");
});

test("maps numeric book_id to an explicit trusted bookId endpoint template", () => {
  const kuwo = {
    ...source,
    id: "kuwo",
    baseUrl: "https://appi.kuwo.cn/",
    searchUrl: "https://appi.kuwo.cn/novels/api/book/search?keyword={keyword}&pi={page}&ps=30",
    bookUrl: "https://appi.kuwo.cn/novels/api/book/{bookId}",
    chapterListUrl: "https://appi.kuwo.cn/novels/api/book/{bookId}/chapters?paging=0",
    chapterUrl: "https://appi.kuwo.cn/novels/api/book/{bookId}/chapters/{chapterId}"
  };
  const page = parseJsonSearchResults(JSON.stringify({ code: 200, data: [
    { book_id: 98765, title: "酷我测试书", author_name: "测试作者", intro: "简介", cover_url: "https://openbookcover.yuewen.com/cover.jpg" }
  ] }), kuwo, "酷我测试", "https://appi.kuwo.cn/novels/api/book/search");
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].bookUrl, "https://appi.kuwo.cn/novels/api/book/98765");
  assert.equal(page.items[0].author, "测试作者");
  assert.equal(page.items[0].coverUrl, "https://openbookcover.yuewen.com/cover.jpg");
});
