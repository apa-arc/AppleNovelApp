export type SearchPerformanceMetric = {
  sourceId: string; averageLatencyMs: number; successCount: number; failureCount: number; lastResultCount: number; updatedAt: number;
};
export type SearchableNovel = { title: string; author?: string; description?: string };
export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/[\s\p{P}\p{S}_]+/gu, "");
}
function bigrams(value: string): Set<string> {
  const chars = Array.from(value);
  if (chars.length < 2) return new Set(chars);
  const result = new Set<string>();
  for (let i = 0; i < chars.length - 1; i += 1) result.add(chars[i] + chars[i + 1]);
  return result;
}
function diceSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = bigrams(left); const b = bigrams(right); let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}
/** Match quality is independent from source latency and is used only for result ordering. */
export function scoreNovelSearchMatch(item: SearchableNovel, keyword: string): number {
  const query = normalizeSearchText(keyword);
  if (!query) return 0;
  const title = normalizeSearchText(item.title);
  const author = normalizeSearchText(item.author || "");
  const description = normalizeSearchText(item.description || "");
  if (!title) return 0;
  if (title === query) return 1000;
  if (title.startsWith(query)) return 900;
  if (title.includes(query)) return 800;
  if (author.includes(query)) return 300;
  if (description.includes(query)) return 100;
  const similarity = diceSimilarity(title, query);
  return similarity >= 0.25 ? Math.round(similarity * 700) : 0;
}
export function rankNovelSearchResults<T extends SearchableNovel>(items: T[], keyword: string): T[] {
  return items.map((item, index) => ({ item, index, score: scoreNovelSearchMatch(item, keyword) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ item }) => item);
}
export function updateSearchPerformanceMetric(previous: SearchPerformanceMetric | undefined, sourceId: string, latencyMs: number, success: boolean, resultCount: number, now = Date.now()): SearchPerformanceMetric {
  const latency = Math.max(0, Math.min(120_000, Math.round(latencyMs)));
  const oldCount = previous?.successCount ?? 0;
  const averageLatencyMs = previous && oldCount > 0 ? Math.round(previous.averageLatencyMs * 0.7 + latency * 0.3) : latency;
  return {
    sourceId, averageLatencyMs: success ? averageLatencyMs : (previous?.averageLatencyMs ?? latency),
    successCount: oldCount + (success ? 1 : 0), failureCount: (previous?.failureCount ?? 0) + (success ? 0 : 1),
    lastResultCount: success ? Math.max(0, resultCount) : (previous?.lastResultCount ?? 0), updatedAt: now
  };
}
export function rankSourcesByPerformance<T extends { id: string; healthLevel?: "完全可用" | "部分可用" | "不可用" }>(sources: T[], metrics: Record<string, SearchPerformanceMetric>): T[] {
  const healthFallbackScore = { "完全可用": 6_000, "部分可用": 12_000, "不可用": 24_000 } as const;
  return sources.map((source, index) => {
    const metric = metrics[source.id];
    const attempts = metric ? metric.successCount + metric.failureCount : 0;
    const failureRate = attempts > 0 ? metric.failureCount / attempts : 0;
    const measuredScore = metric
      ? metric.averageLatencyMs * (1 + failureRate * 2)
      : (source.healthLevel ? healthFallbackScore[source.healthLevel] : Number.POSITIVE_INFINITY);
    const healthFactor = source.healthLevel === "完全可用" ? 0.8
      : source.healthLevel === "部分可用" ? 1.25
      : source.healthLevel === "不可用" ? 2
      : 1;
    // A fast failed response is still a failed source. Keep health penalties as
    // a score floor so stale latency metrics cannot promote an unavailable source.
    const healthFloor = source.healthLevel ? healthFallbackScore[source.healthLevel] : 0;
    return { source, index, score: Math.max(measuredScore, healthFloor) * healthFactor };
  }).sort((a, b) => a.score - b.score || a.index - b.index).map(({ source }) => source);
}
export type SearchPoolOutcome<TSource, TResult> =
  | { source: TSource; ok: true; value: TResult; latencyMs: number }
  | { source: TSource; ok: false; error: unknown; latencyMs: number };
export async function runSearchPool<TSource, TResult>(
  sources: TSource[], search: (source: TSource) => Promise<TResult>,
  onSettled: (outcome: SearchPoolOutcome<TSource, TResult>) => void,
  options: { concurrency?: number; isCancelled?: () => boolean; deadlineMs?: number; onDeadline?: () => void } = {}
): Promise<SearchPoolOutcome<TSource, TResult>[]> {
  const concurrency = Math.max(1, Math.min(sources.length || 1, Math.floor(options.concurrency ?? 3)));
  const outcomes: SearchPoolOutcome<TSource, TResult>[] = [];
  let nextIndex = 0;
  let deadlineReached = false;
  const worker = async () => {
    while (nextIndex < sources.length && !deadlineReached && !options.isCancelled?.()) {
      const source = sources[nextIndex++];
      const startedAt = Date.now();
      let outcome: SearchPoolOutcome<TSource, TResult>;
      try { outcome = { source, ok: true, value: await search(source), latencyMs: Date.now() - startedAt }; }
      catch (error) { outcome = { source, ok: false, error, latencyMs: Date.now() - startedAt }; }
      if (deadlineReached || options.isCancelled?.()) continue;
      outcomes.push(outcome);
      onSettled(outcome);
    }
  };
  const workers = Promise.all(Array.from({ length: concurrency }, () => worker()));
  const deadlineMs = options.deadlineMs;
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    await workers;
    return outcomes;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      deadlineReached = true;
      options.onDeadline?.();
      resolve();
    }, deadlineMs);
  });
  await Promise.race([workers, deadline]);
  if (timer !== undefined) clearTimeout(timer);
  return outcomes.slice();
}
