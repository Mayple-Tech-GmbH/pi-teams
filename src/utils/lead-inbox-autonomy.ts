export const LEAD_INBOX_WAKE_COOLDOWN_MS = 15_000;

export function buildLeadInboxWakeMessage(teamName: string, unreadCount: number): string {
  return `You have ${unreadCount} unread teammate message(s). Call read_inbox(team_name="${teamName}") now, process all unread teammate messages, and continue coordinating autonomously. Do not wait for user input. If teammates need replies, send them. If a submitted plan needs review, evaluate it. If task status or ownership should change, update it.`;
}

export function shouldWakeLeadForInbox(input: {
  unreadCount: number;
  isIdle: boolean;
  hasPendingMessages: boolean;
  lastWakeAt: number;
  now?: number;
  cooldownMs?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const cooldownMs = input.cooldownMs ?? LEAD_INBOX_WAKE_COOLDOWN_MS;

  if (input.unreadCount <= 0) return false;
  if (!input.isIdle) return false;
  if (input.hasPendingMessages) return false;
  if (now - input.lastWakeAt < cooldownMs) return false;

  return true;
}

export function buildLeadSystemPrompt(teamName: string): string {
  return `You are the team lead for team '${teamName}'.\nYou must coordinate autonomously.\nWhen awakened due to teammate activity or unread messages, call read_inbox(team_name="${teamName}") first, process all unread teammate messages, and continue coordinating without waiting for user input unless a real ambiguity or blocker requires human input.`;
}
