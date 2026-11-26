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
const ADDRESSED_SPEECH_TAG =
  /([一-鿿A-Za-z·]{1,8}?)(?:看向|看着|对着|向|冲着|朝着|面对|面向|望着)([一-鿿A-Za-z·]{1,8}?)[，,]?(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|笑着|冷声|急声)?(?:说道|问道|答道|笑道|喊道|叫道|怒道|叹道|道|说|问|答)$/;
const SPEECH_TAG_PREFIX =
  /^([一-鿿A-Za-z·]{1,8}?)(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|怒气冲冲地|笑着|冷声|急声)?(?:说道|问道|答道|笑道|喊道|叫道|怒道|叹道|开口道|开口说|道|说|问|答)[：:，]?\s*/;
const ADDRESSED_SPEECH_TAG_PREFIX =
  /^([一-鿿A-Za-z·]{1,8}?)(?:看向|看着|对着|向|冲着|朝着|面对|面向|望着)([一-鿿A-Za-z·]{1,8}?)[，,]?(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|笑着|冷声|急声)?(?:说道|问道|答道|笑道|喊道|叫道|怒道|叹道|道|说|问|答)[：:，]?\s*/;
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
  const suffixes = [
    "开口说", "开口道", "怒气冲冲地说道", "说道", "问道", "答道", "笑道",
    "喊道", "叫道", "怒道", "叹道", "说", "问", "答", "道",
  ];
  const modifiers = /(?:轻声地?|低声地?|冷冷地|淡淡地|沉声|大声|怒气冲冲地|笑着|冷声|急声)$/;
  const namePattern = /^[一-鿿A-Za-z·]{1,8}$/;
  const addressedPattern = /^([一-鿿A-Za-z·]{1,8}?)(?:看向|看着|对着|向|冲着|朝着|面对|面向|望着)([一-鿿A-Za-z·]{1,8})$/;

  for (const suffix of suffixes) {
    if (!clause.endsWith(suffix)) continue;
    const prefix = clause.slice(0, -suffix.length).replace(modifiers, "").replace(/[，,]+$/g, "");
    const addressed = prefix.match(addressedPattern);
    const name = addressed?.[1] ?? (namePattern.test(prefix) ? prefix : undefined);
    if (name) return GENERIC_SPEAKERS.has(name) ? undefined : name;
    return undefined;
  }

  const directName = clause.match(/^([一-鿿A-Za-z·]{1,8})$/)?.[1];
  return directName && !GENERIC_SPEAKERS.has(directName) ? directName : undefined;
}

function hasSpeechTagBeforeQuote(text: string, quoteStart: number): boolean {
  const prefix = text.slice(Math.max(0, quoteStart - 48), quoteStart);
  const clause = prefix.split(/[。！？；\n]/).pop() ?? prefix;
  const cleanClause = cleanSpeakerClause(clause);
  const directColonTag = clause.trim().match(/(?:^|[”’"])([一-鿿A-Za-z·]{1,8})[：:]$/);
  return Boolean(directColonTag) || ADDRESSED_SPEECH_TAG.test(cleanClause) || SPEECH_TAG.test(cleanClause);
}

function stripTrailingSpeakerTag(value: string): string {
  const directColonTag = value.match(/(?:^|[。！？；\n”’"])([一-鿿A-Za-z·]{1,8})[：:]\s*$/);
  if (directColonTag && directColonTag.index !== undefined) {
    const nameOffset = directColonTag[0].indexOf(directColonTag[1]);
    return value.slice(0, directColonTag.index + nameOffset).trimEnd();
  }
  const trimmed = value.replace(/[：:，\s]+$/g, "");
  const match = ADDRESSED_SPEECH_TAG.exec(trimmed) ?? SPEECH_TAG.exec(trimmed);
  if (!match || match.index === undefined) return value;
  return trimmed.slice(0, match.index).trimEnd();
}

function stripLeadingSpeakerTag(value: string): string {
  const trimmed = value.replace(/^[，。！？；：\s”’"]+/, "");
  const directColonTag = trimmed.match(/^([一-鿿A-Za-z·]{1,8})[：:]\s*/);
  if (directColonTag) return trimmed.slice(directColonTag[0].length).trimStart();
  const match = ADDRESSED_SPEECH_TAG_PREFIX.exec(trimmed) ?? SPEECH_TAG_PREFIX.exec(trimmed);
  if (!match) return value;
  return trimmed.slice(match[0].length).trimStart();
}

function cleanNarrationAroundDialogue(value: string): string {
  return stripLeadingSpeakerTag(stripTrailingSpeakerTag(value));
}

function speakerBeforeQuote(text: string, quoteStart: number): string | undefined {
  const prefix = text.slice(Math.max(0, quoteStart - 48), quoteStart);
  const clause = prefix.split(/[。！？；\n]/).pop() ?? prefix;
  const cleanClause = cleanSpeakerClause(clause);
  if (ADDRESSED_SPEECH_TAG.test(cleanClause) || SPEECH_TAG.test(cleanClause)) {
    return speakerFromTag(cleanClause);
  }
  const directName = cleanClause.match(/^([一-鿿A-Za-z·]{1,8})$/)?.[1];
  return directName && !GENERIC_SPEAKERS.has(directName) ? directName : undefined;
}
function speakerAfterQuote(text: string, quoteEnd: number): string | undefined {
  const suffix = text.slice(quoteEnd, quoteEnd + 48).replace(/^[，。！？；：\s]+/, "");
  return speakerFromTag(suffix);
}

/** Return character names only when a direct speech tag or name-colon marker identifies them. */
export function extractExplicitSpeakerNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  QUOTED_DIALOGUE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUOTED_DIALOGUE_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const beforeName = speakerBeforeQuote(text, start);
    const name = beforeName ?? (hasSpeechTagBeforeQuote(text, start) ? undefined : speakerAfterQuote(text, end));
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function splitLongSpeechText(value: string, maxChars = 180): string[] {
  const sentences = value.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence || /^[。！？!?；;，,、：:]+$/.test(cleanSentence)) continue;
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

    appendChunks(cleanNarrationAroundDialogue(text.slice(cursor, start)), "narration", fallbackVoiceId);

    if (dialogueText.trim()) {
      const beforeName = speakerBeforeQuote(text, start);
      const speakerName = beforeName ?? (hasSpeechTagBeforeQuote(text, start) ? undefined : speakerAfterQuote(text, end));
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

  appendChunks(cleanNarrationAroundDialogue(text.slice(cursor)), "narration", fallbackVoiceId);

  if (segments.length === 0 && text.trim()) {
    appendChunks(text, "narration", fallbackVoiceId);
  }
  return segments;
}
