import fs from "node:fs";
import type { ExtensionAPI, SlashCommandInfo, ToolInfo } from "@mariozechner/pi-coding-agent";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value as boolean | number | string;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return String(value);
}

function readSurfaceOutput(argv: string[]): string {
  const index = argv.indexOf("--surface-output");
  if (index >= 0) {
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) return value;
    throw new Error("capture-runtime-surface requires --surface-output <jsonl-path>");
  }

  const assignment = argv.find((arg) => arg.startsWith("--surface-output="));
  const value = assignment?.slice("--surface-output=".length);
  if (value) return value;
  throw new Error("capture-runtime-surface requires --surface-output <jsonl-path>");
}

function canonicalTools(tools: ToolInfo[]): CanonicalValue[] {
  return [...tools]
    .sort((left, right) => compareStrings(left.name, right.name))
    .map(({ name, description, parameters }) => canonicalize({ name, description, parameters }));
}

function canonicalCommands(commands: SlashCommandInfo[]): CanonicalValue[] {
  return commands.map((command) => canonicalize(command));
}

export default function captureRuntimeSurface(pi: ExtensionAPI): void {
  const surfaceOutput = readSurfaceOutput(process.argv);

  const appendSnapshot = (label: string): void => {
    const snapshot = canonicalize({
      label,
      activeTools: [...pi.getActiveTools()].sort(compareStrings),
      tools: canonicalTools(pi.getAllTools()),
      commands: canonicalCommands(pi.getCommands()),
      provenance: {
        argv: [...process.argv],
        cwd: process.cwd(),
        execPath: process.execPath,
        nodeVersion: process.version,
        piVersion: process.env.PI_VERSION ?? null,
        piRevision: process.env.PI_REVISION ?? null,
        piTeamsRevision: process.env.PI_TEAMS_REVISION ?? null,
      },
    });
    fs.appendFileSync(surfaceOutput, `${JSON.stringify(snapshot)}\n`, "utf8");
  };

  pi.registerCommand("capture-runtime-surface", {
    description: "Append a canonical runtime tool-surface snapshot",
    handler: async (args, ctx) => {
      const label = args.trim();
      if (!label) {
        ctx.ui.notify("Usage: /capture-runtime-surface <label>", "warning");
        return;
      }
      appendSnapshot(label);
    },
  });

  pi.on("before_agent_start", () => {
    appendSnapshot("before_agent_start");
  });
}
