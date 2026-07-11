# pi-teams Usage Guide

This guide provides detailed examples, patterns, and best practices for using pi-teams.

## Table of Contents

- [Getting Started](#getting-started)
- [Activation and Tool Visibility](#activation-and-tool-visibility)
- [Common Workflows](#common-workflows)
- [Hook System](#hook-system)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Basic Team Setup

First, make sure you're inside a tmux session, Zellij session, or iTerm2:

```bash
tmux  # or zellij, or just use iTerm2
```

Then start pi:

```bash
pi
```

Explicitly activate pi-teams and create your first team in one step:

```text
/team Create a team named 'my-team' for this task
```

To keep Teams available for every request in this Pi session, start it with `pi --team-mode`. Then ask for a team in ordinary language. pi-teams only runs teammates on `openai-codex/*` models; another provider name is treated as a hint and coerced to an available supported model.

## Activation and Tool Visibility

### Request-scoped activation

`/team <request>` is an explicit, one-step request. It activates the 21 Teams tools, preserves unrelated tool state and order, and forwards:

```text
Use pi-teams for this request:
<request>
```

Empty `/team` input reports `Usage: /team <request>` and changes nothing. No status/off subcommands are available.

When the request settles without creating a team, pi-teams hides its tools. A cold session is **unregistered and inactive**: the Teams tools do not appear in the registered inventory or model schemas. After first use, inactive mode is **registered but inactive**: Pi retains the registrations because it cannot unregister tools, but the schemas remain absent from the model's active context.

### Session and live-team activation

`pi --team-mode` is a session-wide override, so settling one request does not hide Teams. Teammate sessions activate Teams automatically. A lead that reconnects to a live team in the same process also recovers activation automatically.

Creating a team keeps Teams active after the initiating request settles. A successful shutdown hides the tools only when it shuts down the current live team, unless `--team-mode` remains set. Shutting down a different team leaves the current mode unchanged. A failed shutdown leaves Teams active for recovery and retry.

### Separate boundaries

pi-teams adds or removes only its own 21 tool names and preserves all unrelated active or inactive choices. `/lock` and other profiles remain separate owners of their restrictions; `/lock` must still enforce read-only behavior. **pi-subagents is separate from pi-teams**: pi-subagents delegates subagents, while pi-teams manages terminal teammates, messaging, and a shared task board.

---

## Common Workflows

In a cold session, send each create-team example as `/team <request>`; otherwise, the examples assume Pi was started with `--team-mode`.

### 1. Code Review Team

> **You:** "Create a team named 'code-review' using 'openai-codex/gpt-5.4'"
> **You:** "Spawn a teammate named 'security-reviewer' to check for vulnerabilities"
> **You:** "Spawn a teammate named 'performance-reviewer' using 'openai-codex/gpt-5.3-codex' to check for optimization opportunities"
> **You:** "Create a task for security-reviewer: 'Review the auth module for SQL injection risks' and set it to in_progress"
> **You:** "Create a task for performance-reviewer: 'Analyze the database queries for N+1 issues' and set it to in_progress"

### 2. Refactor with Plan Approval

> **You:** "Create a team named 'refactor-squad'"
> **You:** "Spawn a teammate named 'refactor-bot' and require plan approval before they make any changes"
> **You:** "Create a task for refactor-bot: 'Refactor the user service to use dependency injection' and set it to in_progress"

Teammate submits a plan. Review it:

> **You:** "List all tasks and show me refactor-bot's plan for task 1"

Approve or reject:

> **You:** "Approve refactor-bot's plan for task 1"

> **You:** "Reject refactor-bot's plan for task 1 with feedback: 'Add unit tests for the new injection pattern'"

### 3. Testing with Automated Hooks

Create a hook script at `.pi/team-hooks/task_completed.sh`:

```bash
#!/bin/bash
# This script runs automatically when any task is completed

echo "Running post-task checks..."
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed! Please fix before marking task complete."
  exit 1
fi

npm run lint
echo "All checks passed!"
```

> **You:** "Create a team named 'test-team'"
> **You:** "Spawn a teammate named 'qa-bot' to write tests"
> **You:** "Create a task for qa-bot: 'Write unit tests for the payment module' and set it to in_progress"

When qa-bot marks the task as completed, the hook automatically runs tests and linting.

### 4. Coordinated Migration

> **You:** "Create a team named 'migration-team'"
> **You:** "Spawn a teammate named 'db-migrator' to handle database changes"
> **You:** "Spawn a teammate named 'api-updater' using 'openai-codex/gpt-5.4' to update API endpoints"
> **You:** "Spawn a teammate named 'test-writer' to write tests for the migration"
> **You:** "Create a task for db-migrator: 'Add new columns to the users table' and set it to in_progress"

After db-migrator completes, broadcast the schema change:

> **You:** "Broadcast to the team: 'New columns added to users table: phone, email_verified. Please update your code accordingly.'"

### 5. Mixed-Speed Team

Use different models for cost optimization:

<<<<<<< HEAD
> **You:** "Create a team named 'mixed-speed' using 'gpt-4o'"
> **You:** "Spawn a teammate named 'architect' using 'gpt-4o' with 'xhigh' thinking level for design decisions"
> **You:** "Spawn a teammate named 'implementer' using 'haiku' with 'low' thinking level for quick coding"
> **You:** "Spawn a teammate named 'reviewer' using 'gpt-4o' with 'medium' thinking level for code reviews"
||||||| parent of d08ead9 (Enforce openai-codex models for pi-teams)
> **You:** "Create a team named 'mixed-speed' using 'gpt-4o'"
> **You:** "Spawn a teammate named 'architect' using 'gpt-4o' with 'high' thinking level for design decisions"
> **You:** "Spawn a teammate named 'implementer' using 'haiku' with 'low' thinking level for quick coding"
> **You:** "Spawn a teammate named 'reviewer' using 'gpt-4o' with 'medium' thinking level for code reviews"
=======
> **You:** "Create a team named 'mixed-speed' using 'openai-codex/gpt-5.4'"
> **You:** "Spawn a teammate named 'architect' using 'openai-codex/gpt-5.4' with 'high' thinking level for design decisions"
> **You:** "Spawn a teammate named 'implementer' using 'openai-codex/gpt-5.3-codex' with 'low' thinking level for quick coding"
> **You:** "Spawn a teammate named 'reviewer' using 'openai-codex/gpt-5.4' with 'medium' thinking level for code reviews"
>>>>>>> d08ead9 (Enforce openai-codex models for pi-teams)

Now you have deeper reasoning for design and reviews, but faster implementation — all within the supported `openai-codex/*` family.

---

## Hook System

### Overview

Hooks are shell scripts that run automatically at specific events. Currently supported:

- **`task_completed.sh`** - Runs when any task's status changes to `completed`

### Hook Location

Hooks should be placed in `.pi/team-hooks/` in your project directory:

```
your-project/
├── .pi/
│   └── team-hooks/
│       └── task_completed.sh
```

### Hook Payload

The hook receives the task data as a JSON string as the first argument:

```bash
#!/bin/bash
TASK_DATA="$1"
echo "Task completed: $TASK_DATA"
```

Example payload:
```json
{
  "id": "task_123",
  "subject": "Fix login bug",
  "description": "Users can't login with special characters",
  "status": "completed",
  "owner": "fixer-bot"
}
```

### Example Hooks

#### Test on Completion

```bash
#!/bin/bash
# .pi/team-hooks/task_completed.sh

TASK_DATA="$1"
SUBJECT=$(echo "$TASK_DATA" | jq -r '.subject')

echo "Running tests after task: $SUBJECT"
npm test
```

#### Notify Slack

```bash
#!/bin/bash
# .pi/team-hooks/task_completed.sh

TASK_DATA="$1"
SUBJECT=$(echo "$TASK_DATA" | jq -r '.subject')
OWNER=$(echo "$TASK_DATA" | jq -r '.owner')

curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"Task '$SUBJECT' completed by $OWNER\"}" \
  "$SLACK_WEBHOOK_URL"
```

#### Conditional Checks

```bash
#!/bin/bash
# .pi/team-hooks/task_completed.sh

TASK_DATA="$1"
SUBJECT=$(echo "$TASK_DATA" | jq -r '.subject')

# Only run full test suite for production-related tasks
if [[ "$SUBJECT" == *"production"* ]] || [[ "$SUBJECT" == *"deploy"* ]]; then
  npm run test:ci
else
  npm test
fi
```

---

## Best Practices

### 1. Use Thinking Levels Wisely

- **`off`** - Simple tasks: formatting, moving code, renaming
- **`minimal`** - Quick decisions: small refactors, straightforward bugfixes
- **`low`** - Standard work: typical feature implementation, tests
- **`medium`** - Complex work: architecture decisions, tricky bugs
- **`high`** - Critical work: security reviews, major refactors, design specs
- **`xhigh`** - Deepest available reasoning: architecture audits, thorny debugging, high-stakes review work

### 2. Team Composition

Balanced teams typically include:
- **1-2 high-thinking, high-model** agents for architecture and reviews
- **Use `xhigh` sparingly** for the one teammate doing the hardest reasoning-heavy work
- **2-3 low-thinking, fast-model** agents for implementation
- **1 medium-thinking** agent for coordination

All of these should stay on `openai-codex/*` models.

Example:
```bash
# Design/Review duo (expensive but thorough)
<<<<<<< HEAD
spawn "architect" using "gpt-4o" with "xhigh" thinking
spawn "reviewer" using "gpt-4o" with "medium" thinking
||||||| parent of d08ead9 (Enforce openai-codex models for pi-teams)
spawn "architect" using "gpt-4o" with "high" thinking
spawn "reviewer" using "gpt-4o" with "medium" thinking
=======
spawn "architect" using "openai-codex/gpt-5.4" with "high" thinking
spawn "reviewer" using "openai-codex/gpt-5.4" with "medium" thinking
>>>>>>> d08ead9 (Enforce openai-codex models for pi-teams)

# Implementation trio (fast and cheap)
spawn "backend-dev" using "openai-codex/gpt-5.3-codex" with "low" thinking
spawn "frontend-dev" using "openai-codex/gpt-5.3-codex" with "low" thinking
spawn "test-writer" using "openai-codex/gpt-5.3-codex" with "off" thinking
```

### 3. Plan Approval for High-Risk Changes

Enable plan approval mode for:
- Database schema changes
- API contract changes
- Security-related work
- Performance-critical code

Disable for:
- Documentation updates
- Test additions
- Simple bug fixes

### 4. Broadcast for Coordination

Use broadcasts when:
- API endpoints change
- Database schemas change
- Deployment happens
- Team priorities shift

### 5. Clear Task Descriptions

Good task:
```
"Add password strength validation to the signup form. 
Requirements: minimum 8 chars, at least one number and symbol.
Use the zxcvbn library for strength calculation."
```

Bad task:
```
"Fix signup form"
```

### 6. Check Progress Regularly

> **You:** "List all tasks"
> **You:** "Check my inbox for messages"
> **You:** "How is the team doing?"

This helps you catch blockers early and provide feedback.

---

## Troubleshooting

### Teammate Not Responding

**Problem**: A teammate is idle but not picking up messages.

**Solution**:
1. Check if they're still running:
   > **You:** "Check on teammate named 'security-bot'"
2. Check their inbox:
   > **You:** "Read security-bot's inbox"
3. Force kill and respawn if needed:
   > **You:** "Force kill security-bot and respawn them"

### tmux Pane Issues

**Problem**: tmux panes don't close when killing teammates.

**Solution**: Make sure you started pi inside a tmux session. If you started pi outside tmux, it won't work properly.

```bash
# Correct way
tmux
pi

# Incorrect way
pi  # Then try to use tmux commands
```

### Hook Not Running

**Problem**: Your task_completed.sh script isn't executing.

**Checklist**:
1. File exists at `.pi/team-hooks/task_completed.sh`
2. File is executable: `chmod +x .pi/team-hooks/task_completed.sh`
3. Shebang line is present: `#!/bin/bash`
4. Test manually: `.pi/team-hooks/task_completed.sh '{"test":"data"}'`

### Model Errors

**Problem**: "Model not found" or similar errors.

**Solution**: pi-teams only supports teammate models from `openai-codex/*`.

1. Check `pi --list-models` and confirm at least one `openai-codex/*` model is available.
2. Prefer explicit model names such as `openai-codex/gpt-5.4` or `openai-codex/gpt-5.3-codex`.
3. If you mention another provider, pi-teams will coerce it to an available `openai-codex/*` model.

### Data Location

All team data is stored in:
- `~/.pi/teams/<team-name>/` - Team configuration, member list
- `~/.pi/tasks/<team-name>/` - Task files
- `~/.pi/messages/<team-name>/` - Message history

You can manually inspect these JSON files to debug issues.

### iTerm2 Not Working

**Problem**: iTerm2 splits aren't appearing.

**Requirements**:
1. You must be on macOS
2. iTerm2 must be your terminal
3. You must NOT be inside tmux or Zellij (iTerm2 detection only works as a fallback)

**Alternative**: Use tmux or Zellij for more reliable pane management.

---

## Inter-Agent Communication

Teammates can message each other without your intervention:

```
Frontend Bot → Backend Bot: "What's the response format for /api/users?"
Backend Bot → Frontend Bot: "Returns {id, name, email, created_at}"
```

This enables autonomous coordination. You can see these messages by:
> **You:** "Read backend-bot's inbox"

---

## Cleanup

To remove all team data:

```bash
# Shut down team first
> "Shut down the team named 'my-team'"

# Then delete data directory
rm -rf ~/.pi/teams/my-team/
rm -rf ~/.pi/tasks/my-team/
rm -rf ~/.pi/messages/my-team/
```

Or use the delete command:
> **You:** "Delete the team named 'my-team'"
