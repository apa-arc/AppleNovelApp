const test=require("node:test"); const assert=require("node:assert/strict");
const {upsertReadingHistory,normalizeReadingHistory}=require("../.test-build/reading-history.js");
const entry=(bookId,updatedAt,extra={})=>({bookId,title:"小说"+bookId,author:"作者",chapterTitle:"第一章",chapterIndex:0,progress:12,updatedAt,...extra});
test("updates one record per book and sorts by activity",()=>{const r=upsertReadingHistory([entry("a",1),entry("b",2)],entry("a",3,{progress:55}));assert.deepEqual(r.map(x=>x.bookId),["a","b"]);assert.equal(r[0].progress,55);});
test("clamps progress and chapter index and respects limit",()=>{const r=upsertReadingHistory([],entry("a",1,{progress:180,chapterIndex:-3}),1);assert.equal(r[0].progress,100);assert.equal(r[0].chapterIndex,0);assert.equal(upsertReadingHistory(r,entry("b",2),1).length,1);});
test("normalization drops invalid entries and deduplicates",()=>{const r=normalizeReadingHistory([null,{},entry("a",1),entry("a",5)]);assert.equal(r.length,1);assert.equal(r[0].updatedAt,5);});
test("normalization handles invalid root values",()=>{assert.deepEqual(normalizeReadingHistory(null),[]);assert.deepEqual(normalizeReadingHistory({}),[]);});
