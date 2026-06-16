import { createItem, createItems } from "@directus/sdk";

/**
 * Elevated channel creation (Phase 8, Track A).
 *
 * Creating a channel also auto-enrolls the org's admins + active board members
 * as hoa_channel_members (role `admin`) — this is how board members get to see
 * "all" channels while keeping realtime working (realtime enforces the
 * subscriber's own row permissions, so access must be a real membership row, not
 * an elevated read route). PRIVATE channels skip the auto-enroll: only the
 * creator and any explicitly invited users are added.
 *
 * Authorized for org admins OR active board members.
 *
 * Body: { organization, name, slug, description?, is_private?, is_default?,
 *         request?, invite_users?: string[] }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const {
    organization,
    name,
    slug,
    description,
    is_private,
    is_default,
    request,
    invite_users,
  } = body || {};

  if (!organization || !name || !slug) {
    throw createError({
      statusCode: 400,
      message: "organization, name and slug are required",
    });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  // Authorize: org admin OR active board member.
  const admin = await checkAdminAccess(event, organization);
  const canCreate =
    admin.isAdmin || (await isActiveBoardMember(directus, userId, organization));
  if (!canCreate) {
    throw createError({
      statusCode: 403,
      message: "Admin or board access required to create a channel",
    });
  }

  // Create the channel.
  const channel: any = await directus.request(
    createItem("hoa_channels", {
      name,
      slug,
      description: description ?? null,
      is_private: !!is_private,
      is_default: !!is_default,
      organization,
      status: "published",
      ...(request ? { request } : {}),
    })
  );

  // Build the enrollment set. user id → { hoa_member, role }.
  const rows = new Map<string, { hoa_member: string | null; role: "admin" | "member" }>();

  if (!is_private) {
    const enrollees = await getOrgChannelEnrollees(directus, organization);
    for (const e of enrollees) {
      rows.set(e.user, { hoa_member: e.hoa_member, role: "admin" });
    }
  }

  // Always enroll the creator (as admin). Don't downgrade if already present.
  if (!rows.has(userId)) {
    rows.set(userId, { hoa_member: admin.memberId ?? null, role: "admin" });
  }

  // Explicitly invited users (e.g. a ticket author) join as members.
  if (Array.isArray(invite_users)) {
    for (const u of invite_users) {
      if (typeof u === "string" && u && !rows.has(u)) {
        rows.set(u, { hoa_member: null, role: "member" });
      }
    }
  }

  const memberPayload = Array.from(rows.entries()).map(([user, v]) => ({
    channel: channel.id,
    user,
    hoa_member: v.hoa_member,
    role: v.role,
    invited_by: userId,
  }));

  if (memberPayload.length) {
    await directus.request(createItems("hoa_channel_members", memberPayload));
  }

  return { channel, enrolled: memberPayload.length };
});
