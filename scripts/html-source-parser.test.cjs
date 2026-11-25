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
