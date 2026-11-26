export interface TtsModelRegistryDependencies<TResult extends { localPath: string }> {
  getInstalledPath(): Promise<string | null>;
  clearModelsCache(): Promise<void>;
  refreshModels(forceRefresh?: boolean): Promise<void>;
  ensureModel(): Promise<TResult>;
}

/**
 * Resolve a TTS model without requiring network access when it is already
 * installed. If the SDK registry misses the model, discard its cached list
 * before refreshing: the SDK otherwise silently falls back to stale cache
 * when the GitHub release API cannot be reached.
 */
export async function resolveTtsModelPath<TResult extends { localPath: string }>(
  modelId: string,
  dependencies: TtsModelRegistryDependencies<TResult>,
): Promise<string> {
  const installedPath = await dependencies.getInstalledPath();
  if (installedPath) return installedPath;

  await dependencies.refreshModels();

  let result: TResult;
  try {
    result = await dependencies.ensureModel();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(`Unknown model id: ${modelId}`)
    ) {
      throw error;
    }

    // refreshModels(forceRefresh) may return the old cached list on network
    // failure. Clear it first so a failed refresh surfaces the real network
    // error instead of repeating the misleading "Unknown model id" message.
    await dependencies.clearModelsCache();
    await dependencies.refreshModels(true);
    result = await dependencies.ensureModel();
  }

  return result.localPath;
}
