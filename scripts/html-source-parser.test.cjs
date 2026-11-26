const fs=require("node:fs"),path=require("node:path");
const test=require("node:test"),assert=require("node:assert/strict"),p=require("../.test-build/html-source-parser.js");
const html='<ul><li class="book"><a class="title" href="/b/1">星海&amp;来信</a><span class="author">作者甲</span><p class="intro">简介</p></li><li class="book"><a class="title" href="/b/2">第二本</a></li></ul><div id="detail"><h1>书名</h1><p class="desc">详情简介</p></div><ul class="chapters"><li class="chapter"><a href="/c/1">第一章</a></li><li class="chapter"><a href="/c/2">第二章</a></li></ul><article id="content"><h2>第一章</h2><p>正文第一段。</p><p>正文第二段。</p><p>换行<br>后续&mdash;</p><script>ignored()</script></article>';
test("CSS selectors parse HTML search, detail, TOC and chapter content",()=>{const r={search:{itemSelector:"li.book",titleSelector:"a.title",authorSelector:".author",descriptionSelector:".intro",urlSelector:"a.title"},detail:{titleSelector:"#detail h1",descriptionSelector:"#detail .desc"},chapters:{itemSelector:"ul.chapters > li.chapter",titleSelector:"a",urlSelector:"a"},content:{contentSelector:"article#content",titleSelector:"#content h2"}};const s=p.parseHtmlSearchResults(html,"s1","测试源","星海","https://example.com/search",r.search);assert.equal(s.items.length,2);assert.equal(s.items[0].title,"星海&来信");assert.equal(s.items[0].bookUrl,"https://example.com/b/1");assert.equal(p.parseHtmlNovelDetail(html,s.items[0],r.detail).title,"书名");const c=p.parseHtmlChapterList(html,"b","https://example.com",r.chapters);assert.equal(c.length,2);assert.equal(c[1].url,"https://example.com/c/2");const body=p.parseHtmlChapterContent(html,"fallback",r.content);assert.equal(body.title,"第一章");assert.match(body.content,/正文第一段/);assert.ok(body.content.includes("换行\n后续—"));assert.doesNotMatch(body.content,/ignored/);});
test("HTML parsing rejects unsafe links and missing selectors",()=>{assert.throws(()=>p.parseHtmlChapterList('<li><a href="http://bad.example">坏链接</a></li>',"b","https://good.example",{itemSelector:"li",titleSelector:"a",urlSelector:"a"}));assert.throws(()=>p.parseHtmlChapterList('<li><a href="https://evil.example/ch">跨域</a></li>',"b","https://good.example",{itemSelector:"li",titleSelector:"a",urlSelector:"a"}));assert.throws(()=>p.parseHtmlChapterContent("<p>空</p>","x",{contentSelector:"#missing"}));});
test("CSS parser supports compound, descendant, child, attribute and nth-child selectors",()=>{const root=p.parseHtmlDocument('<main id="main"><div class="x"><a data-id="1">one</a></div><div class="x"><a data-id="2">two</a></div></main>');assert.equal(p.selectHtmlNodes(root,"main > div.x a[data-id='2']").length,1);assert.equal(p.selectHtmlNodes(root,"#main div.x:nth-child(2)").length,1);});

test("unsupported pseudo selectors fail clearly instead of being ignored",()=>{const root=p.parseHtmlDocument("<div><p>text</p></div>");assert.throws(()=>p.selectHtmlNodes(root,"div:has(p)"),/暂不支持/);});

test("supports attribute suffix selectors for chapter links",()=>{const root=p.parseHtmlDocument('<div><a href="/book/1.html">第一章</a><a href="/book/cover.jpg">封面</a></div>');assert.equal(p.selectHtmlNodes(root,"a[href$='.html']").length,1);});

test("supports nth-of-type, nth-child ranges and meta content attributes",()=>{const html='<div><span>前置</span><p>第一段</p><p>第二段</p><p>第三段</p><meta property="og:description" content="书籍简介"></div>';const root=p.parseHtmlDocument(html);assert.equal(p.selectHtmlNodes(root,"p:nth-of-type(2)")[0]&&p.htmlNodeText(p.selectHtmlNodes(root,"p:nth-of-type(2)")[0]),"第二段");assert.equal(p.selectHtmlNodes(root,"p:nth-child(n+3)").length,2);const detail=p.parseHtmlNovelDetail(html,{id:"b",sourceId:"s",sourceName:"源",title:"fallback",author:"未知",description:""},{descriptionSelector:"meta[property='og:description']",descriptionAttribute:"content"});assert.equal(detail.description,"书籍简介");});
test("supports self-selected anchor chapter lists",()=>{const chapters=p.parseHtmlChapterList('<div id="toc"><a href="/c/1">第一章</a><a href="/c/2">第二章</a></div>',"b","https://example.com",{itemSelector:"#toc a",titleSelector:":self",urlSelector:":self"});assert.equal(chapters.length,2);assert.equal(chapters[1].title,"第二章");});

test("all selectors in the 26-source subscription use supported App CSS syntax",()=>{const raw=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures","novel-source-subscription.json"),"utf8"));const root=p.parseHtmlDocument("<html><body><div></div></body></html>");for(const source of raw.sources){const rules=source.appConfig.htmlRules;for(const [group,config] of Object.entries(rules)){for(const [key,selector] of Object.entries(config)){if(!key.toLowerCase().includes("selector")||selector===":self")continue;assert.doesNotThrow(()=>p.selectHtmlNodes(root,selector),source.id+" "+group+"."+key+" "+selector);}}}});

test("HTML search accepts lazy-loaded covers hosted on a separate CDN", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">封面书</a><img class="cover" data-src="http://img.cdn.example/cover.jpg"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", { itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title", coverSelector: "img.cover" });
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/cover.jpg");
});


test("HTML search automatically extracts lazy cover images when a source has no cover selector", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">自动封面</a><img src="placeholder.gif" data-src="//img.cdn.example/real-cover.jpg"></li><li class="book"><a class="title" href="/book/2">第二本</a><img data-original="http://img.cdn.example/second.jpg"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", { itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title" });
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/real-cover.jpg");
  assert.equal(page.items[1].coverUrl, "https://img.cdn.example/second.jpg");
});

test("HTML search recognizes additional lazy image attributes before placeholder src", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">懒加载封面</a><img src="placeholder.gif" data-actualsrc="//img.cdn.example/actual.jpg"></li><li class="book"><a class="title" href="/book/2">第二本</a><img src="blank.png" data-ks-lazyload="http://img.cdn.example/ks.jpg"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", { itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title" });
  assert.equal(page.items[0].coverUrl, "https://img.cdn.example/actual.jpg");
  assert.equal(page.items[1].coverUrl, "https://img.cdn.example/ks.jpg");
});

test("HTML search extracts picture sources, background covers and newer lazy attributes while skipping placeholders", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">Picture</a><img src="placeholder.gif" data-book-cover="//cdn.example/picture.jpg"><picture><source srcset="//cdn.example/picture-2.jpg 2x"></picture></li><li class="book"><a class="title" href="/book/2">Background</a><div class="cover" style="background-image:url(\'//cdn.example/bg.jpg\')"></div></li><li class="book"><a class="title" href="/book/3">Later image</a><img src="blank.png"><img data-src="//cdn.example/later.jpg"></li><li class="book"><a class="title" href="/book/4">Placeholder</a><img src="blank.png"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", { itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title" });
  assert.equal(page.items[0].coverUrl, "https://cdn.example/picture.jpg");
  assert.equal(page.items[1].coverUrl, "https://cdn.example/bg.jpg");
  assert.equal(page.items[2].coverUrl, "https://cdn.example/later.jpg");
  assert.equal(page.items[3].coverUrl, undefined);
});

test("HTML cover extraction prefers the highest-resolution srcset candidate", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">高清封面</a><img src="small.jpg" srcset="/small.jpg 320w, /large.jpg 1200w, /medium.jpg 640w"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", { itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title" });
  assert.equal(page.items[0].coverUrl, "https://books.example/large.jpg");
});


test("HTML search and detail read Legado @content metadata attributes", () => {
  const html = '<ul><li class="book"><meta name="title" content="搜索书名"><meta name="author" content="搜索作者"><meta name="description" content="搜索简介"><a href="/book/1">详情</a></li></ul><meta name="title" content="详情书名"><meta name="author" content="详情作者"><meta name="description" content="详情简介">';
  const search = p.parseHtmlSearchResults(html, "s1", "源", "搜索", "https://books.example/search", {
    itemSelector: "li.book",
    titleSelector: "meta[name=title]",
    titleAttribute: "content",
    authorSelector: "meta[name=author]",
    authorAttribute: "content",
    descriptionSelector: "meta[name=description]",
    descriptionAttribute: "content",
    urlSelector: "a"
  });
  assert.equal(search.items[0].title, "搜索书名");
  assert.equal(search.items[0].author, "搜索作者");
  assert.equal(search.items[0].description, "搜索简介");
  const detailHtml = '<meta name="title" content="详情书名"><meta name="author" content="详情作者"><meta name="description" content="详情简介">';
  const detail = p.parseHtmlNovelDetail(detailHtml, search.items[0], {
    titleSelector: "meta[name=title]",
    titleAttribute: "content",
    authorSelector: "meta[name=author]",
    authorAttribute: "content",
    descriptionSelector: "meta[name=description]",
    descriptionAttribute: "content"
  });
  assert.equal(detail.title, "详情书名");
  assert.equal(detail.author, "详情作者");
  assert.equal(detail.description, "详情简介");
});


test("Legado @text metadata uses element text instead of an HTML attribute", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">文本书名</a><span class="author">文本作者</span><p class="intro">文本简介</p></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "文本", "https://books.example/search", {
    itemSelector: "li.book",
    titleSelector: "a.title",
    titleAttribute: "text",
    authorSelector: ".author",
    authorAttribute: "text",
    descriptionSelector: ".intro",
    descriptionAttribute: "text",
    urlSelector: "a.title"
  });
  assert.equal(page.items[0].title, "文本书名");
  assert.equal(page.items[0].author, "文本作者");
  assert.equal(page.items[0].description, "文本简介");
});

test("HTML chapter titles support Legado content attributes", () => {
  const chapters = p.parseHtmlChapterList('<ul><li><a data-title="序章" href="/c/1">占位文本</a></li></ul>', "b", "https://example.com", {
    itemSelector: "li", titleSelector: "a", titleAttribute: "data-title", urlSelector: "a"
  });
  assert.equal(chapters[0].title, "序章");
});


test("HTML cover extraction supports data-srcset and density descriptors", () => {
  const html = '<ul><li class="book"><a class="title" href="/book/1">data-srcset</a><img src="placeholder.png" data-srcset="/cover-small.jpg 1x, //cdn.example/cover-hd.jpg 2x"></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "封面", "https://books.example/search", {
    itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title"
  });
  assert.equal(page.items[0].coverUrl, "https://cdn.example/cover-hd.jpg");
});


test("HTML search accepts configured alternate source origins but rejects unconfigured hosts", () => {
  const html = '<ul><li class="book"><a class="title" href="https://www.books.example/book/1">跨域书</a></li><li class="book"><a class="title" href="https://evil.example/book/2">恶意链接</a></li></ul>';
  const page = p.parseHtmlSearchResults(html, "s1", "源", "跨域", "https://m.books.example/search", {
    itemSelector: "li.book", titleSelector: "a.title", urlSelector: "a.title"
  }, ["https://www.books.example"]);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].bookUrl, "https://www.books.example/book/1");
});

test("HTML chapter links accept configured alternate source origins", () => {
  const chapters = p.parseHtmlChapterList('<ul><li><a href="https://www.books.example/chapter/1">第一章</a></li></ul>', "b", "https://m.books.example/toc", {
    itemSelector: "li", titleSelector: "a", urlSelector: "a"
  }, ["https://www.books.example"]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].url, "https://www.books.example/chapter/1");
});


test("biquges123 live search markup extracts its cross-domain CDN cover", () => {
  const html = '<ul><li class="hot_4_item"><a href="/34806" title="斗罗大陆"><div class="cover"><img src="https://cdn.biquge7.top/www.biquge7.top/imgs/34806.jpg"></div><div class="hot_4_rt"><div class="hot_top"><div class="hot_name">斗罗大陆</div><div class="author">唐家三少</div></div><p class="hot_des">唐门外门弟子唐三，来到斗罗大陆。</p></div></a></li></ul>';
  const page = p.parseHtmlSearchResults(html, "biquges123-web", "新笔趣阁", "斗罗大陆", "https://www.biquges123.com/search?keyword=斗罗大陆", {
    itemSelector: ".hot_4_item",
    titleSelector: ".hot_name",
    authorSelector: ".author",
    descriptionSelector: ".hot_des",
    urlSelector: "a",
    coverSelector: "img",
    coverAttribute: "src"
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, "斗罗大陆");
  assert.equal(page.items[0].author, "唐家三少");
  assert.equal(page.items[0].bookUrl, "https://www.biquges123.com/34806");
  assert.equal(page.items[0].coverUrl, "https://cdn.biquge7.top/www.biquge7.top/imgs/34806.jpg");
});


test("HTML detail extracts Open Graph and Twitter poster covers from CDN metadata", () => {
  const summary = {
    id: "book-1", sourceId: "source-1", sourceName: "测试源",
    title: "星海来信", author: "作者甲", description: "简介",
    bookUrl: "https://books.example/book/1"
  };
  const html = '<html><head><meta property="og:image" content="//cdn.books.example/covers/1.jpg"><meta name="twitter:image" content="https://cdn.books.example/covers/twitter.jpg"></head><body><h1>星海来信</h1></body></html>';
  const detail = p.parseHtmlNovelDetail(html, summary, {});
  assert.equal(detail.coverUrl, "https://cdn.books.example/covers/1.jpg");
  assert.equal(detail.title, "星海来信");
});

test("HTML detail supports explicit relative cover selectors and preserves search cover fallback", () => {
  const summary = {
    id: "book-2", sourceId: "source-1", sourceName: "测试源",
    title: "第二本", author: "作者乙", description: "简介",
    coverUrl: "https://cdn.books.example/covers/search.jpg",
    bookUrl: "https://books.example/book/2"
  };
  const html = '<div class="book-info"><img class="poster" data-cover="/images/detail.jpg"></div>';
  const detail = p.parseHtmlNovelDetail(html, summary, { coverSelector: "img.poster", coverAttribute: "data-cover" });
  assert.equal(detail.coverUrl, "https://books.example/images/detail.jpg");
});


test("HTML detail falls through placeholder og:image to a valid alternate poster", () => {
  const summary = {
    id: "book-3", sourceId: "source-1", sourceName: "测试源",
    title: "第三本", author: "作者丙", description: "",
    bookUrl: "https://books.example/book/3"
  };
  const html = '<head><meta property="og:image" content="/images/placeholder-cover.jpg"><meta name="twitter:image" content="//cdn.books.example/covers/real.jpg"></head>';
  const detail = p.parseHtmlNovelDetail(html, summary, {});
  assert.equal(detail.coverUrl, "https://cdn.books.example/covers/real.jpg");
});


test("HTML detail does not mistake an empty og:image for the book page URL", () => {
  const summary = {
    id: "book-4", sourceId: "source-1", sourceName: "测试源",
    title: "第四本", author: "作者丁", description: "",
    bookUrl: "https://books.example/book/4"
  };
  const detail = p.parseHtmlNovelDetail('<meta property="og:image" content="">', summary, {});
  assert.equal(detail.coverUrl, undefined);
});


test("HTML detail extracts lazy-loaded cover images from common novel selectors", () => {
  const summary = {
    id: "book-5", sourceId: "source-1", sourceName: "测试源",
    title: "第五本", author: "作者戊", description: "",
    bookUrl: "https://books.example/book/5"
  };
  const html = '<div id="fmimg"><img src="/images/placeholder.png" data-original="//cdn.books.example/covers/book5.jpg"></div>';
  const detail = p.parseHtmlNovelDetail(html, summary, {});
  assert.equal(detail.coverUrl, "https://cdn.books.example/covers/book5.jpg");
});

test("HTML cover extraction rejects private network and local image URLs", () => {
  const summary = {
    id: "book-6", sourceId: "source-1", sourceName: "测试源",
    title: "第六本", author: "作者己", description: "",
    bookUrl: "https://books.example/book/6"
  };
  for (const url of ["http://127.0.0.1/cover.jpg", "http://192.168.1.8/cover.jpg", "http://localhost/cover.jpg", "http://169.254.169.254/latest/meta-data"]) {
    const detail = p.parseHtmlNovelDetail('<meta property="og:image" content="' + url + '">', summary, {});
    assert.equal(detail.coverUrl, undefined, url);
  }
});

test("HTML cover extraction still accepts a public cross-domain CDN", () => {
  const summary = {
    id: "book-7", sourceId: "source-1", sourceName: "测试源",
    title: "第七本", author: "作者庚", description: "",
    bookUrl: "https://books.example/book/7"
  };
  const detail = p.parseHtmlNovelDetail('<meta property="og:image" content="https://cdn.public.example/cover.jpg">', summary, {});
  assert.equal(detail.coverUrl, "https://cdn.public.example/cover.jpg");
});
