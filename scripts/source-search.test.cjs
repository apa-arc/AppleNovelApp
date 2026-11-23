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
