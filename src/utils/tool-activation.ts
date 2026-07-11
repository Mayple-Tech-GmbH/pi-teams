export const TEAM_TOOL_NAMES = [
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
] as const;

export const TEAM_TOOL_NAME_SET: ReadonlySet<string> = new Set(TEAM_TOOL_NAMES);

export function removeTeamTools(activeToolNames: readonly string[]): string[] {
  return activeToolNames.filter((toolName) => !TEAM_TOOL_NAME_SET.has(toolName));
}

export function activateTeamTools(
  activeToolNames: readonly string[],
  registeredToolNames: readonly string[],
): string[] {
  const activeTools = [...activeToolNames];
  const activeToolNameSet = new Set(activeToolNames);

  for (const toolName of registeredToolNames) {
    if (TEAM_TOOL_NAME_SET.has(toolName) && !activeToolNameSet.has(toolName)) {
      activeTools.push(toolName);
      activeToolNameSet.add(toolName);
    }
  }

  return activeTools;
}
