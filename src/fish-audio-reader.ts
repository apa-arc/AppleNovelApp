import { splitSpeechText } from "./speech-engine";
import { buildFishAudioDialogueScript, splitSpeechDialogue, type SpeechDialogueSegment } from "./speech-dialogue";
import { synthesizeFishAudio, type FishAudioFetch } from "./fish-audio-client";

export type FishAudioReaderChunk = {
  index: number;
  total: number;
  bytes: Uint8Array;
  speakers: string[];
};

export type FishAudioReaderRequest = {
  apiKey: string;
  text: string;
  voiceReferences: Record<string, string>;
  narrationVoiceName?: string;
  maxChunkLength?: number;
  signal?: AbortSignal;
  fetchImpl?: FishAudioFetch;
};

function prepareSegments(segments: SpeechDialogueSegment[], maxChunkLength: number): SpeechDialogueSegment[] {
  const prepared: SpeechDialogueSegment[] = [];
  for (const segment of segments) {
    const pieces = splitSpeechText(segment.text, maxChunkLength);
    for (const piece of pieces) {
      if (piece.trim()) prepared.push({ ...segment, text: piece });
    }
  }
  return prepared;
}

function packSegments(segments: SpeechDialogueSegment[], maxChunkLength: number): SpeechDialogueSegment[][] {
  const groups: SpeechDialogueSegment[][] = [];
  let current: SpeechDialogueSegment[] = [];
  let currentLength = 0;
  for (const segment of segments) {
    const length = Array.from(segment.text).length;
    const separatorLength = current.length ? 1 : 0;
    if (current.length && currentLength + separatorLength + length > maxChunkLength) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(segment);
    currentLength += (currentLength ? 1 : 0) + length;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Synthesizes a chapter incrementally. Each yielded MP3 chunk is ready for the
 * shared audio player; callers should await playback before requesting the next
 * chunk to avoid buffering an entire long chapter in memory.
 */
export async function* synthesizeFishAudioReader(
  request: FishAudioReaderRequest
): AsyncGenerator<FishAudioReaderChunk> {
  const maxChunkLength = Math.max(80, Math.min(1200, Math.floor(request.maxChunkLength ?? 420)));
  const segments = prepareSegments(splitSpeechDialogue(request.text), maxChunkLength);
  const groups = packSegments(segments, maxChunkLength);
  if (groups.length === 0) throw new Error("朗读文本不能为空。");

  for (let index = 0; index < groups.length; index += 1) {
    if (request.signal?.aborted) throw new Error("朗读已取消。");
    const script = buildFishAudioDialogueScript(
      groups[index],
      request.voiceReferences,
      request.narrationVoiceName ?? "旁白"
    );
    const bytes = await synthesizeFishAudio({
      apiKey: request.apiKey,
      text: script.text,
      ...(script.referenceIds.length ? { referenceId: script.referenceIds } : {}),
      signal: request.signal,
    }, request.fetchImpl);
    yield { index: index + 1, total: groups.length, bytes, speakers: script.speakers };
  }
}
