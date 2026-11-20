export type ModelDownloadStatus =
  | "not-downloaded"
  | "awaiting-confirmation"
  | "downloading"
  | "paused"
  | "installed"
  | "failed";

export type ModelDownloadState = {
  status: ModelDownloadStatus;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
};

export function createModelDownloadState(totalBytes: number): ModelDownloadState {
  return {
    status: "not-downloaded",
    downloadedBytes: 0,
    totalBytes: Math.max(0, Math.floor(totalBytes)),
  };
}

/** A tap is required before the confirmation screen can be shown. */
export function requestModelDownload(
  state: ModelDownloadState,
  userInitiated: boolean
): ModelDownloadState {
  if (!userInitiated || state.status === "installed" || state.status === "downloading") return state;
  return { ...state, status: "awaiting-confirmation", error: undefined };
}

/** Only an explicit confirmation starts a download. */
export function confirmModelDownload(state: ModelDownloadState): ModelDownloadState {
  if (state.status !== "awaiting-confirmation") return state;
  return { ...state, status: "downloading", error: undefined };
}

export function cancelModelDownloadConfirmation(state: ModelDownloadState): ModelDownloadState {
  if (state.status !== "awaiting-confirmation") return state;
  return { ...state, status: "not-downloaded" };
}

export function updateModelDownloadProgress(
  state: ModelDownloadState,
  downloadedBytes: number,
  totalBytes = state.totalBytes
): ModelDownloadState {
  if (state.status !== "downloading") return state;
  const safeTotal = Math.max(0, Math.floor(totalBytes));
  const safeDownloaded = Math.min(safeTotal, Math.max(0, Math.floor(downloadedBytes)));
  return { ...state, downloadedBytes: safeDownloaded, totalBytes: safeTotal };
}

export function pauseModelDownload(state: ModelDownloadState): ModelDownloadState {
  return state.status === "downloading" ? { ...state, status: "paused" } : state;
}

export function resumeModelDownload(state: ModelDownloadState): ModelDownloadState {
  return state.status === "paused" || state.status === "failed"
    ? { ...state, status: "downloading", error: undefined }
    : state;
}

export function completeModelDownload(state: ModelDownloadState): ModelDownloadState {
  if (state.status !== "downloading") return state;
  return {
    ...state,
    status: "installed",
    downloadedBytes: state.totalBytes,
    error: undefined,
  };
}

export function failModelDownload(state: ModelDownloadState, message: string): ModelDownloadState {
  if (state.status !== "downloading") return state;
  return { ...state, status: "failed", error: message.trim() || "下载失败" };
}

/** Deletion is explicit too; an installed model is never removed as a side effect. */
export function removeModelDownload(state: ModelDownloadState): ModelDownloadState {
  if (state.status === "downloading" || state.status === "awaiting-confirmation") return state;
  return { ...state, status: "not-downloaded", downloadedBytes: 0, error: undefined };
}
