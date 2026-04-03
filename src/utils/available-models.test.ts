import { describe, expect, it } from "vitest";
import {
  getPiCommandCandidates,
  getPiLaunchCommand,
  loadAvailableModelsWithRunner,
  parseAvailableModels,
  parseConfiguredModels,
} from "./available-models";

describe("parseAvailableModels", () => {
  it("parses provider/model rows from pi --list-models output", () => {
    const stdout = [
      "provider           model                            context  max-out  thinking  images",
      "openai-codex       gpt-5.4                          272K     128K     yes       yes",
      "github-copilot     gpt-5.4                          400K     128K     yes       yes",
    ].join("\n");

    expect(parseAvailableModels(stdout)).toEqual([
      { provider: "openai-codex", model: "gpt-5.4" },
      { provider: "github-copilot", model: "gpt-5.4" },
    ]);
  });
});

describe("parseConfiguredModels", () => {
  it("extracts provider-qualified enabled models and default model from settings.json", () => {
    const settings = JSON.stringify({
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      enabledModels: [
        "openai-codex/gpt-5.4",
        "openai-codex/gpt-5.4-mini",
        "anthropic/claude-sonnet-4-6",
      ],
    });

    expect(parseConfiguredModels(settings)).toEqual([
      { provider: "openai-codex", model: "gpt-5.4" },
      { provider: "openai-codex", model: "gpt-5.4-mini" },
      { provider: "anthropic", model: "claude-sonnet-4-6" },
    ]);
  });
});

describe("loadAvailableModelsWithRunner", () => {
  it("falls back to the pi binary when the current runtime reports no models", () => {
    const calls: string[] = [];
    const models = loadAvailableModelsWithRunner(
      [
        { command: "/usr/local/bin/node", args: ["/stale/pi.js", "--list-models"], source: "current-runtime" },
        { command: "pi", args: ["--list-models"], source: "pi-binary" },
      ],
      (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        if (command === "/usr/local/bin/node") {
          return { status: 0, stdout: "Usage: pi [options]\n", stderr: "" };
        }

        return {
          status: 0,
          stdout: [
            "provider           model                            context  max-out  thinking  images",
            "openai-codex       gpt-5.4                          272K     128K     yes       yes",
          ].join("\n"),
          stderr: "",
        };
      },
    );

    expect(models).toEqual([{ provider: "openai-codex", model: "gpt-5.4" }]);
    expect(calls).toEqual([
      "/usr/local/bin/node /stale/pi.js --list-models",
      "pi --list-models",
    ]);
  });

  it("falls back to settings.json configured models when runtime probing is empty", () => {
    const models = loadAvailableModelsWithRunner(
      [
        { command: "/usr/local/bin/node", args: ["/current/pi.js", "--list-models"], source: "current-runtime" },
        { command: "pi", args: ["--list-models"], source: "pi-binary" },
      ],
      () => ({ status: 0, stdout: "", stderr: "" }),
      JSON.stringify({
        defaultProvider: "openai-codex",
        defaultModel: "gpt-5.4",
        enabledModels: ["openai-codex/gpt-5.4", "openai-codex/gpt-5.4-mini"],
      }),
    );

    expect(models).toEqual([
      { provider: "openai-codex", model: "gpt-5.4" },
      { provider: "openai-codex", model: "gpt-5.4-mini" },
    ]);
  });
});

describe("getPiCommandCandidates", () => {
  it("prefers the current runtime before the pi binary", () => {
    expect(
      getPiCommandCandidates({
        argv: ["node", "/current/pi.js"],
        execPath: "/usr/local/bin/node",
      }),
    ).toEqual([
      {
        command: "/usr/local/bin/node",
        args: ["/current/pi.js", "--list-models"],
        source: "current-runtime",
      },
      { command: "pi", args: ["--list-models"], source: "pi-binary" },
    ]);
  });
});

describe("getPiLaunchCommand", () => {
  it("uses the current runtime so teammates match the lead session version", () => {
    expect(
      getPiLaunchCommand({
        argv: ["node", "/current/pi.js"],
        execPath: "/usr/local/bin/node",
      }),
    ).toBe("/usr/local/bin/node /current/pi.js");
  });
});
