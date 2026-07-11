import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { mockTerminalSpawn } = vi.hoisted(() => ({
  mockTerminalSpawn: vi.fn(() => "pane-1"),
}));

vi.mock("../src/utils/available-models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/available-models")>()),
  loadAvailableModels: () => [
    { provider: "openai", model: "gpt-5.6-sol" },
    { provider: "openai-codex", model: "gpt-5.6-sol" },
  ],
  getPiLaunchCommand: () => "pi",
}));

vi.mock("../src/adapters/terminal-registry", () => ({
  getTerminalAdapter: () => ({
    name: "fixture",
    supportsWindows: () => true,
    setTitle: vi.fn(),
    spawn: mockTerminalSpawn,
    spawnWindow: vi.fn(() => "window-1"),
    kill: vi.fn(),
    killWindow: vi.fn(),
    isAlive: vi.fn(() => true),
    isWindowAlive: vi.fn(() => true),
  }),
}));

vi.mock("../src/utils/predefined-teams", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/predefined-teams")>()),
  getPredefinedTeam: (name: string) => ({
    name,
    agents: name === "modeled" ? ["builder"] : [],
  }),
  getAllAgentDefinitions: () => [{
    name: "builder",
    description: "Builds the project",
    prompt: "Build the project",
    model: "gpt-5.6-sol",
  }],
}));
import { TEAM_TOOL_NAMES } from "../src/utils/tool-activation";

type Handler = (event: any, ctx: any) => any;

type HarnessOptions = {
  activeTools?: string[];
  allTools?: string[];
  flags?: Record<string, boolean | string>;
  teammate?: string;
  teamName?: string;
};

async function createHarness(options: HarnessOptions = {}) {
  const registeredTools: any[] = [];
  const commands = new Map<string, any>();
  const flags = new Map<string, any>();
  const handlers = new Map<string, Handler[]>();
  const notifications: Array<{ message: string; level: string }> = [];
  const blockedToolCalls: Array<{ toolName: string; reason: string }> = [];
  const forwardedMessages: string[] = [];
  const activeSnapshots: string[][] = [];
  let activeTools = [...(options.activeTools ?? ["read", "unrelated_active"] )];
  const preconfiguredTools = [...(options.allTools ?? [...activeTools, "unrelated_inactive"] )];
  const waitForIdle = vi.fn(async () => {});

  if (options.teammate) process.env.PI_AGENT_NAME = options.teammate;
  else delete process.env.PI_AGENT_NAME;
  if (options.teamName) process.env.PI_TEAM_NAME = options.teamName;
  else delete process.env.PI_TEAM_NAME;

  const api = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    registerTool: vi.fn((tool: any) => {
      registeredTools.push(tool);
      if (!activeTools.includes(tool.name)) activeTools.push(tool.name);
    }),
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
    registerFlag: vi.fn((name: string, flag: any) => flags.set(name, flag)),
    getFlag: vi.fn((name: string) => options.flags?.[name]),
    getActiveTools: vi.fn(() => [...activeTools]),
    getAllTools: vi.fn(() => [
      ...preconfiguredTools.map((name) => ({ name, description: "fixture" })),
      ...registeredTools.map(({ name, description }) => ({ name, description })),
    ]),
    setActiveTools: vi.fn((names: string[]) => {
      activeTools = [...names];
      activeSnapshots.push([...names]);
    }),
    sendUserMessage: vi.fn((message: string) => forwardedMessages.push(message)),
  };

  const ctx = {
    cwd: process.cwd(),
    waitForIdle,
    isIdle: () => true,
    hasPendingMessages: () => false,
    ui: {
      notify: (message: string, level: string) => notifications.push({ message, level }),
      setStatus: vi.fn(),
      setTitle: vi.fn(),
    },
  };

  const { default: extension } = await import("./index.js") as unknown as {
    default: (api: any) => void;
  };
  extension(api);

  async function emit(event: string, payload: any = { type: event }) {
    const results = [];
    for (const handler of handlers.get(event) ?? []) {
      const result = await handler(payload, ctx);
      results.push(result);
      if (event === "tool_call" && result?.block) {
        blockedToolCalls.push({ toolName: payload.toolName, reason: result.reason });
      }
    }
    return results;
  }

  async function command(name: string, args: string) {
    await commands.get(name).handler(args, ctx);
  }

  async function execute(name: string, params: Record<string, unknown>) {
    const tool = registeredTools.find((candidate) => candidate.name === name);
    return tool.execute("call-1", params, undefined, undefined, ctx);
  }

  return {
    api,
    ctx,
    registeredTools,
    commands,
    flags,
    handlers,
    notifications,
    blockedToolCalls,
    forwardedMessages,
    activeSnapshots,
    waitForIdle,
    emit,
    command,
    execute,
    get activeTools() { return [...activeTools]; },
  };
}

const originalHome = process.env.HOME;
const originalAgentName = process.env.PI_AGENT_NAME;
const originalTeamName = process.env.PI_TEAM_NAME;
let testHome: string;

beforeAll(() => {
  vi.useFakeTimers();
  testHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-teams-activation-"));
  process.env.HOME = testHome;
});

afterEach(() => {
  vi.clearAllTimers();
  fs.rmSync(path.join(testHome, ".pi"), { recursive: true, force: true });
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  fs.rmSync(testHome, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
  if (originalAgentName === undefined) delete process.env.PI_AGENT_NAME; else process.env.PI_AGENT_NAME = originalAgentName;
  if (originalTeamName === undefined) delete process.env.PI_TEAM_NAME; else process.env.PI_TEAM_NAME = originalTeamName;
});

describe("explicit Teams activation", () => {
  it("registers no Teams tools on ordinary factory load or session_start", async () => {
    const harness = await createHarness();
    expect(harness.registeredTools).toEqual([]);
    await harness.emit("session_start");
    expect(harness.registeredTools).toEqual([]);
    expect(harness.activeTools).toEqual(["read", "unrelated_active"]);
  });

  it("registers one command and the boolean team-mode flag without an input activation handler", async () => {
    const harness = await createHarness();
    expect(harness.api.registerCommand.mock.calls.filter(([name]) => name === "team")).toHaveLength(1);
    expect(harness.flags.get("team-mode")).toMatchObject({ type: "boolean", default: false });
    expect(harness.handlers.has("input")).toBe(false);
  });

  it("activates all Teams tools exactly once while preserving unrelated active and inactive tools", async () => {
    const harness = await createHarness();
    await harness.command("team", "refactor the auth module");
    await harness.command("team", "repeat explicitly");

    expect(harness.registeredTools.map((tool) => tool.name)).toEqual(TEAM_TOOL_NAMES);
    expect(new Set(harness.registeredTools.map((tool) => tool.name)).size).toBe(TEAM_TOOL_NAMES.length);
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
    expect(harness.activeTools).not.toContain("unrelated_inactive");
  });

  it("waits for idle then forwards exactly one scoped message for /team request", async () => {
    const harness = await createHarness();
    await harness.command("team", "refactor the auth module");
    expect(harness.waitForIdle).toHaveBeenCalledOnce();
    expect(harness.forwardedMessages).toEqual([
      "Use pi-teams for this request:\nrefactor the auth module",
    ]);
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
  });

  it("rejects empty /team input without changing tool state or forwarding", async () => {
    const harness = await createHarness();
    await harness.command("team", "   ");
    expect(harness.waitForIdle).not.toHaveBeenCalled();
    expect(harness.registeredTools).toEqual([]);
    expect(harness.activeSnapshots).toEqual([]);
    expect(harness.forwardedMessages).toEqual([]);
    expect(harness.notifications.at(-1)?.message).toMatch(/usage/i);
  });

  it("keeps --team-mode active after agent_settled", async () => {
    const harness = await createHarness({ flags: { "team-mode": true } });
    await harness.emit("session_start");
    await harness.emit("agent_settled");
    expect(harness.registeredTools.map((tool) => tool.name)).toEqual(TEAM_TOOL_NAMES);
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
  });

  it("blocks a stale unauthorized Teams call but not an unrelated tool call", async () => {
    const harness = await createHarness();
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "team_create" }))
      .toContainEqual({ block: true, reason: expect.stringMatching(/not active/i) });
    expect(harness.blockedToolCalls).toEqual([
      { toolName: "team_create", reason: expect.stringMatching(/not active/i) },
    ]);
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "read" }))
      .toEqual([undefined]);
  });
});

describe("Teams authorization lifecycle", () => {
  it("keeps request authorization through tool follow-ups, then hides and blocks stale calls after settling", async () => {
    const harness = await createHarness();
    await harness.command("team", "coordinate this");
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "task_list" }))
      .toEqual([undefined]);
    await harness.emit("agent_settled");
    expect(harness.activeTools).toEqual(["read", "unrelated_active"]);
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "task_list" }))
      .toContainEqual({ block: true, reason: expect.stringMatching(/not active/i) });
  });

  it.each(["team_create", "create_predefined_team"])(
    "%s success transitions request activation to live-lead activation",
    async (toolName) => {
      const harness = await createHarness();
      await harness.emit("session_start");
      await harness.command("team", "create a team");
      const params = toolName === "team_create"
        ? { team_name: "alpha" }
        : { team_name: "alpha", predefined_team: "empty", cwd: process.cwd() };
      await harness.execute(toolName, params);
      await harness.emit("agent_settled");
      expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
      expect(await harness.emit("tool_call", { type: "tool_call", toolName: "task_list" }))
        .toEqual([undefined]);
    },
  );

  it("enforces openai-codex for an unqualified predefined-agent model", async () => {
    const harness = await createHarness();
    await harness.command("team", "create a modeled team");
    mockTerminalSpawn.mockClear();

    const result = await harness.execute("create_predefined_team", {
      team_name: "modeled-team",
      predefined_team: "modeled",
      cwd: process.cwd(),
    });

    expect(result.details.results).toEqual([
      { name: "builder", status: "spawned", error: undefined },
    ]);
    const config = JSON.parse(fs.readFileSync(
      path.join(testHome, ".pi", "teams", "modeled-team", "config.json"),
      "utf-8",
    ));
    expect(config.members.find((member: any) => member.name === "builder")?.model)
      .toBe("openai-codex/gpt-5.6-sol");
    expect(mockTerminalSpawn).toHaveBeenCalledWith(expect.objectContaining({
      command: "pi --model openai-codex/gpt-5.6-sol",
    }));
  });

  it("automatically activates teammates and preserves unrelated inactive tools through start checks", async () => {
    fs.mkdirSync(path.join(testHome, ".pi", "teams", "alpha"), { recursive: true });
    const harness = await createHarness({ teammate: "builder", teamName: "alpha" });
    await harness.emit("session_start");
    await harness.emit("before_agent_start", { type: "before_agent_start", systemPrompt: "base" });
    expect(harness.registeredTools.map((tool) => tool.name)).toEqual(TEAM_TOOL_NAMES);
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
    expect(harness.activeTools).not.toContain("unrelated_inactive");
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "send_message" }))
      .toEqual([undefined]);
  });

  it("recovers a live lead on session_start without duplicate tools or polling", async () => {
    const teamDir = path.join(testHome, ".pi", "teams", "recovered");
    fs.mkdirSync(teamDir, { recursive: true });
    fs.writeFileSync(path.join(teamDir, "lead-session.json"), JSON.stringify({ pid: process.pid }));
    const harness = await createHarness();
    await harness.emit("session_start");
    await harness.emit("session_start");
    expect(harness.registeredTools.map((tool) => tool.name)).toEqual(TEAM_TOOL_NAMES);
    expect(new Set(harness.registeredTools.map((tool) => tool.name)).size).toBe(TEAM_TOOL_NAMES.length);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("successful current-team shutdown hides Teams unless team-mode is active", async () => {
    for (const teamMode of [false, true]) {
      const harness = await createHarness({ flags: { "team-mode": teamMode } });
      await harness.emit("session_start");
      await harness.command("team", "create alpha");
      await harness.execute("team_create", { team_name: `alpha-${teamMode}` });
      await harness.execute("team_shutdown", { team_name: `alpha-${teamMode}` });
      expect(harness.activeTools).toEqual(
        teamMode ? ["read", "unrelated_active", ...TEAM_TOOL_NAMES] : ["read", "unrelated_active"],
      );
    }
  });

  it("failed shutdown leaves the current live team active", async () => {
    const harness = await createHarness();
    await harness.emit("session_start");
    await harness.command("team", "create alpha");
    await harness.execute("team_create", { team_name: "alpha" });
    fs.rmSync(path.join(testHome, ".pi", "teams", "alpha", "config.json"));
    await expect(harness.execute("team_shutdown", { team_name: "alpha" })).rejects.toThrow();
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
  });

  it("shutdown of a different team preserves the current live-team authorization", async () => {
    const harness = await createHarness();
    await harness.emit("session_start");
    await harness.command("team", "create teams");
    await harness.execute("team_create", { team_name: "other" });
    await harness.execute("team_create", { team_name: "current" });
    await harness.execute("team_shutdown", { team_name: "other" });
    expect(harness.activeTools).toEqual(["read", "unrelated_active", ...TEAM_TOOL_NAMES]);
    expect(await harness.emit("tool_call", { type: "tool_call", toolName: "team_shutdown" }))
      .toEqual([undefined]);
  });
});
