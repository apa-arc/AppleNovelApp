export type OfflineModelDownloadRequest = {
  /** True only when the user explicitly taps the download action. */
  userInitiated: boolean;
  /** True only after the user confirms the download prompt. */
  confirmed: boolean;
  /** The selected model is already fully installed. */
  alreadyDownloaded: boolean;
};

/**
 * Offline speech models are never downloaded as a side effect of playback,
 * startup, network loss, or engine fallback. A download can begin only after
 * an explicit user action and confirmation.
 */
export function canStartOfflineModelDownload(
  request: OfflineModelDownloadRequest
): boolean {
  return request.userInitiated && request.confirmed && !request.alreadyDownloaded;
}

/** A downloaded model may be used offline; this function never initiates a download. */
export function canUseOfflineModel(modelInstalled: boolean): boolean {
  return modelInstalled;
}
