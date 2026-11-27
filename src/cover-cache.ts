import * as FileSystem from "expo-file-system/legacy";

const DIRECTORY_NAME = "novel-cover-cache";
const inFlight = new Map<string, Promise<string | null>>();

function hashUrl(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extensionFor(value: string): string {
  try {
    const extension = new URL(value).pathname.match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase();
    if (extension === "jpeg") return ".jpg";
    return extension ? "." + extension : ".jpg";
  } catch {
    return ".jpg";
  }
}

/** Persist a remote cover in the app's document directory for reuse by search and shelf. */
export async function cacheCoverImage(url: string): Promise<string | null> {
  const cleanUrl = url.trim();
  if (!cleanUrl) return null;
  if (cleanUrl.startsWith("file://")) return cleanUrl;
  if (!/^https:\/\//i.test(cleanUrl)) return null;
  const existing = inFlight.get(cleanUrl);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    try {
      const root = FileSystem.documentDirectory;
      if (!root) return null;
      const directory = root + DIRECTORY_NAME + "/";
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
      const target = directory + hashUrl(cleanUrl) + extensionFor(cleanUrl);
      const cached = await FileSystem.getInfoAsync(target);
      if (cached.exists && (cached.size || 0) > 0) return target;
      const downloaded = await FileSystem.downloadAsync(cleanUrl, target, {
        headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
      });
      if (downloaded.status < 200 || downloaded.status >= 300) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
        return null;
      }
      const info = await FileSystem.getInfoAsync(target);
      if (!info.exists || (info.size || 0) <= 0) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
        return null;
      }
      return target;
    } catch {
      return null;
    }
  })();
  inFlight.set(cleanUrl, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cleanUrl);
  }
}
