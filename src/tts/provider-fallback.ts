export type TtsExecutionProvider = "coreml" | "cpu";

export interface TtsEngineFallbackDependencies<TEngine> {
  create(provider: TtsExecutionProvider): Promise<TEngine>;
  getSpeakerCount(engine: TEngine): Promise<number>;
  destroy(engine: TEngine): Promise<void>;
}

/**
 * Try the preferred provider, then fall back to CPU if Core ML cannot fully
 * initialize the model or expose its expected speaker table.
 */
export async function createValidatedTtsEngine<TEngine>(
  preferredProvider: TtsExecutionProvider,
  expectedSpeakerCount: number,
  dependencies: TtsEngineFallbackDependencies<TEngine>,
): Promise<{ engine: TEngine; provider: TtsExecutionProvider }> {
  const createValidated = async (provider: TtsExecutionProvider) => {
    const engine = await dependencies.create(provider);
    try {
      const speakerCount = await dependencies.getSpeakerCount(engine);
      if (speakerCount < expectedSpeakerCount) {
        throw new Error(
          `中文多角色音色模型不完整：预期至少 ${expectedSpeakerCount} 个音色，实际检测到 ${speakerCount} 个。`,
        );
      }
      return engine;
    } catch (error) {
      await dependencies.destroy(engine);
      throw error;
    }
  };

  try {
    return {
      engine: await createValidated(preferredProvider),
      provider: preferredProvider,
    };
  } catch (error) {
    if (preferredProvider !== "coreml") throw error;
    return {
      engine: await createValidated("cpu"),
      provider: "cpu",
    };
  }
}
