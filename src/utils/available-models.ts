import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AvailableModel } from "./model-resolution";

export type PiCommandCandidate = {
  command: string;
  args: string[];
  source: "pi-binary" | "current-runtime" | string;
};

export type PiCommandResult = Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr">;

export type PiCommandRunner = (command: string, args: string[]) => PiCommandResult;

function parseProviderQualifiedModel(value: string): AvailableModel | null {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("/")) return null;

  const [provider, ...rest] = trimmed.split("/");
  const model = rest.join("/");
  if (!provider || !model) return null;

  return { provider, model };
}

function dedupeModels(models: AvailableModel[]): AvailableModel[] {
  const seen = new Set<string>();
  const deduped: AvailableModel[] = [];

  for (const model of models) {
    const key = `${model.provider}/${model.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(model);
  }

  return deduped;
}

export function parseAvailableModels(stdout: string): AvailableModel[] {
  const models: AvailableModel[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("provider")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) continue;

    const [provider, model] = parts;
    if (!provider || !model) continue;

    models.push({ provider, model });
  }

  return dedupeModels(models);
}

export function parseConfiguredModels(settingsJson: string): AvailableModel[] {
  try {
    const parsed = JSON.parse(settingsJson) as {
      enabledModels?: string[];
      defaultProvider?: string;
      defaultModel?: string;
    };

    const models: AvailableModel[] = [];

    for (const value of parsed.enabledModels ?? []) {
      const model = parseProviderQualifiedModel(value);
      if (model) models.push(model);
    }

    if (parsed.defaultModel) {
      const explicitDefault = parseProviderQualifiedModel(parsed.defaultModel);
      if (explicitDefault) {
        models.push(explicitDefault);
      } else if (parsed.defaultProvider) {
        models.push({
          provider: parsed.defaultProvider,
          model: parsed.defaultModel,
        });
      }
    }

    return dedupeModels(models);
  } catch {
    return [];
  }
}

export function getPiCommandCandidates(options?: {
  argv?: string[];
  execPath?: string;
}): PiCommandCandidate[] {
  const argv = options?.argv ?? process.argv;
  const execPath = options?.execPath ?? process.execPath;

  const candidates: PiCommandCandidate[] = [];

  const currentRuntimeEntry = argv[1];
  if (currentRuntimeEntry) {
    candidates.push({
      command: execPath,
      args: [currentRuntimeEntry, "--list-models"],
      source: "current-runtime",
    });
  }

  candidates.push({ command: "pi", args: ["--list-models"], source: "pi-binary" });

  return candidates;
}

export function loadAvailableModelsWithRunner(
  candidates: PiCommandCandidate[],
  run: PiCommandRunner,
  configuredSettingsJson?: string,
): AvailableModel[] {
  for (const candidate of candidates) {
    try {
      const result = run(candidate.command, candidate.args);
      if (result.status !== 0 || !result.stdout) continue;

      const models = parseAvailableModels(result.stdout);
      if (models.length > 0) {
        return models;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return configuredSettingsJson ? parseConfiguredModels(configuredSettingsJson) : [];
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getPiLaunchCommand(options?: {
  argv?: string[];
  execPath?: string;
}): string {
  const argv = options?.argv ?? process.argv;
  const execPath = options?.execPath ?? process.execPath;
  const currentRuntimeEntry = argv[1];

  if (currentRuntimeEntry) {
    return `${shellQuote(execPath)} ${shellQuote(currentRuntimeEntry)}`;
  }

  return "pi";
}

function readSettingsJson(): string | undefined {
  try {
    const settingsPath = path.join(process.env.HOME || "", ".pi", "agent", "settings.json");
    if (!settingsPath || !fs.existsSync(settingsPath)) return undefined;
    return fs.readFileSync(settingsPath, "utf-8");
  } catch {
    return undefined;
  }
}

export function loadAvailableModels(): AvailableModel[] {
  const candidates = getPiCommandCandidates();
  const settingsJson = readSettingsJson();
  return loadAvailableModelsWithRunner(
    candidates,
    (command, args) =>
      spawnSync(command, args, {
        encoding: "utf-8",
        timeout: 10000,
      }),
    settingsJson,
  );
}
