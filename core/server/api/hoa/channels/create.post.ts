import { readItems, createItem, createItems } from "@directus/sdk";

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

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
 * Authorized for org admins OR active board members. Everything the body names
 * must belong to that same community — the linked `request` / `project`, and
 * every `invite_users` entry (an active hoa_members row there) — and is checked
 * before anything is written: the writes are on the admin client, so being an
 * admin of community A must not let you link B's ticket or enroll B's people.
 *
 * Body: { organization, name, slug, description?, is_private?, is_default?,
 *         request?, project?, invite_users?: string[] }
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
    project,
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

  // Linked records must be this community's own.
  for (const [collection, id] of [
    ["hoa_requests", request],
    ["hoa_projects", project],
  ] as const) {
    if (!id) continue;
    const rows = (await directus.request(
      readItems(collection, {
        filter: { id: { _eq: id } },
        fields: ["id", "organization"],
        limit: 1,
      } as never)
    )) as any[];
    if (idOf(rows?.[0]?.organization) !== organization) {
      throw createError({
        statusCode: 403,
        message: `That ${collection === "hoa_requests" ? "request" : "project"} is not in this community`,
      });
    }
  }

  // Invitees must be active members of this community. (The creator is enrolled
  // regardless, on the authorization above.)
  const invitees = Array.isArray(invite_users)
    ? [...new Set(invite_users.filter((u: unknown): u is string => typeof u === "string" && !!u))].filter(
        (u) => u !== userId
      )
    : [];
  if (invitees.length) {
    const active = (await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _in: invitees },
          organization: { _eq: organization },
          status: { _eq: "active" },
        },
        fields: ["user"],
        limit: -1,
      })
    )) as any[];
    const ok = new Set(active.map((m) => idOf(m.user)).filter(Boolean));
    if (invitees.some((u) => !ok.has(u))) {
      throw createError({
        statusCode: 403,
        message: "Everyone invited must be an active member of this community",
      });
    }
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
      ...(project ? { project } : {}),
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
  for (const u of invitees) {
    if (!rows.has(u)) rows.set(u, { hoa_member: null, role: "member" });
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
