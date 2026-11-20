/** Helpers for stable, paragraph-level reader position persistence. */
export function splitReadingText(value: string): string[] {
  return value.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

export function getReadingParagraphIndex(
  scrollOffset: number,
  maxScrollOffset: number,
  paragraphCount: number
): number {
  const count = Math.max(1, Math.floor(paragraphCount));
  if (count === 1 || maxScrollOffset <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, scrollOffset / maxScrollOffset));
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

export function getReadingScrollOffset(
  paragraphIndex: number,
  paragraphCount: number,
  maxScrollOffset: number
): number {
  const count = Math.max(1, Math.floor(paragraphCount));
  if (count === 1 || maxScrollOffset <= 0) return 0;
  const safeIndex = Math.min(count - 1, Math.max(0, Math.floor(paragraphIndex)));
  return (safeIndex / (count - 1)) * maxScrollOffset;
}
