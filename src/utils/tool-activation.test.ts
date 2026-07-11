import { describe, expect, it } from "vitest";
import {
  activateTeamTools,
  removeTeamTools,
  TEAM_TOOL_NAME_SET,
  TEAM_TOOL_NAMES,
} from "./tool-activation";

const expectedTeamToolNames = [
  "team_create",
  "spawn_teammate",
  "spawn_lead_window",
  "send_message",
  "broadcast_message",
  "read_inbox",
  "task_create",
  "task_submit_plan",
  "task_evaluate_plan",
  "task_list",
  "task_update",
  "team_shutdown",
  "cleanup_agent_sessions",
  "task_read",
  "check_teammate",
  "process_shutdown_approved",
  "list_predefined_teams",
  "list_predefined_agents",
  "create_predefined_team",
  "save_team_as_template",
  "list_runtime_teams",
];

describe("Teams tool activation", () => {
  it("exports exactly the registered Teams tool inventory without duplicates", () => {
    expect(TEAM_TOOL_NAMES).toEqual(expectedTeamToolNames);
    expect(new Set(TEAM_TOOL_NAMES).size).toBe(expectedTeamToolNames.length);
    expect([...TEAM_TOOL_NAME_SET]).toEqual(expectedTeamToolNames);
  });

  it("removes every Teams tool while preserving unrelated order", () => {
    const activeTools = [
      "subagent",
      ...expectedTeamToolNames,
      "background_process",
      "intercom",
      "unrelated_inactive_tool",
    ];

    expect(removeTeamTools(activeTools)).toEqual([
      "subagent",
      "background_process",
      "intercom",
      "unrelated_inactive_tool",
    ]);
    expect(activeTools).toEqual([
      "subagent",
      ...expectedTeamToolNames,
      "background_process",
      "intercom",
      "unrelated_inactive_tool",
    ]);
  });

  it("activates registered Teams tools without adding duplicates or changing unrelated entries", () => {
    const activeTools = ["subagent", "intercom", "subagent", "task_create"];
    const registeredTools = [
      "team_create",
      "task_create",
      "subagent_supervisor",
      "send_message",
      "team_create",
      "background_process",
    ];

    expect(activateTeamTools(activeTools, registeredTools)).toEqual([
      "subagent",
      "intercom",
      "subagent",
      "task_create",
      "team_create",
      "send_message",
    ]);
    expect(activeTools).toEqual(["subagent", "intercom", "subagent", "task_create"]);
  });

  it("preserves non-Teams tools and is idempotent across repeated activation and deactivation", () => {
    const activeTools = ["subagent", "subagent_supervisor", "intercom", "background_process"];
    const registeredTools = [
      "task_list",
      "team_create",
      "task_list",
      "list_runtime_teams",
    ];

    const activated = activateTeamTools(activeTools, registeredTools);
    expect(activateTeamTools(activated, registeredTools)).toEqual(activated);
    expect(activated).toEqual([
      "subagent",
      "subagent_supervisor",
      "intercom",
      "background_process",
      "task_list",
      "team_create",
      "list_runtime_teams",
    ]);

    const deactivated = removeTeamTools(activated);
    expect(deactivated).toEqual([
      "subagent",
      "subagent_supervisor",
      "intercom",
      "background_process",
    ]);
    expect(removeTeamTools(deactivated)).toEqual(deactivated);
  });

  it("activates only Teams tools that are registered, including after lazy registration", () => {
    const initiallyRegistered = ["subagent", "team_create", "intercom"];
    const lazilyRegistered = [
      "task_read",
      "check_teammate",
      "not_a_team_tool",
      "create_predefined_team",
    ];

    expect(activateTeamTools(["subagent", "intercom"], initiallyRegistered)).toEqual([
      "subagent",
      "intercom",
      "team_create",
    ]);
    expect(
      activateTeamTools(
        activateTeamTools(["subagent", "intercom"], initiallyRegistered),
        lazilyRegistered,
      ),
    ).toEqual(["subagent", "intercom", "team_create", "task_read", "check_teammate", "create_predefined_team"]);
  });

  it("deactivates all Teams tools regardless of registration state", () => {
    expect(
      removeTeamTools(["team_create", "task_read", "list_runtime_teams", "intercom"]),
    ).toEqual(["intercom"]);
  });
});
