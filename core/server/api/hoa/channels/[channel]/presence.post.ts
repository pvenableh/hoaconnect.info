/**
 * POST /api/hoa/channels/:channel/presence
 *
 * The 60 s heartbeat of an OPEN channel. It does two things: stamps
 * `hoa_channel_members.present_at` for the caller (so notify-on-message knows
 * to leave them alone — they are reading it), and answers with who else is
 * here, for the avatars in the thread header.
 *
 * Presence is a timestamp, not a connection: a beat is good for
 * `PRESENCE_TTL_MS` (90 s), so a closed tab simply ages out; `{ leaving: true }`
 * clears it early on a clean close. A timestamp on the roster row — rather than
 * server memory — is what makes this correct across serverless instances.
 *
 * Authorization is `read.post.ts`'s shape (your own roster row, or an org-wide
 * read of a non-private channel). No row to stamp → nothing is written, and the
 * answer is still given. Everything here is best-effort: if `present_at` isn't
 * migrated yet the route answers `{ here: [] }` and notifications simply aren't
 * suppressed.
 *
 * Body: { leaving?: boolean }
 */

import { readItems, updateItem } from "@directus/sdk";
import { PRESENCE_TTL_MS } from "#core/shared/channels/rules";

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, "channel");
  if (!channelId) throw createError({ statusCode: 400, message: "channel is required" });
  const body = await readBody(event).catch(() => ({}) as any);
  const leaving = body?.leaving === true;

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  const channel = (
    (await directus.request(
      readItems("hoa_channels", {
        filter: { id: { _eq: channelId } },
        fields: ["id", "organization", "is_private", "status"],
        limit: 1,
      })
    )) as any[]
  )[0];
  if (!channel || channel.status === "deleted") {
    throw createError({ statusCode: 404, message: "Channel not found" });
  }
  const orgId =
    typeof channel.organization === "string" ? channel.organization : channel.organization?.id;

  const mine = (
    (await directus.request(
      readItems("hoa_channel_members", {
        filter: { channel: { _eq: channelId }, user: { _eq: userId } },
        fields: ["id"],
        limit: 1,
      })
    )) as any[]
  )[0];

  if (!mine) {
    const orgWide =
      !!orgId &&
      channel.is_private !== true &&
      ((await checkAdminAccess(event, orgId)).isAdmin ||
        (await isActiveBoardMember(directus, userId, orgId)));
    if (!orgWide) throw createError({ statusCode: 403, message: "Not a member of this channel" });
  }

  try {
    if (mine) {
      await directus.request(
        updateItem("hoa_channel_members", mine.id, {
          present_at: leaving ? null : new Date().toISOString(),
        } as any)
      );
    }
    if (leaving) return { ok: true, here: [] };

    const since = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
    const rows = (await directus.request(
      readItems("hoa_channel_members", {
        filter: {
          channel: { _eq: channelId },
          user: { _neq: userId },
          present_at: { _gte: since },
        } as any,
        fields: ["user.id", "user.first_name", "user.last_name", "user.avatar"] as any,
        limit: 25,
      })
    )) as any[];
    const here = rows
      .map((r) => r.user)
      .filter((u) => u?.id)
      .map((u) => ({
        id: u.id as string,
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
        avatar: u.avatar ?? null,
      }));
    return { ok: true, here };
  } catch (e: any) {
    console.warn("[channels/presence] unavailable (is present_at migrated?):", e?.message || e);
    return { ok: true, here: [] };
  }
});
