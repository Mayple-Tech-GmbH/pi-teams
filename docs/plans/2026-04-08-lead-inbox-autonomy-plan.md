# Lead Inbox Autonomy Improvement Plan

**Goal:** Make the `pi-teams` orchestrator lead reliably resume autonomous coordination when teammates send messages, without requiring the human to type `continue`.

**Architecture:** Start with a minimal, low-risk behavior fix. Strengthen the lead wake-up message and reinforce lead-specific orchestration instructions so the lead treats unread teammate activity as a directive to read the inbox and continue acting. Add a light anti-spam guard and verify the exact failure mode before considering a deeper extension-managed inbox-delivery redesign.

**Tech Stack:** TypeScript, Pi extension hooks, `pi.sendUserMessage()`, existing `read_inbox` tool, existing runtime/inbox polling code.

---

## Scope

This plan intentionally avoids the larger deterministic redesign where the extension reads and injects unread inbox payloads itself. The first pass should stay small and target the current behavioral gap.

### In scope
- Strengthen the lead auto-wake message
- Reinforce lead orchestration behavior in prompt/context
- Add a light duplicate-nudge guard that also respects pending queued messages
- Add at least one focused automated regression test for lead wake-up behavior
- Verify that a lead processes teammate inbox updates without manual `continue`
- Update docs if the behavior becomes part of the package contract

### Out of scope for this pass
- Moving inbox consumption from the agent into extension code
- New storage formats or queueing layers
- Deep state machines for delivery batching
- Broad refactors of teammate polling behavior

---

## Current Behavior Summary

### Observed implementation
File: `extensions/index.ts`

Current lead idle poller logic:
- polls every 30 seconds in `startLeadInboxPolling()`
- checks unread messages with `messaging.readInbox(teamName, agentName, true, false)`
- if unread messages exist, sends:
  - `I have ${unread.length} new message(s) in my inbox. Reading them now...`

Current gap:
- the extension does **not** actually invoke `read_inbox`
- the lead is only nudged by a generic self-message
- the lead has no equivalent first-turn orchestration prompt like teammates do
- result: the lead may stop until the human types `continue`

---

## Task 1: Strengthen the lead wake-up message

**Files:**
- Modify: `extensions/index.ts` in `startLeadInboxPolling()`
- Verify: `docs/reference.md` if wording changes need documentation

**Step 1: Locate the current lead polling message**

Find the current message in `startLeadInboxPolling()`:

```ts
pi.sendUserMessage(`I have ${unread.length} new message(s) in my inbox. Reading them now...`);
```

**Step 2: Replace it with an explicit autonomous directive**

Use a message that tells the lead exactly what to do. Example target wording:

```ts
pi.sendUserMessage(
  `You have ${unread.length} unread teammate message(s). Call read_inbox(team_name="${teamName}") now, process all unread teammate messages, and continue coordinating autonomously. Do not wait for user input. If teammates need replies, send them. If a submitted plan needs review, evaluate it. If task status or ownership should change, update it.`
);
```

Notes:
- keep the instruction imperative
- include the exact `read_inbox(team_name="...")` call target
- explicitly tell the lead not to wait for the human
- tell it to continue coordination, not just summarize

**Step 3: Keep the change narrow**

Do not add new logic in this task beyond replacing the message text.

**Step 4: Run a focused build or typecheck**

Run a project verification command after the edit.

Suggested commands:

```bash
npm test
```

or if the repo uses a smaller check:

```bash
npm run build
```

Expected:
- no TypeScript errors
- no regression from message-string edits

---

## Task 2: Reinforce lead orchestration instructions in prompt/context

**Files:**
- Modify: `extensions/index.ts` in lead session startup / prompt injection paths
- Inspect: `README.md`, `AGENTS.md`, `skills/teams.md`

**Step 1: Find where teammate-only prompt reinforcement exists**

Current teammate-specific logic exists in `before_agent_start`:

```ts
Start by calling read_inbox(team_name="${teamName}") to get your initial instructions.
```

The lead does not currently get equivalent orchestration guidance.

**Step 2: Add lead-specific instruction injection**

Introduce a lead-side prompt addition that applies when:
- the current session is the lead
- `teamName` exists

Candidate behavior text:

```ts
You are the team lead for team '${teamName}'.
You must coordinate autonomously.
When awakened due to teammate activity or unread messages, call read_inbox(team_name="${teamName}") first, process all unread teammate messages, and continue coordinating without waiting for user input unless a real ambiguity or blocker requires human input.
```

Implementation options:
- preferred: add a lead branch in `before_agent_start`
- acceptable: append a lead-specific prompt during lead reconnect/create flow if that is the most reliable hook

**Step 3: Keep teammate behavior unchanged**

Do not alter teammate startup wording unless necessary.

**Step 4: Verify no prompt branch collisions**

Check that:
- teammate sessions still receive teammate instructions
- lead sessions receive lead instructions
- no duplicate or contradictory role instructions are appended

**Step 5: Run verification**

Suggested command:

```bash
npm test
```

Expected:
- existing behavior remains intact
- no syntax or branching regressions

---

## Task 3: Add a light anti-spam guard for lead nudges

**Files:**
- Modify: `extensions/index.ts`

**Step 1: Add minimal in-memory guard state**

Add one small piece of state near the lead polling code, for example:

```ts
let lastLeadInboxWakeAt = 0;
```

Do **not** build a full queue or persistence layer.

**Step 2: Suppress obvious repeated nudges**

Before sending the lead wake-up message, require these lightweight rules:
- only send if `ctx.isIdle()` is true
- do **not** send if `ctx.hasPendingMessages()` is true
- only send if enough time has passed since the last wake-up, for example 10–30 seconds, as a secondary fallback guard

Example shape:

```ts
if (!ctx.isIdle()) return;
if (ctx.hasPendingMessages()) return;

const now = Date.now();
if (now - lastLeadInboxWakeAt < 15000) return;
lastLeadInboxWakeAt = now;
```

**Step 3: Keep semantics simple**

This guard is not meant to guarantee perfect dedupe. It should, however, prevent the most obvious duplicate lead wake-ups when unread messages remain present across poll intervals or when a previous wake-up is already queued.

**Step 4: Verify behavior manually**

Manual expectation:
- one teammate message while lead is idle triggers one wake-up
- repeated polling does not flood the lead every 30 seconds while the previous wake-up is still effectively pending

---

## Task 4: Add an automated regression test for lead wake-up behavior

**Files:**
- Modify: `extensions/index.ts` only if needed to extract a small helper
- Create or modify: a focused test file near existing extension/runtime tests

**Step 1: Extract a small test seam if needed**

If `startLeadInboxPolling()` is too coupled to test directly, extract only the decision logic needed for one polling tick into a small helper. Keep it narrow, for example:
- unread inbox count exists
- session is idle
- session has no pending messages
- cooldown has expired
- result: enqueue one lead wake-up message

Do **not** refactor the whole extension for testability. Extract only the minimum helper necessary.

**Step 2: Add one focused automated test**

Required regression case:
- idle lead
- unread lead inbox messages exist
- no pending queued messages
- cooldown expired
- one wake-up instruction is queued

The test should verify the lead receives exactly one auto-wake instruction, not repeated duplicates.

**Step 3: Add a duplicate-suppression test**

Required secondary case:
- unread lead inbox messages still exist
- a previous wake-up is already pending, or `ctx.hasPendingMessages()` is true
- result: no additional wake-up instruction is queued

Implementation notes:
- use fake timers if helpful
- mock `messaging.readInbox`
- mock or spy on `pi.sendUserMessage`
- keep the test local and deterministic

**Step 4: Run automated verification**

Suggested command:

```bash
npm test
```

Expected:
- new regression test passes
- no existing tests regress

---

## Task 5: Test the exact user-reported failure mode manually

**Files:**
- Optional: `docs/test-*.md` if verification notes should be captured

**Step 1: Reproduce baseline behavior before fix**

Manual repro:
1. Create a team as lead
2. Spawn one teammate
3. Let the lead go idle
4. Have the teammate send a message to the lead
5. Observe whether the lead wakes but stalls until manual `continue`

Capture the exact behavior in notes.

**Step 2: Re-run after Task 1–4 changes**

Expected behavior:
1. teammate sends a message
2. lead wakes on its own
3. lead calls `read_inbox(team_name="...")`
4. lead processes the content
5. lead continues coordination without the human typing `continue`

**Step 3: Run a plan/progress scenario**

Second manual scenario:
- teammate submits a progress update or plan-review request
- lead wakes autonomously
- lead reads inbox
- lead responds, evaluates, or updates tasks as appropriate

**Step 4: Decide whether a deeper redesign is needed**

If either scenario still flakes repeatedly, record that the next escalation is:
- extension-managed inbox fetch and injection of unread payloads

Do not implement that deeper redesign in this batch unless the lightweight fix clearly fails.

---

## Task 6: Update docs to match actual behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/reference.md`
- Optional: `AGENTS.md` or `skills/teams.md`

**Step 1: Update behavior claims only after verification**

Current docs already claim strong autonomy, e.g.:
- teammates and lead automatically wake and poll
- idle polling resumes work autonomously

After the code fix is verified, tighten wording so docs match the implemented behavior.

Suggested wording direction:
- lead wakes when teammate messages arrive while idle
- lead is instructed to read inbox first and continue coordinating autonomously

**Step 2: Avoid overstating determinism**

For this phase, do not claim the extension itself consumes the inbox. The lead is still an LLM-driven orchestrator prompted more strongly.

**Step 3: Run final verification**

Suggested command:

```bash
npm test
```

Then perform the manual lead/teammate workflow check again.

---

## Acceptance Criteria

This work is complete when all of the following are true:

1. The lead no longer typically requires manual `continue` after teammate messages arrive.
2. When idle and unread teammate messages exist, the lead wakes with an explicit instruction to call `read_inbox` and continue coordinating.
3. The lead has role-specific prompt/context reinforcement for autonomous orchestration.
4. Repeated idle polls do not spam the lead with identical wake-up messages every cycle, including when a prior wake-up is already queued.
5. At least one focused automated regression test covers lead wake-up and duplicate suppression behavior.
6. At least one real workflow verifies:
   - teammate sends message
   - lead wakes automatically
   - lead reads inbox
   - lead takes a follow-up coordination action without human prompting

---

## Verification Checklist

Run after implementation:

```bash
npm test
```

Manual verification checklist:
- [ ] create a team as lead
- [ ] spawn at least one teammate
- [ ] have teammate send a direct message to lead
- [ ] confirm lead wakes without manual `continue`
- [ ] confirm lead calls `read_inbox`
- [ ] confirm lead responds or coordinates next step autonomously
- [ ] confirm no repeated wake-up spam while idle
- [ ] confirm automated regression test covers wake-up and duplicate suppression

---

## Rollback / Escalation Notes

If this plan does not sufficiently fix the issue, the next plan should implement the stronger design:
- have the extension read unread lead inbox messages directly
- inject actual unread message payloads into the lead turn
- optionally track delivered message IDs to prevent replay

That escalation should be treated as a separate follow-up change, not folded into this minimal batch unless the lightweight fix clearly fails.