export interface AvailableModel {
  provider: string;
  model: string;
}

export const OPENAI_CODEX_PROVIDER = "openai-codex";

/**
 * Provider priority list - OAuth/subscription providers first (cheaper), then API-key providers
 */
export const PROVIDER_PRIORITY = [
  // OAuth / Subscription providers (typically free/cheaper)
  "google-gemini-cli", // Google Gemini CLI - OAuth, free tier
  "github-copilot", // GitHub Copilot - subscription
  "kimi-sub", // Kimi subscription
  // API key providers
  "anthropic",
  "openai",
  "google",
  "zai",
  "openrouter",
  "azure-openai",
  "amazon-bedrock",
  "mistral",
  "groq",
  "cerebras",
  "xai",
  "vercel-ai-gateway",
];

/**
 * Find the best matching provider for a given model name.
 * Returns the full provider/model string or null if not found.
 */
export function resolveModelWithProvider(
  availableModels: AvailableModel[],
  modelName: string,
): string | null {
  if (modelName.includes("/")) {
    return modelName;
  }

  if (availableModels.length === 0) {
    return null;
  }

  const lowerModelName = modelName.toLowerCase();

  const exactMatches = availableModels.filter(
    (candidate) => candidate.model.toLowerCase() === lowerModelName,
  );

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => {
      const aIndex = PROVIDER_PRIORITY.indexOf(a.provider);
      const bIndex = PROVIDER_PRIORITY.indexOf(b.provider);
      const aPriority = aIndex === -1 ? 999 : aIndex;
      const bPriority = bIndex === -1 ? 999 : bIndex;
      return aPriority - bPriority;
    });

    return `${exactMatches[0].provider}/${exactMatches[0].model}`;
  }

  const partialMatches = availableModels.filter((candidate) =>
    candidate.model.toLowerCase().includes(lowerModelName),
  );

  if (partialMatches.length > 0) {
    for (const preferredProvider of PROVIDER_PRIORITY) {
      const match = partialMatches.find(
        (candidate) => candidate.provider === preferredProvider,
      );
      if (match) {
        return `${match.provider}/${match.model}`;
      }
    }

    return `${partialMatches[0].provider}/${partialMatches[0].model}`;
  }

  return null;
}

export function stripProvider(modelName: string): string {
  return modelName.includes("/")
    ? modelName.split("/").slice(1).join("/")
    : modelName;
}

export function resolveOpenAICodexModel(
  availableModels: AvailableModel[],
  preferredModel?: string | null,
): string | null {
  const openAICodexModels = availableModels.filter(
    (candidate) => candidate.provider === OPENAI_CODEX_PROVIDER,
  );

  if (openAICodexModels.length === 0) {
    return null;
  }

  const preferredNames = [preferredModel, "gpt-5.4", "gpt-5.3-codex"]
    .filter((value): value is string => !!value)
    .map((value) => stripProvider(value).toLowerCase());

  for (const preferredName of preferredNames) {
    const exactMatch = openAICodexModels.find(
      (candidate) => candidate.model.toLowerCase() === preferredName,
    );
    if (exactMatch) {
      return `${exactMatch.provider}/${exactMatch.model}`;
    }
  }

  for (const preferredName of preferredNames) {
    const partialMatch = openAICodexModels.find((candidate) =>
      candidate.model.toLowerCase().includes(preferredName),
    );
    if (partialMatch) {
      return `${partialMatch.provider}/${partialMatch.model}`;
    }
  }

  return `${openAICodexModels[0].provider}/${openAICodexModels[0].model}`;
}

export function requireOpenAICodexModel(
  availableModels: AvailableModel[],
  preferredModel?: string | null,
): string {
  const resolved = resolveOpenAICodexModel(availableModels, preferredModel);
  if (resolved) return resolved;

  throw new Error(
    "No openai-codex/* models are available in your Pi configuration. " +
      "Please enable an openai-codex provider/model first (check `pi --list-models`).",
  );
}
