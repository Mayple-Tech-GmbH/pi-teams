---
description: Use Teams only after explicit activation with /team or --team-mode; then coordinate agents through shared tasks and messaging.
---

# Agent Teams

Use Teams only after explicit activation. The user can send one scoped request with `/team <request>` or start Pi with the session-wide `pi --team-mode` override. An ordinary cold lead session has no Teams tool schemas.

A scoped request hides the tools when the run settles unless it creates a live team. After first use, hidden tools are registered but inactive. Teammates and live leads recover activation automatically; successful shutdown of the current team hides it unless `--team-mode` is set. pi-teams changes only its own 21 tools. `/lock` remains the separate owner of read-only enforcement, and pi-subagents remains separate from pi-teams.

## Model rule

- Teams and teammates must use **only** `openai-codex/*` models.
- Never request `anthropic/*`, `github-copilot/*`, `openai/*`, or any other provider for teammates.
- If the user names another provider, treat it as a hint and let pi-teams coerce it to an available `openai-codex/*` model.
- When you mention a model in chat, examples, or tool arguments, use an explicit `openai-codex/*` model name.
- For GPT-5.6, map low-cost work to `openai-codex/gpt-5.6-luna`, balanced work to `openai-codex/gpt-5.6-terra`, and high-capability/default work to `openai-codex/gpt-5.6-sol`.
## Workflow

1.  **Activate explicitly**: Use `/team Create a team named 'my-team' for this task` for one request, or require the user to launch `pi --team-mode` for the session. Empty `/team` is a usage error; no status/off subcommands exist.
2.  **Create a team**: After activation, use `team_create(team_name="my-team")` if the scoped request did not already create it.
3.  **Spawn teammates**: Use `spawn_teammate` to start additional agents. Give them specific roles and initial prompts.
4.  **Manage tasks**:
    *   `task_create`: Define work for the team.
    *   `task_list`: List all tasks to monitor progress or find available work.
    *   `task_get`: Get full details of a specific task by ID.
    *   `task_update`: Update a task's status (`pending`, `in_progress`, `completed`, `deleted`) or owner.
5.  **Communicate**: Use `send_message` to give instructions or receive updates. Teammates should use `read_inbox` to check for messages.
6.  **Monitor**: Use `check_teammate` to see if they are still running and if they have sent messages back.
7.  **Cleanup**:
    *   `force_kill_teammate`: Forcibly stop a teammate and remove them from the team.
    *   `process_shutdown_approved`: Orderly removal of a teammate after they've finished.
    *   `team_delete`: Remove a team and all its associated data.

## Teammate Instructions

When you are spawned as a teammate:
- Your status bar will show "Teammate: name @ team".
- You will automatically start by calling `read_inbox` to get your initial instructions.
- Regularly check `read_inbox` for updates from the lead.
- Use `send_message` to "team-lead" to report progress or ask questions.
- Update your assigned tasks using `task_update`.
- If you are idle for more than 30 seconds, you will automatically check your inbox for new messages.

## Best Practices for Teammates

- **Update Task Status**: As you work, use `task_update` to set your tasks to `in_progress` and then `completed`.
- **Frequent Communication**: Send short summaries of your work back to `team-lead` frequently.
- **Context Matters**: When you finish a task, send a message explaining your results and any new files you created.
- **Independence**: If you get stuck, try to solve it yourself first, but don't hesitate to ask `team-lead` for clarification.
- **Orderly Shutdown**: When you've finished all your work and have no more instructions, notify the lead and wait for shutdown approval.

## Best Practices for Team Leads

- **Clear Assignments**: Use `task_create` for all significant work items.
- **Contextual Prompts**: Provide enough context in `spawn_teammate` for the teammate to understand their specific role.
- **Task List Monitoring**: Regularly call `task_list` to see the status of all work.
- **Direct Feedback**: Use `send_message` to provide course corrections or new instructions to teammates.
- **Read Config**: Use `read_config` to see the full team roster and their current status.
