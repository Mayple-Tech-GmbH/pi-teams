import { describe, expect, it } from "vitest";
import {
  requireOpenAICodexModel,
  resolveModelWithProvider,
  resolveOpenAICodexModel,
} from "./model-resolution";

const availableModels = [
  { provider: "anthropic", model: "claude-sonnet-4-6" },
  { provider: "github-copilot", model: "gpt-5.4" },
  { provider: "openai-codex", model: "gpt-5.3-codex" },
  { provider: "openai-codex", model: "gpt-5.4" },
];

describe("resolveModelWithProvider", () => {
  it("prefers higher-priority providers for bare model names", () => {
    expect(resolveModelWithProvider(availableModels, "gpt-5.4")).toBe(
      "github-copilot/gpt-5.4",
    );
  });

  it("returns provider-qualified names unchanged", () => {
    expect(resolveModelWithProvider(availableModels, "anthropic/claude-sonnet-4-6")).toBe(
      "anthropic/claude-sonnet-4-6",
    );
  });
});

describe("resolveOpenAICodexModel", () => {
  it("keeps explicit openai-codex preferences", () => {
    expect(resolveOpenAICodexModel(availableModels, "openai-codex/gpt-5.3-codex")).toBe(
      "openai-codex/gpt-5.3-codex",
    );
  });

  it("coerces anthropic preferences to an openai-codex model", () => {
    expect(resolveOpenAICodexModel(availableModels, "anthropic/claude-sonnet-4-6")).toBe(
      "openai-codex/gpt-5.4",
    );
  });

  it("falls back to gpt-5.4 when no preference is provided", () => {
    expect(resolveOpenAICodexModel(availableModels)).toBe(
      "openai-codex/gpt-5.4",
    );
  });
});

describe("requireOpenAICodexModel", () => {
  it("throws when no openai-codex model is available", () => {
    expect(() =>
      requireOpenAICodexModel(
        [{ provider: "anthropic", model: "claude-sonnet-4-6" }],
        "anthropic/claude-sonnet-4-6",
      ),
    ).toThrow(/No openai-codex\/\* models are available/);
  });
});
