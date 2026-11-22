import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { decode, encode } from "base64-arraybuffer";
import { createSpeechAudioCache, type SpeechAudioCacheFormat } from "./speech-audio-cache";

const INDEX_KEY = "@private_novel/speech_audio_cache_v1";
const DIRECTORY = FileSystem.cacheDirectory ? FileSystem.cacheDirectory + "speech-audio-cache/" : null;

const cache = createSpeechAudioCache({
  loadIndex: async () => {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw) as unknown; } catch { return []; }
  },
  saveIndex: async (entries) => {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  },
  read: async (uri) => {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return new Uint8Array(decode(base64));
  },
  write: async (key, format: SpeechAudioCacheFormat, bytes) => {
    if (!DIRECTORY) throw new Error("当前设备无法创建语音缓存目录。");
    const directory = await FileSystem.getInfoAsync(DIRECTORY);
    if (!directory.exists) await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
    const uri = DIRECTORY + key + "." + format;
    const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await FileSystem.writeAsStringAsync(uri, encode(exactBuffer), { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  },
  remove: async (uri) => {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },
}, 128 * 1024 * 1024);

export const getCachedSpeechAudio = cache.get;
export const saveCachedSpeechAudio = cache.put;
export const clearSpeechAudioCache = cache.clear;
export const getSpeechAudioCacheStats = cache.stats;
