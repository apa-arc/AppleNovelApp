/** Split long chapters at natural boundaries for speech synthesis providers. */
export function splitSpeechText(value: string, maxLength = 420): string[] {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const limit = Number.isFinite(maxLength) ? Math.max(80, Math.floor(maxLength)) : 420;
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [text];
  const chunks: string[] = [];
  let current = "";
  let currentLength = 0;

  const push = () => {
    const normalized = current.trim();
    if (normalized) chunks.push(normalized);
    current = "";
    currentLength = 0;
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    // Count Unicode code points rather than UTF-16 code units so emoji and
    // supplementary CJK characters are never split into invalid surrogates.
    const characters = Array.from(sentence);
    if (characters.length > limit) {
      push();
      for (let offset = 0; offset < characters.length; offset += limit) {
        const part = characters.slice(offset, offset + limit).join("").trim();
        if (part) chunks.push(part);
      }
      continue;
    }
    if (current && currentLength + characters.length > limit) push();
    current += sentence;
    currentLength += characters.length;
  }
  push();
  return chunks;
}
