const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSearchText, scoreNovelSearchMatch, rankNovelSearchResults, updateSearchPerformanceMetric, rankSourcesByPerformance, runSearchPool } = require("../.test-build/search-ranking.js");
test("normalizes spaces, punctuation and full-width characters", () => {
  assert.equal(normalizeSearchText(" 斗罗：武魂·菩提树 "), "斗罗武魂菩提树");
  assert.equal(normalizeSearchText("ＡＢＣ"), "abc");
});
test("ranks exact, prefix and partial title matches", () => {
  const items = [{title:"斗罗大陆外传"},{title:"斗罗大陆"},{title:"武魂斗罗大陆"},{title:"斗罗大陆之武魂"}];
  const ranked = rankNovelSearchResults(items, "斗罗大陆");
  assert.equal(ranked[0].title, "斗罗大陆");
  assert.equal(scoreNovelSearchMatch(ranked[0], "斗罗大陆"), 1000);
  assert.ok(scoreNovelSearchMatch({ title: "斗罗大陆外传" }, "斗罗大陆") > scoreNovelSearchMatch({ title: "武魂斗罗大陆" }, "斗罗大陆"));
});
test("fuzzy matching handles a small title typo", () => {
  assert.ok(scoreNovelSearchMatch({title:"斗罗大陆"}, "斗罗大路") > 0);
});
test("updates smoothed source performance and failure counts", () => {
  const first = updateSearchPerformanceMetric(undefined,"a",1000,true,4,10);
  const second = updateSearchPerformanceMetric(first,"a",500,true,2,20);
  const failed = updateSearchPerformanceMetric(second,"a",2000,false,0,30);
  assert.equal(first.averageLatencyMs,1000); assert.equal(second.averageLatencyMs,850);
  assert.equal(failed.failureCount,1); assert.equal(failed.successCount,2);
});
test("ranks fast and reliable sources before slow and unreliable sources", () => {
  const sources=[{id:"slow"},{id:"fast"},{id:"new"}];
  const metrics={
    slow:{sourceId:"slow",averageLatencyMs:5000,successCount:1,failureCount:3,lastResultCount:1,updatedAt:1},
    fast:{sourceId:"fast",averageLatencyMs:500,successCount:8,failureCount:0,lastResultCount:3,updatedAt:1}
  };
  assert.deepEqual(rankSourcesByPerformance(sources,metrics).map(x=>x.id),["fast","slow","new"]);
});
test("uses source health checks to prioritize usable sources before untested ones", () => {
  const sources = [
    { id: "untested" },
    { id: "failed", healthLevel: "不可用" },
    { id: "partial", healthLevel: "部分可用" },
    { id: "healthy", healthLevel: "完全可用" }
  ];
  assert.deepEqual(rankSourcesByPerformance(sources, {}).map(source => source.id),
    ["healthy", "partial", "failed", "untested"]);
});

test("keeps unavailable sources behind usable ones even when old failure latency was fast", () => {
  const sources = [
    { id: "unavailable", healthLevel: "不可用" },
    { id: "partial", healthLevel: "部分可用" },
    { id: "healthy", healthLevel: "完全可用" }
  ];
  const metrics = {
    unavailable: { sourceId: "unavailable", averageLatencyMs: 1, successCount: 0, failureCount: 12, lastResultCount: 0, updatedAt: 1 },
    partial: { sourceId: "partial", averageLatencyMs: 10, successCount: 1, failureCount: 0, lastResultCount: 1, updatedAt: 1 },
    healthy: { sourceId: "healthy", averageLatencyMs: 800, successCount: 8, failureCount: 0, lastResultCount: 3, updatedAt: 1 }
  };
  assert.deepEqual(rankSourcesByPerformance(sources, metrics).map(source => source.id),
    ["healthy", "partial", "unavailable"]);
});

test("search pool emits results progressively and respects concurrency", async () => {
  const events=[]; let active=0; let maxActive=0;
  const outcomes=await runSearchPool([1,2,3,4,5],async value=>{
    active++; maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,value===1?30:5)); active--; return value*10;
  },outcome=>events.push(outcome.source),{concurrency:2});
  assert.equal(outcomes.length,5); assert.equal(maxActive,2); assert.equal(events[0],2); assert.equal(events.length,5);
});
test("search pool stops scheduling after cancellation", async () => {
  let cancelled=false; const seen=[];
  const outcomes=await runSearchPool([1,2,3,4],async value=>{
    seen.push(value); await new Promise(resolve=>setTimeout(resolve,5)); return value;
  },()=>{cancelled=true;},{concurrency:1,isCancelled:()=>cancelled});
  assert.deepEqual(seen,[1]); assert.equal(outcomes.length,1);
});

test("search pool returns partial results at its deadline and ignores late completions", async () => {
  let active = 0;
  let deadlineCalled = false;
  const settled = [];
  const started = Date.now();
  const outcomes = await runSearchPool([1,2,3,4], async value => {
    active++;
    await new Promise(resolve => setTimeout(resolve, value === 1 ? 5 : 120));
    active--;
    return value;
  }, outcome => settled.push(outcome.source), {
    concurrency: 2,
    deadlineMs: 25,
    onDeadline: () => { deadlineCalled = true; }
  });
  assert.equal(deadlineCalled, true);
  assert.deepEqual(outcomes.map(item => item.source), [1]);
  assert.deepEqual(settled, [1]);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.deepEqual(settled, [1]);
});
