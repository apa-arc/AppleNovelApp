/** Split long chapters at natural boundaries for local Kokoro synthesis. */
export function splitSpeechText(value: string, maxLength = 420): string[] {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const limit = Number.isFinite(maxLength) ? Math.max(80, Math.floor(maxLength)) : 420;
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [text];
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const normalized = current.trim();
    if (normalized) chunks.push(normalized);
    current = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      push();
      for (let offset = 0; offset < sentence.length; offset += limit) {
        const part = sentence.slice(offset, offset + limit).trim();
        if (part) chunks.push(part);
      }
      continue;
    }
    if (current && current.length + sentence.length > limit) push();
    current += sentence;
  }
  push();
  return chunks;
}
