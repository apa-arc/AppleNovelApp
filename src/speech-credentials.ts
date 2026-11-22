import * as SecureStore from "expo-secure-store";

export const FISH_AUDIO_API_KEY_STORAGE = "fish_audio_api_key_v1";

export type SpeechCredentialStore = {
  isAvailableAsync: () => Promise<boolean>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: { keychainAccessible?: number }) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const defaultStore: SpeechCredentialStore = SecureStore;

/** Store a user-supplied provider key in iOS Keychain / Android Keystore-backed storage. */
export async function saveFishAudioApiKey(
  apiKey: string,
  store: SpeechCredentialStore = defaultStore
): Promise<void> {
  const value = apiKey.trim();
  if (!value) throw new Error("API Key 不能为空。");
  if (!(await store.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await store.setItemAsync(FISH_AUDIO_API_KEY_STORAGE, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getFishAudioApiKey(
  store: SpeechCredentialStore = defaultStore
): Promise<string | null> {
  if (!(await store.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  return store.getItemAsync(FISH_AUDIO_API_KEY_STORAGE);
}

export async function deleteFishAudioApiKey(
  store: SpeechCredentialStore = defaultStore
): Promise<void> {
  if (!(await store.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await store.deleteItemAsync(FISH_AUDIO_API_KEY_STORAGE);
}
