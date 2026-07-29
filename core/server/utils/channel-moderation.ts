// Channel-message moderation audit helper. Appends a row to
// hoa_channel_moderation_log via the elevated admin client — the log has no
// client permissions, so hide/remove/report all funnel through server routes
// that call this. Best-effort: a failed audit write never blocks the action.
// getTypedDirectus is auto-imported. Ported from Earnest's logModerationEvent.

import { createItem } from "@directus/sdk";

export function stripHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ModerationEvent {
  organization: string | null;
  channel: string;
  moderator?: string | null;
  action: "hide" | "remove" | "report";
  reason?: string | null;
  messageId: string;
  messageAuthor?: string | null;
  /** Raw (HTML) message content; stripped + truncated before storing. */
  messageContent?: string | null;
}

export async function logChannelModeration(ev: ModerationEvent): Promise<void> {
  if (!ev.organization) return; // org is required on the row; skip rather than throw
  try {
    const directus = getTypedDirectus() as any;
    await directus.request(
      (createItem as any)("hoa_channel_moderation_log", {
        organization: ev.organization,
        channel: ev.channel,
        moderator: ev.moderator ?? null,
        action: ev.action,
        reason: ev.reason ?? null,
        message_id: ev.messageId,
        message_author: ev.messageAuthor ?? null,
        message_snippet: ev.messageContent ? stripHtml(ev.messageContent).slice(0, 500) : null,
      })
    );
  } catch (err: any) {
    console.warn("logChannelModeration failed (non-fatal):", err?.message || err);
  }
}
