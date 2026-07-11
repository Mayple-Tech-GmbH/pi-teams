import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalArgv = [...process.argv];
const originalPiRevision = process.env.PI_REVISION;
const originalPiTeamsRevision = process.env.PI_TEAMS_REVISION;
const originalPiVersion = process.env.PI_VERSION;
const temporaryDirectories = new Set<string>();

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-teams-surface-probe-"));
  temporaryDirectories.add(directory);
  return directory;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  process.argv = [...originalArgv];
  restoreEnv("PI_REVISION", originalPiRevision);
  restoreEnv("PI_TEAMS_REVISION", originalPiTeamsRevision);
  restoreEnv("PI_VERSION", originalPiVersion);
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
  vi.resetModules();
});

describe("capture-runtime-surface probe", () => {
  it("registers only a command and appends canonical command and before-agent snapshots", async () => {
    const directory = createTemporaryDirectory();
    const output = path.join(directory, "snapshots.jsonl");
    process.argv = ["node", "pi", "-e", "./scripts/capture-runtime-surface.ts", "--surface-output", output];
    process.env.PI_VERSION = "0.80.6";
    process.env.PI_REVISION = "pi-runtime-fixture";
    process.env.PI_TEAMS_REVISION = "pi-teams-fixture";

    const commands = new Map<string, any>();
    const handlers = new Map<string, (event: unknown) => void>();
    const api = {
      registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
      on: vi.fn((event: string, handler: (event: unknown) => void) => handlers.set(event, handler)),
      getActiveTools: vi.fn(() => ["zeta", "alpha"]),
      getAllTools: vi.fn(() => [
        {
          name: "zeta",
          description: "Zeta tool",
          parameters: { required: ["value"], properties: { value: { description: "v", type: "string" } }, type: "object" },
        },
        { name: "alpha", description: "Alpha tool", parameters: { type: "object", properties: {} } },
      ]),
      getCommands: vi.fn(() => [
        { name: "team", source: "extension", description: "Teams", path: "/runtime/pi-teams/extensions/index.ts" },
        { name: "review", source: "skill", location: "user", path: "/runtime/skills/review.md" },
      ]),
    };

    const { default: extension } = await import("./capture-runtime-surface.js");
    extension(api as any);

    expect([...commands.keys()]).toEqual(["capture-runtime-surface"]);
    expect(api.registerCommand).toHaveBeenCalledTimes(1);
    expect(api.on).toHaveBeenCalledTimes(1);
    expect([...handlers.keys()]).toEqual(["before_agent_start"]);

    await commands.get("capture-runtime-surface").handler(" cold ", { ui: { notify: vi.fn() } });
    handlers.get("before_agent_start")?.({ type: "before_agent_start", prompt: "fixture" });

    const lines = fs.readFileSync(output, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    const snapshots = lines.map((line) => JSON.parse(line));
    expect(snapshots.map(({ label }) => label)).toEqual(["cold", "before_agent_start"]);
    expect(snapshots[0]).toMatchObject({
      activeTools: ["alpha", "zeta"],
      provenance: {
        piRevision: "pi-runtime-fixture",
        piTeamsRevision: "pi-teams-fixture",
        piVersion: "0.80.6",
      },
      tools: [
        { description: "Alpha tool", name: "alpha", parameters: { properties: {}, type: "object" } },
        {
          description: "Zeta tool",
          name: "zeta",
          parameters: {
            properties: { value: { description: "v", type: "string" } },
            required: ["value"],
            type: "object",
          },
        },
      ],
      commands: [
        { description: "Teams", name: "team", path: "/runtime/pi-teams/extensions/index.ts", source: "extension" },
        { location: "user", name: "review", path: "/runtime/skills/review.md", source: "skill" },
      ],
    });
    expect(lines[0]).toBe(JSON.stringify(snapshots[0]));
    expect(fs.readdirSync(directory)).toEqual(["snapshots.jsonl"]);
  });

  it.each([
    ["a following option", ["--surface-output", "--other-option"]],
    ["an empty assignment", ["--surface-output="]],
    ["a missing separated value", ["--surface-output"]],
  ])("rejects %s before registration or writing", async (_description, outputArgs) => {
    const directory = createTemporaryDirectory();
    process.argv = ["node", "pi", "-e", "./scripts/capture-runtime-surface.ts", ...outputArgs];
    const api = {
      registerCommand: vi.fn(),
      on: vi.fn(),
    };

    const { default: extension } = await import("./capture-runtime-surface.js");
    let thrown: unknown;
    try {
      extension(api as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(new Error("capture-runtime-surface requires --surface-output <jsonl-path>"));
    expect(api.registerCommand).not.toHaveBeenCalled();
    expect(api.on).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("accepts the --surface-output=<path> form", async () => {
    const directory = createTemporaryDirectory();
    const output = path.join(directory, "assigned.jsonl");
    process.argv = ["node", "pi", "-e", "./scripts/capture-runtime-surface.ts", `--surface-output=${output}`];
    const commands = new Map<string, any>();
    const api = {
      registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
      on: vi.fn(),
      getActiveTools: vi.fn(() => []),
      getAllTools: vi.fn(() => []),
      getCommands: vi.fn(() => []),
    };

    const { default: extension } = await import("./capture-runtime-surface.js");
    extension(api as any);
    await commands.get("capture-runtime-surface").handler("assigned", { ui: { notify: vi.fn() } });

    expect(fs.existsSync(output)).toBe(true);
    expect(JSON.parse(fs.readFileSync(output, "utf8"))).toMatchObject({ label: "assigned" });
  });
});
