export type SpeechDialogueSegment = {
  kind: "narration" | "dialogue";
  text: string;
  speakerName?: string;
};

export type FishAudioDialogueScript = {
  text: string;
  referenceIds: string[];
  speakers: string[];
};

const QUOTE_PAIRS: Array<[string, string]> = [["“", "”"], ["「", "」"], ["『", "』"], ["\u0022", "\u0022"]];

const SPEECH_CUE = /([\u4e00-\u9fffA-Za-z0-9·]{1,12})(?:轻声|低声|大声|冷冷地|愤怒地|笑着|哭着)?(?:说道|说|问道|问|喊道|喊|答道|回答道|回答|笑道|冷声道|开口道)\s*[:：]?\s*$/;
const SUFFIX_CUE = /^\s*(?:说道|说|问道|问|喊道|喊|答道|回答道|回答|笑道|冷声道|开口道)\s*([\u4e00-\u9fffA-Za-z0-9·]{1,12})/;

function findSpeaker(prefix: string, suffix: string): string | undefined {
  const before = prefix.slice(-32).match(SPEECH_CUE);
  if (before?.[1]) return before[1];
  const after = suffix.match(SUFFIX_CUE);
  return after?.[1];
}

/**
 * Heuristically separates quoted dialogue from narration.
 * It only labels a speaker when a nearby Chinese dialogue cue names one.
 * Ambiguous dialogue remains unassigned rather than guessing a character.
 */
export function splitSpeechDialogue(text: string): SpeechDialogueSegment[] {
  const input = text.replace(/\r\n?/g, "\n");
  const segments: SpeechDialogueSegment[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    let found: { start: number; end: number; open: string; close: string } | undefined;
    for (let i = cursor; i < input.length && !found; i += 1) {
      for (const [open, close] of QUOTE_PAIRS) {
        if (input.startsWith(open, i)) {
          const end = input.indexOf(close, i + open.length);
          if (end >= 0) {
            found = { start: i, end: end + close.length, open, close };
            break;
          }
        }
      }
    }
    if (!found) break;
    const narration = input.slice(cursor, found.start);
    if (narration.trim()) segments.push({ kind: "narration", text: narration });
    const content = input.slice(found.start + found.open.length, found.end - found.close.length);
    const speakerName = findSpeaker(input.slice(Math.max(0, found.start - 32), found.start), input.slice(found.end));
    if (content.trim()) segments.push({ kind: "dialogue", text: content, ...(speakerName ? { speakerName } : {}) });
    cursor = found.end;
  }
  const tail = input.slice(cursor);
  if (tail.trim()) segments.push({ kind: "narration", text: tail });
  if (segments.length === 0 && input.trim()) segments.push({ kind: "narration", text: input });
  return segments;
}

/**
 * Builds Fish Audio's explicit speaker-tag format only for voices configured by
 * the user/app. Unmapped dialogue falls back to narration, never a guessed voice.
 */
export function buildFishAudioDialogueScript(
  segments: SpeechDialogueSegment[],
  voiceReferences: Record<string, string>,
  narrationVoiceName = "旁白"
): FishAudioDialogueScript {
  const referenceIds: string[] = [];
  const speakers: string[] = [];
  const slots = new Map<string, number>();
  const parts: string[] = [];
  const slotFor = (name: string): number | undefined => {
    const reference = voiceReferences[name];
    if (!reference) return undefined;
    const existing = slots.get(reference);
    if (existing !== undefined) return existing;
    const next = referenceIds.length;
    slots.set(reference, next);
    referenceIds.push(reference);
    speakers.push(name);
    return next;
  };
  for (const segment of segments) {
    const requestedName = segment.kind === "dialogue" ? segment.speakerName : narrationVoiceName;
    const slot = requestedName ? slotFor(requestedName) : undefined;
    if (slot === undefined) {
      parts.push(segment.text);
    } else {
      parts.push("<|speaker:" + slot + "|>" + segment.text);
    }
  }
  return { text: parts.join("\n"), referenceIds, speakers };
}
