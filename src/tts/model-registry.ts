export interface TtsModelRegistryDependencies<TResult extends { localPath: string }> {
  getInstalledPath(): Promise<string | null>;
  clearModelsCache(): Promise<void>;
  refreshModels(forceRefresh?: boolean): Promise<void>;
  ensureModel(): Promise<TResult>;
}

function isUnknownModelError(error: unknown, modelId: string): boolean {
  return error instanceof Error && error.message.includes(`Unknown model id: ${modelId}`);
}

/**
 * Resolve a TTS model without requiring network access when it is already
 * installed. Some Sherpa versions throw Unknown model id from getModelPath
 * before the model registry has been refreshed, so treat that specific error
 * as a cache miss and refresh before trying to install the model.
 */
export async function resolveTtsModelPath<TResult extends { localPath: string }>(
  modelId: string,
  dependencies: TtsModelRegistryDependencies<TResult>,
): Promise<string> {
  let installedPath: string | null = null;
  try {
    installedPath = await dependencies.getInstalledPath();
  } catch (error) {
    if (!isUnknownModelError(error, modelId)) throw error;
  }
  if (installedPath) return installedPath;

  await dependencies.refreshModels();

  let result: TResult;
  try {
    result = await dependencies.ensureModel();
  } catch (error) {
    if (!isUnknownModelError(error, modelId)) throw error;

    // refreshModels(forceRefresh) may return the old cached list on network
    // failure. Clear it first so a failed refresh surfaces the real network
    // error instead of repeating the misleading "Unknown model id" message.
    await dependencies.clearModelsCache();
    await dependencies.refreshModels(true);
    result = await dependencies.ensureModel();
  }

  return result.localPath;
}
