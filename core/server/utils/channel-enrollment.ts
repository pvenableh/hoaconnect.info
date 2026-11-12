// server/utils/channel-enrollment.ts
//
// Channels are an internal admin/board comms tool. Because board membership is
// NOT a Directus role (it's app-derived from active hoa_board_members terms) and
// realtime enforces the subscriber's own row permissions, "board sees all
// channels" is implemented as REAL membership rows (hoa_channel_members),
// auto-created when a (non-private) channel is created and back-filled when a new
// board member is seated. These helpers compute who should be enrolled.

import { readItems, readItem } from "@directus/sdk";

export interface ChannelEnrollee {
  user: string;
  hoa_member: string | null;
}

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

/**
 * The users who should be auto-enrolled into a non-private channel for an org:
 * all active HOA Admins + all active board members. Deduped by user id; the
 * value is the user's hoa_member id (for the channel_members.hoa_member link).
 */
export async function getOrgChannelEnrollees(
  directus: ReturnType<typeof getTypedDirectus>,
  orgId: string
): Promise<ChannelEnrollee[]> {
  const config = useRuntimeConfig();
  const nowIso = new Date().toISOString();
  const map = new Map<string, string | null>();

  // HOA Admins of the org.
  const admins = await directus.request(
    readItems("hoa_members", {
      filter: {
        organization: { _eq: orgId },
        role: { _eq: config.public.directusRoleHoaAdmin },
        status: { _eq: "active" },
      },
      fields: ["id", "user"],
      limit: -1,
    })
  );
  for (const m of admins as any[]) {
    const u = idOf(m.user);
    if (u) map.set(u, m.id);
  }

  // Active board members (published term, current date inside the term window).
  // hoa_board_members has no org column — it links via hoa_member → organization.
  // The member row must itself be active: removing someone from the community
  // (transition-execute's deactivate_member) does not end their board term.
  const boardTerms = await directus.request(
    readItems("hoa_board_members", {
      filter: {
        status: { _eq: "published" },
        hoa_member: { organization: { _eq: orgId }, status: { _eq: "active" } },
        _or: [{ term_start: { _null: true } }, { term_start: { _lte: nowIso } as any }],
      },
      fields: ["id", "term_end", { hoa_member: ["id", "user"] }],
      limit: -1,
    })
  );
  for (const t of boardTerms as any[]) {
    if (t.term_end && t.term_end < nowIso) continue; // term expired
    const hm = t.hoa_member;
    const u = idOf(hm?.user);
    const hmId = idOf(hm);
    if (u && !map.has(u)) map.set(u, hmId);
  }

  return Array.from(map.entries()).map(([user, hoa_member]) => ({ user, hoa_member }));
}

/** Resolve a channel's organization id (null if the channel doesn't exist). */
export async function getChannelOrg(
  directus: ReturnType<typeof getTypedDirectus>,
  channelId: string
): Promise<string | null> {
  try {
    const ch: any = await directus.request(
      readItem("hoa_channels", channelId, { fields: ["id", "organization"] })
    );
    return idOf(ch?.organization);
  } catch {
    return null;
  }
}

/**
 * Can this user manage membership of a channel? True for org admins, active
 * board members, or a user enrolled in the channel with role `admin` who is
 * still an active member of the channel's org. Returns the channel's org id
 * when allowed, else throws 403/404.
 */
export async function requireChannelManager(
  event: any,
  directus: ReturnType<typeof getTypedDirectus>,
  userId: string,
  channelId: string
): Promise<string> {
  const orgId = await getChannelOrg(directus, channelId);
  if (!orgId) throw createError({ statusCode: 404, message: "Channel not found" });

  const admin = await checkAdminAccess(event, orgId);
  if (admin.isAdmin) return orgId;
  if (await isActiveBoardMember(directus, userId, orgId)) return orgId;

  const mine = await directus.request(
    readItems("hoa_channel_members", {
      filter: { channel: { _eq: channelId }, user: { _eq: userId }, role: { _eq: "admin" } },
      fields: ["id"],
      limit: 1,
    })
  );
  // A channel-admin row outlives removal from the community, so it counts only
  // while the user still has an active membership in the channel's org.
  if ((mine as any[]).length && (await activeMemberIds(directus, userId, orgId)).length) {
    return orgId;
  }

  throw createError({ statusCode: 403, message: "Not allowed to manage this channel" });
}

/**
 * The user's ACTIVE hoa_members ids in an org. An inactive or archived row is
 * someone removed from the community, and grants nothing (as `checkMembership`).
 */
async function activeMemberIds(
  directus: ReturnType<typeof getTypedDirectus>,
  userId: string,
  orgId: string
): Promise<string[]> {
  const members = await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: ["id"],
      limit: -1,
    })
  );
  return (members as any[]).map((m) => m.id);
}

/**
 * Is the user an active board member of the org? (Used to authorize channel
 * creation for board members, who aren't admins.) Requires an active member
 * row as well as a current term: removing a member does not end their term.
 */
export async function isActiveBoardMember(
  directus: ReturnType<typeof getTypedDirectus>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const ids = await activeMemberIds(directus, userId, orgId);
  if (!ids.length) return false;

  const terms = await directus.request(
    readItems("hoa_board_members", {
      filter: {
        status: { _eq: "published" },
        hoa_member: { _in: ids },
        _or: [{ term_start: { _null: true } }, { term_start: { _lte: nowIso } }],
      },
      fields: ["id", "term_end"],
      limit: -1,
    })
  );
  return (terms as any[]).some((t) => !t.term_end || t.term_end >= nowIso);
}

/**
 * A direct message's roster is its two people, fixed when it is created
 * (`/api/hoa/channels/dm`). Membership routes call this so nobody — including
 * an org admin — can add a third party to, or strip a person from, a DM.
 * Tolerates `is_dm` not being migrated yet (no DMs can exist then).
 */
export async function refuseIfDirectMessage(
  directus: ReturnType<typeof getTypedDirectus>,
  channelId: string
): Promise<void> {
  let isDm = false;
  try {
    const ch: any = await directus.request(
      readItem("hoa_channels", channelId, { fields: ["id", "is_dm"] as any })
    );
    isDm = ch?.is_dm === true;
  } catch {
    return;
  }
  if (isDm) {
    throw createError({
      statusCode: 403,
      message: "A direct message's members can't be changed",
    });
  }
}
