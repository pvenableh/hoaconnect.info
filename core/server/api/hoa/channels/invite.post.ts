import { readItems, createItem } from "@directus/sdk";

/**
 * Invite a user into a single channel (Phase 8, Track C).
 *
 * Creates a hoa_channel_members row, which is what makes the channel visible to
 * that user under the membership-scoped read policy. Authorized for org admins,
 * active board members, or a channel admin. Idempotent — returns the existing
 * membership if the user is already in the channel. The invitee must be an
 * active member of the channel's community (and `hoa_member`, when given, that
 * person's row there).
 *
 * Body: { channel, user, hoa_member?, role? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { channel, user, hoa_member, role } = body || {};

  if (!channel || !user) {
    throw createError({ statusCode: 400, message: "channel and user are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  const orgId = await requireChannelManager(event, directus, userId, channel);
  await refuseIfDirectMessage(directus, channel);

  // The invitee must belong to the channel's community. Managing a channel is
  // not a licence to pull an arbitrary user (or another community's member row)
  // into it — the write below is on the admin client, so this is the only fence.
  const memberships = (await directus.request(
    readItems("hoa_members", {
      filter: {
        user: { _eq: user },
        organization: { _eq: orgId },
        status: { _eq: "active" },
      },
      fields: ["id"],
      limit: -1,
    })
  )) as any[];
  if (!memberships?.length) {
    throw createError({
      statusCode: 403,
      message: "That person is not an active member of this community",
    });
  }
  if (hoa_member && !memberships.some((m) => m.id === hoa_member)) {
    throw createError({
      statusCode: 403,
      message: "hoa_member does not belong to that person in this community",
    });
  }

  // Already a member? Return it (idempotent).
  const existing = await directus.request(
    readItems("hoa_channel_members", {
      filter: { channel: { _eq: channel }, user: { _eq: user } },
      fields: ["id"],
      limit: 1,
    })
  );
  if ((existing as any[]).length) {
    return { member: existing[0], created: false };
  }

  const member = await directus.request(
    createItem("hoa_channel_members", {
      channel,
      user,
      hoa_member: hoa_member ?? null,
      role: role === "admin" ? "admin" : "member",
      invited_by: userId,
    })
  );

  return { member, created: true };
});
