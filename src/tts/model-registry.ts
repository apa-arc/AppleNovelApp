export interface TtsModelRegistryDependencies<TResult extends { localPath: string }> {
  getInstalledPath(): Promise<string | null>;
  refreshModels(forceRefresh?: boolean): Promise<void>;
  ensureModel(): Promise<TResult>;
}

/**
 * Resolve a TTS model without requiring network access when it is already
 * installed. A stale registry gets one forced refresh only for an unknown ID.
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

    await dependencies.refreshModels(true);
    result = await dependencies.ensureModel();
  }

  return result.localPath;
}
