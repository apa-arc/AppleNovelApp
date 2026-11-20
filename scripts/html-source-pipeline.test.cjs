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
