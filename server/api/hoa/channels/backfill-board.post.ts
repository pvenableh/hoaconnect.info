import { readItems, createItems } from "@directus/sdk";

/**
 * Backfill board/admin enrollment into existing channels (Phase 8, Track A).
 *
 * Board membership isn't event-driven, so when a new board member is seated they
 * won't automatically appear in channels created earlier. This admin-triggered
 * endpoint enrolls every current admin + active board member into every
 * NON-PRIVATE channel of the org they're missing from. Idempotent — existing
 * memberships are skipped.
 *
 * Body: { organization }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const organization = body?.organization;
  if (!organization) {
    throw createError({ statusCode: 400, message: "organization is required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  // Admin-only maintenance action.
  await requireAdminAccess(event, organization);

  const directus = getTypedDirectus();

  const [channels, enrollees] = await Promise.all([
    directus.request(
      readItems("hoa_channels", {
        filter: {
          organization: { _eq: organization },
          is_private: { _neq: true },
          status: { _eq: "published" },
        },
        fields: ["id"],
        limit: -1,
      })
    ),
    getOrgChannelEnrollees(directus, organization),
  ]);

  if (!(channels as any[]).length || !enrollees.length) {
    return { channels: (channels as any[]).length, created: 0 };
  }

  const channelIds = (channels as any[]).map((c) => c.id);

  // Existing memberships across these channels → dedup set of `${channel}:${user}`.
  const existing = await directus.request(
    readItems("hoa_channel_members", {
      filter: { channel: { _in: channelIds } },
      fields: ["channel", "user"],
      limit: -1,
    })
  );
  const seen = new Set(
    (existing as any[]).map((m) => {
      const c = typeof m.channel === "string" ? m.channel : m.channel?.id;
      const u = typeof m.user === "string" ? m.user : m.user?.id;
      return `${c}:${u}`;
    })
  );

  const payload: any[] = [];
  for (const cid of channelIds) {
    for (const e of enrollees) {
      if (seen.has(`${cid}:${e.user}`)) continue;
      payload.push({
        channel: cid,
        user: e.user,
        hoa_member: e.hoa_member,
        role: "admin",
        invited_by: userId,
      });
    }
  }

  if (payload.length) {
    await directus.request(createItems("hoa_channel_members", payload));
  }

  return { channels: channelIds.length, created: payload.length };
});
