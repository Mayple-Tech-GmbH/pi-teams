import { describe, it, expect } from "vitest";
import { buildLeadInboxWakeMessage, shouldWakeLeadForInbox } from "./lead-inbox-autonomy";

describe("lead inbox autonomy", () => {
  it("wakes an idle lead when unread messages exist and no wake-up is pending", () => {
    expect(shouldWakeLeadForInbox({
      unreadCount: 2,
      isIdle: true,
      hasPendingMessages: false,
      lastWakeAt: 0,
      now: 30_000,
      cooldownMs: 15_000,
    })).toBe(true);
  });

  it("does not wake the lead again when a wake-up is already pending", () => {
    expect(shouldWakeLeadForInbox({
      unreadCount: 2,
      isIdle: true,
      hasPendingMessages: true,
      lastWakeAt: 0,
      now: 30_000,
      cooldownMs: 15_000,
    })).toBe(false);
  });

  it("builds a wake-up message that instructs the lead to read the inbox and continue autonomously", () => {
    const message = buildLeadInboxWakeMessage("my-team", 3);

    expect(message).toContain("3 unread teammate message(s)");
    expect(message).toContain('read_inbox(team_name="my-team")');
    expect(message).toContain("continue coordinating autonomously");
    expect(message).toContain("Do not wait for user input");
  });
});
