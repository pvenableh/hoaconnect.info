// Notify-on-message (Parity Round 3, Phase 7.2).
//
// A channel message is created straight from the browser, so there is no server
// moment to hang a fan-out on; the client calls `POST /channels/:id/notify`
// after the message (and its mentions) are written, and that route lands here.
//
// The caller names a message, not an audience. Everything that decides who
// hears — the roster, who muted, who has the channel open, who was @-mentioned —
// is re-read here, and the rules are the pure `planChannelFanOut`. A caller can
// only fan out THEIR OWN, RECENT, PUBLISHED message, once.
//
// Delivery is `notifyUsers`: a collapsed bell row per member ("3 new in
// #board") and a push tagged per channel, so a second message REPLACES the
// first notification on the device and re-buzzes. Email is deliberately absent —
// it reaches people through the digest. `getTypedDirectus`/`stripHtml` are
// auto-imported.

import { readItems } from "@directus/sdk";
import { collapsedSubject, planChannelFanOut, type FanOutMember } from "#core/shared/channels/rules";
import { notifyUsers } from "./notify";

/** A fan-out is for a message that was JUST sent; anything older is a replay. */
export const FANOUT_MAX_AGE_MS = 2 * 60 * 1000;

// Per-instance replay guard. The age window is the real bound; this stops the
// common case (a double-click, a client retry) inflating the "N new" count.
const done = new Map<string, number>();
function alreadyDone(id: string, now: number): boolean {
  for (const [k, t] of done) if (now - t > FANOUT_MAX_AGE_MS * 2) done.delete(k);
  if (done.has(id)) return true;
  done.set(id, now);
  return false;
}

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

async function withFallback(full: () => Promise<any>, reduced: () => Promise<any>): Promise<any> {
  try {
    return await full();
  } catch {
    // A field that isn't migrated yet 403s the whole read — degrade to the
    // columns that have always existed rather than losing the notification.
    return await reduced();
  }
}

export interface ChannelFanOutResult {
  ok: boolean;
  reason?: string;
  recipients?: number;
}

export async function notifyChannelMessage(input: {
  directus: ReturnType<typeof getTypedDirectus>;
  channelId: string;
  messageId: string;
  actorId: string;
  origin?: string | null;
  now?: Date;
}): Promise<ChannelFanOutResult> {
  const { directus, channelId, messageId, actorId } = input;
  const now = input.now ?? new Date();

  const channel = await withFallback(
    async () =>
      (
        (await directus.request(
          readItems("hoa_channels", {
            filter: { id: { _eq: channelId } },
            fields: ["id", "name", "organization", "status", "is_dm"] as any,
            limit: 1,
          })
        )) as any[]
      )[0],
    async () =>
      (
        (await directus.request(
          readItems("hoa_channels", {
            filter: { id: { _eq: channelId } },
            fields: ["id", "name", "organization", "status"],
            limit: 1,
          })
        )) as any[]
      )[0]
  );
  if (!channel || channel.status === "deleted" || channel.status === "archived") {
    return { ok: false, reason: "channel_unavailable" };
  }
  const orgId = idOf(channel.organization);
  if (!orgId) return { ok: false, reason: "no_org" };

  const msg = (
    (await directus.request(
      readItems("hoa_channel_messages", {
        filter: { id: { _eq: messageId }, channel: { _eq: channelId } },
        fields: ["id", "content", "status", "date_created", { user_created: ["id", "first_name", "last_name"] }],
        limit: 1,
      })
    )) as any[]
  )[0];
  if (!msg) return { ok: false, reason: "no_message" };
  const author = msg.user_created;
  // Only the author triggers their own fan-out.
  if (idOf(author) !== actorId) return { ok: false, reason: "not_author" };
  if (msg.status !== "published") return { ok: false, reason: "not_published" };
  const age = now.getTime() - new Date(msg.date_created).getTime();
  if (!Number.isFinite(age) || age > FANOUT_MAX_AGE_MS) return { ok: false, reason: "stale" };
  if (alreadyDone(messageId, now.getTime())) return { ok: false, reason: "duplicate" };

  const members = (await withFallback(
    async () =>
      directus.request(
        readItems("hoa_channel_members", {
          filter: { channel: { _eq: channelId } },
          fields: ["user", "notifications_enabled", "present_at"] as any,
          limit: -1,
        })
      ),
    async () =>
      directus.request(
        readItems("hoa_channel_members", {
          filter: { channel: { _eq: channelId } },
          fields: ["user", "notifications_enabled"],
          limit: -1,
        })
      )
  )) as any[];

  const mentions = (await directus
    .request(
      readItems("hoa_channel_mentions", {
        filter: { message: { _eq: messageId } },
        fields: ["mentioned_user"],
        limit: -1,
      })
    )
    .catch(() => [])) as any[];

  const recipients = planChannelFanOut({
    members: members.map(
      (m): FanOutMember => ({
        user: idOf(m.user) ?? "",
        notifications_enabled: m.notifications_enabled,
        present_at: m.present_at,
      })
    ),
    authorId: actorId,
    mentionedIds: mentions.map((m) => idOf(m.mentioned_user)).filter(Boolean) as string[],
    now,
  });
  if (!recipients.length) return { ok: true, recipients: 0 };

  const authorName =
    [author?.first_name, author?.last_name].filter(Boolean).join(" ").trim() || "A member";
  const isDm = channel.is_dm === true;
  const channelName = String(channel.name || "channel");
  const excerpt = stripHtml(msg.content).slice(0, 140);

  await notifyUsers({
    organizationId: orgId,
    recipientUserIds: recipients,
    category: "channel",
    subject: isDm ? authorName : `#${channelName.replace(/^#/, "")}`,
    message: excerpt ? `${authorName}: ${excerpt}` : `${authorName} sent a message.`,
    // Bell row + push tag are both keyed on the CHANNEL, not the message.
    collection: "hoa_channels",
    item: channelId,
    path: `/admin/channels/${channelId}`,
    origin: input.origin ?? null,
    excludeUserId: actorId,
    bellCollapse: {
      subjectFor: (count) => collapsedSubject({ count, channelName, isDm, authorName }),
    },
    pushActions: [{ action: "open", title: "Open", path: `/admin/channels/${channelId}` }],
  });

  return { ok: true, recipients: recipients.length };
}
