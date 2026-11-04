import { readItems } from "@directus/sdk";

/**
 * GET /api/hoa/channels/dm-peers?organization=<id>
 *
 * "Who is this DM with?" A direct message is stored with a generic name (the
 * same row is read by two people), so each side has to be told the OTHER person.
 * Members can't read each other's roster rows under the browser's policy, so the
 * answer comes from here — scoped to the caller's own DM memberships.
 *
 * DMs are recognised by their `dm-` slug (what `/channels/dm` writes), which
 * works before the `is_dm` column is migrated.
 *
 * → { peers: { [channelId]: { id, name, avatar } } }
 */
export default defineEventHandler(async (event) => {
  const organization = String(getQuery(event)?.organization ?? "").trim();
  if (!organization) throw createError({ statusCode: 400, message: "organization is required" });

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  const mine = (await directus.request(
    readItems("hoa_channel_members", {
      filter: {
        user: { _eq: userId },
        channel: {
          organization: { _eq: organization },
          slug: { _starts_with: "dm-" },
          status: { _neq: "deleted" },
        },
      } as any,
      fields: ["channel"],
      limit: -1,
    })
  )) as any[];
  const channelIds = mine
    .map((m) => (typeof m.channel === "string" ? m.channel : m.channel?.id))
    .filter(Boolean) as string[];
  if (!channelIds.length) return { peers: {} };

  const others = (await directus.request(
    readItems("hoa_channel_members", {
      filter: { channel: { _in: channelIds }, user: { _neq: userId } } as any,
      fields: ["channel", "user.id", "user.first_name", "user.last_name", "user.avatar"] as any,
      limit: -1,
    })
  )) as any[];

  const peers: Record<string, { id: string; name: string; avatar: string | null }> = {};
  for (const row of others) {
    const channelId = typeof row.channel === "string" ? row.channel : row.channel?.id;
    const u = row.user;
    if (!channelId || !u?.id) continue;
    peers[channelId] = {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "Member",
      avatar: u.avatar ?? null,
    };
  }
  return { peers };
});
