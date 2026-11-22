type SecureStoreModule = typeof import("expo-secure-store");

export const FISH_AUDIO_API_KEY_STORAGE = "fish_audio_api_key_v1";

export type SpeechCredentialStore = {
  isAvailableAsync: () => Promise<boolean>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: { keychainAccessible?: number }) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

async function loadSecureStore(): Promise<SecureStoreModule> {
  return import("expo-secure-store");
}

/** Store a user-supplied provider key in iOS Keychain / Android Keystore-backed storage. */
export async function saveFishAudioApiKey(
  apiKey: string,
  store?: SpeechCredentialStore
): Promise<void> {
  const value = apiKey.trim();
  if (!value) throw new Error("API Key 不能为空。");

  const secureStore = store ? null : await loadSecureStore();
  const storage = store ?? secureStore!;
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await storage.setItemAsync(
    FISH_AUDIO_API_KEY_STORAGE,
    value,
    secureStore ? { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK } : undefined
  );
}

export async function getFishAudioApiKey(
  store?: SpeechCredentialStore
): Promise<string | null> {
  const storage = store ?? await loadSecureStore();
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  return storage.getItemAsync(FISH_AUDIO_API_KEY_STORAGE);
}

export async function deleteFishAudioApiKey(
  store?: SpeechCredentialStore
): Promise<void> {
  const storage = store ?? await loadSecureStore();
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await storage.deleteItemAsync(FISH_AUDIO_API_KEY_STORAGE);
}

export const GEMINI_API_KEY_STORAGE = "gemini_api_key_v1";

/** Store a user-owned Gemini key in iOS Keychain / Android Keystore-backed storage. */
export async function saveGeminiApiKey(
  apiKey: string,
  store?: SpeechCredentialStore
): Promise<void> {
  const value = apiKey.trim();
  if (!value) throw new Error("Gemini API Key 不能为空。");
  const secureStore = store ? null : await loadSecureStore();
  const storage = store ?? secureStore!;
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await storage.setItemAsync(
    GEMINI_API_KEY_STORAGE,
    value,
    secureStore ? { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK } : undefined
  );
}

export async function getGeminiApiKey(
  store?: SpeechCredentialStore
): Promise<string | null> {
  const storage = store ?? await loadSecureStore();
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  return storage.getItemAsync(GEMINI_API_KEY_STORAGE);
}

export async function deleteGeminiApiKey(
  store?: SpeechCredentialStore
): Promise<void> {
  const storage = store ?? await loadSecureStore();
  if (!(await storage.isAvailableAsync())) throw new Error("当前设备不支持安全凭据存储。");
  await storage.deleteItemAsync(GEMINI_API_KEY_STORAGE);
}
