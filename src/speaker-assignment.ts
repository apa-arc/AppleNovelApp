/**
 * Conservative dialogue speaker assignment for offline multi-voice reading.
 *
 * The analyzer only assigns a character voice when a quoted line has an
 * explicit speech tag (for example: "张三说道：……" or "……"张三问道).
 * Unclear dialogue always falls back to the book's default voice.
 */

export const DEFAULT_KOKORO_ZH_VOICE_ID = 3;

// Kokoro v1.1-zh: Chinese female speakers 3-57, male speakers 58-102.
export const KOKORO_ZH_VOICE_IDS = Array.from({ length: 100 }, (_, index) => index + 3);

export type SpeakerVoiceMap = Record<string, number>;

export interface SpeechSegment {
  text: string;
  kind: "narration" | "dialogue";
  speakerName?: string;
  speakerId: number;
}

const QUOTED_DIALOGUE_PATTERN =
  /“([^”]*)”|「([^」]*)」|『([^』]*)』|‘([^’]*)’|"([^"]*)"|'([^']*)'/g;

const GENERIC_SPEAKERS = new Set([
  "我", "你", "他", "她", "它", "我们", "你们", "他们", "她们",
  "自己", "对方", "众人", "大家", "所有人", "两人", "三人", "众人齐声",
]);

const SPEECH_TAG =
  /([一-鿿A-Za-z·]{1,8}?)(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|怒气冲冲地|笑着|冷声|急声)?(?:说道|问道|答道|笑道|喊道|叫道|怒道|叹道|开口道|开口说|道|说|问|答)$/;

function cleanSpeakerClause(value: string): string {
  return value
    .replace(/^[，。！？；：\s]+|[，。！？；：\s]+$/g, "")
    .replace(/^(?:只见|只听|忽然|突然|这时|此时|随后|接着|紧接着)+/g, "")
    .trim();
}

function validVoiceId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 3 && value <= 102;
}

function speakerFromTag(value: string): string | undefined {
  const clause = cleanSpeakerClause(value);
  const addressed = clause.match(
    /^([\u4e00-\u9fffA-Za-z·]{1,8})(?:看向|看着|对着|向|冲着|朝着|面对|面向|望着)([\u4e00-\u9fffA-Za-z·]{1,8})(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|笑着|冷声|急声)?(?:说道|问道|答道|笑道|喊道|叫道|怒道|叹道|道|说|问|答)$/,
  );
  const match = addressed ?? clause.match(SPEECH_TAG);
  const directName = clause.match(/^([\\u4e00-\\u9fffA-Za-z·]{1,8})$/);
  const name = (match?.[1] ?? directName?.[1])?.trim();
  if (!name || GENERIC_SPEAKERS.has(name)) return undefined;
  return name;
}

function speakerBeforeQuote(text: string, quoteStart: number): string | undefined {
  const prefix = text.slice(Math.max(0, quoteStart - 48), quoteStart);
  const clause = prefix.split(/[。！？；\n]/).pop() ?? prefix;
  return speakerFromTag(clause);
}

function speakerAfterQuote(text: string, quoteEnd: number): string | undefined {
  const suffix = text.slice(quoteEnd, quoteEnd + 48).replace(/^[，。！？；：\s]+/, "");
  return speakerFromTag(suffix);
}

/** Return character names only when an explicit speech tag identifies them. */
export function extractExplicitSpeakerNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  QUOTED_DIALOGUE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_DIALOGUE_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const name =
      speakerBeforeQuote(text, start) ??
      speakerAfterQuote(text, end);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function splitLongSpeechText(value: string, maxChars = 180): string[] {
  const sentences = value.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [value];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) continue;
    if (cleanSentence.length <= maxChars) {
      chunks.push(cleanSentence);
      continue;
    }
    const clauses = cleanSentence.match(/[^，,、]+[，,、]?/g) ?? [cleanSentence];
    let pending = "";
    for (const clause of clauses) {
      const cleanClause = clause.trim();
      if (!cleanClause) continue;
      if (pending && pending.length + cleanClause.length > maxChars) {
        chunks.push(pending);
        pending = "";
      }
      if (cleanClause.length <= maxChars) {
        pending += cleanClause;
      } else {
        if (pending) chunks.push(pending);
        pending = "";
        const codePoints = Array.from(cleanClause);
        for (let index = 0; index < codePoints.length; index += maxChars) {
          chunks.push(codePoints.slice(index, index + maxChars).join(""));
        }
      }
    }
    if (pending) chunks.push(pending);
  }
  return chunks;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Preserve existing book-specific choices and deterministically allocate a
 * distinct Chinese voice to each newly recognized character.
 */
export function buildSpeakerVoiceMap(
  text: string,
  existingMap: SpeakerVoiceMap = {},
  defaultVoiceId = DEFAULT_KOKORO_ZH_VOICE_ID,
): SpeakerVoiceMap {
  const result: SpeakerVoiceMap = {};
  const safeDefaultVoiceId = validVoiceId(defaultVoiceId)
    ? defaultVoiceId
    : DEFAULT_KOKORO_ZH_VOICE_ID;
  const used = new Set<number>([safeDefaultVoiceId]);

  for (const [name, voiceId] of Object.entries(existingMap)) {
    if (name.trim() && validVoiceId(voiceId)) {
      result[name] = voiceId;
      used.add(voiceId);
    }
  }

  for (const name of extractExplicitSpeakerNames(text)) {
    if (validVoiceId(result[name])) continue;
    let voiceId = 3 + (stableHash(name) % 100);
    for (let attempt = 0; attempt < 100 && used.has(voiceId); attempt += 1) {
      voiceId = 3 + ((voiceId - 3 + 1) % 100);
    }
    result[name] = voiceId;
    used.add(voiceId);
  }

  return result;
}

/** Split quoted dialogue from narration; uncertain dialogue uses the default voice. */
export function splitTextForMultiVoice(
  text: string,
  speakerVoiceMap: SpeakerVoiceMap = {},
  defaultVoiceId = DEFAULT_KOKORO_ZH_VOICE_ID,
): SpeechSegment[] {
  const fallbackVoiceId = validVoiceId(defaultVoiceId)
    ? defaultVoiceId
    : DEFAULT_KOKORO_ZH_VOICE_ID;
  const segments: SpeechSegment[] = [];
  let cursor = 0;
  const appendChunks = (
    value: string,
    kind: SpeechSegment["kind"],
    speakerId: number,
    speakerName?: string,
  ) => {
    for (const chunk of splitLongSpeechText(value)) {
      segments.push({
        text: chunk,
        kind,
        ...(speakerName ? { speakerName } : {}),
        speakerId,
      });
    }
  };

  QUOTED_DIALOGUE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_DIALOGUE_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const dialogueText = match.slice(1).find((part) => part !== undefined) ?? "";

    appendChunks(text.slice(cursor, start), "narration", fallbackVoiceId);

    if (dialogueText.trim()) {
      const speakerName =
        speakerBeforeQuote(text, start) ??
        speakerAfterQuote(text, end);
      const mappedVoiceId = speakerName ? speakerVoiceMap[speakerName] : undefined;
      appendChunks(
        dialogueText,
        "dialogue",
        validVoiceId(mappedVoiceId) ? mappedVoiceId : fallbackVoiceId,
        speakerName,
      );
    }
    cursor = end;
  }

  appendChunks(text.slice(cursor), "narration", fallbackVoiceId);

  if (segments.length === 0 && text.trim()) {
    appendChunks(text, "narration", fallbackVoiceId);
  }
  return segments;
}
