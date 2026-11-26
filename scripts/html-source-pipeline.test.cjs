const test=require("node:test"),assert=require("node:assert/strict");
const {parseNovelSourceJson}=require("../.test-build/source.js");
const {createSourceHttpClient}=require("../.test-build/source-runtime.js");
const {searchNovelSource}=require("../.test-build/source-search.js");
const {fetchNovelDetail,fetchNovelChapterList,fetchNovelChapterContent}=require("../.test-build/source-catalog.js");
const base="https://html-mock.example.invalid";
const source=parseNovelSourceJson(JSON.stringify({name:"HTML 联调源",baseUrl:base,searchUrl:base+"/search?q={keyword}",bookUrl:base+"/book/1",chapterListUrl:base+"/chapters",chapterUrl:base+"/chapter",htmlRules:{search:{itemSelector:".book",titleSelector:"a",urlSelector:"a",authorSelector:".author"},detail:{titleSelector:"h1",descriptionSelector:".intro"},chapters:{itemSelector:".chapter",titleSelector:"a",urlSelector:"a"},content:{contentSelector:"#content",titleSelector:"h2"}}}));
source.id="html-mock";source.enabled=true;source.importedAt=1;
const responses={
 "/search":'<div class="book"><a href="/book/1">星海来信</a><span class="author">作者甲</span></div>',
 "/book/1":'<h1>星海来信</h1><p class="intro">详情简介</p>',
 "/chapters":'<div class="chapter"><a href="/chapter/1">第一章</a></div>',
 "/chapter/1":'<article id="content"><h2>第一章</h2><p>正文第一段。</p><p>正文第二段。</p></article>'
};
const fetcher=async(input)=>{const u=new URL(String(input));const body=responses[u.pathname];return{ok:!!body,status:body?200:404,url:u.toString(),headers:{get:()=> "text/html; charset=utf-8"},text:async()=>body||""};};
test("HTML source completes search, detail, TOC and content with configured CSS rules",async()=>{const client=createSourceHttpClient(source,fetcher);const page=await searchNovelSource(source,"星海来信",client);assert.equal(page.items[0].title,"星海来信");const detail=await fetchNovelDetail(source,page.items[0],client);assert.equal(detail.description,"详情简介");const chapters=await fetchNovelChapterList(source,page.items[0],client);assert.equal(chapters.length,1);const content=await fetchNovelChapterContent(source,chapters[0],client);assert.equal(content.title,"第一章");assert.match(content.content,/正文第二段/);});
test("HTML parser configuration rejects missing required selectors",()=>{assert.throws(()=>parseNovelSourceJson(JSON.stringify({name:"bad",baseUrl:base,searchUrl:base+"/s",bookUrl:base+"/b",chapterListUrl:base+"/c",chapterUrl:base+"/p",htmlRules:{search:{itemSelector:".book",titleSelector:"a"}}})));});


test("biquges123 completes HTML search, CDN cover, detail, chapter list and content", async () => {
  const site = "https://www.biquges123.com";
  const biquges = parseNovelSourceJson(JSON.stringify({
    name: "新笔趣阁（biquges123）",
    baseUrl: site + "/",
    searchUrl: site + "/search?keyword={keyword}&page={page}",
    bookUrl: site + "/{bookUrl}",
    chapterListUrl: site + "/{bookUrl}",
    chapterUrl: site + "/{chapterUrl}",
    htmlRules: {
      search: {
        itemSelector: ".hot_4_item", titleSelector: ".hot_name", urlSelector: "a",
        authorSelector: ".author", descriptionSelector: ".hot_des",
        coverSelector: "img", coverAttribute: "src"
      },
      detail: {
        titleSelector: "h1.info_title",
        authorSelector: ".info_ct > div:nth-child(2)",
        descriptionSelector: ".des"
      },
      chapters: { itemSelector: ".list li", titleSelector: "a", urlSelector: "a" },
      content: { contentSelector: "article.article", titleSelector: "h1" }
    }
  }));
  biquges.id = "biquges123-web";
  biquges.enabled = true;
  biquges.importedAt = 1;

  const pages = {
    "/search": '<ul><li class="hot_4_item"><a href="/34806"><img src="https://cdn.biquge7.top/www.biquge7.top/imgs/34806.jpg"><div class="hot_name"><mark>斗罗大陆</mark></div><span class="author">唐家三少</span><p class="hot_des">唐门外门弟子唐三。</p></a></li></ul>',
    "/34806": '<h1 class="info_title">斗罗大陆</h1><div class="info_ct"><div>状态：完结</div><div>作者：唐家三少</div></div><div class="des">简介：唐门外门弟子唐三，来到斗罗大陆。</div><div class="list"><ul><li><a href="/34806/1" title="第一章 穿越">第一章 穿越</a></li><li><a href="/34806/2" title="第二章 武魂">第二章 武魂</a></li></ul></div>',
    "/34806/1": '<article class="article"><h1>第一章 穿越</h1><p>唐三来到了斗罗大陆。</p><p>故事从这里开始。</p></article>'
  };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    const body = pages[url.pathname];
    return {
      ok: !!body, status: body ? 200 : 404, url: url.toString(),
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => body || ""
    };
  };
  const client = createSourceHttpClient(biquges, fetchImpl);
  const page = await searchNovelSource(biquges, "斗罗大陆", client);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].coverUrl, "https://cdn.biquge7.top/www.biquge7.top/imgs/34806.jpg");
  const detail = await fetchNovelDetail(biquges, page.items[0], client);
  assert.equal(detail.title, "斗罗大陆");
  assert.equal(detail.author, "唐家三少");
  assert.match(detail.description, /斗罗大陆/);
  const chapters = await fetchNovelChapterList(biquges, page.items[0], client);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[1].title, "第二章 武魂");
  const content = await fetchNovelChapterContent(biquges, chapters[0], client);
  assert.equal(content.title, "第一章 穿越");
  assert.match(content.content, /故事从这里开始/);
});
