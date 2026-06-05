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
  const boardTerms = await directus.request(
    readItems("hoa_board_members", {
      filter: {
        status: { _eq: "published" },
        hoa_member: { organization: { _eq: orgId } },
        _or: [{ term_start: { _null: true } }, { term_start: { _lte: nowIso } }],
      },
      fields: ["id", "term_end", "hoa_member.id", "hoa_member.user"],
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
 * board members, or a user enrolled in the channel with role `admin`. Returns
 * the channel's org id when allowed, else throws 403/404.
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
  if ((mine as any[]).length) return orgId;

  throw createError({ statusCode: 403, message: "Not allowed to manage this channel" });
}

/**
 * Is the user an active board member of the org? (Used to authorize channel
 * creation for board members, who aren't admins.)
 */
export async function isActiveBoardMember(
  directus: ReturnType<typeof getTypedDirectus>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const members = await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId } },
      fields: ["id"],
      limit: -1,
    })
  );
  const ids = (members as any[]).map((m) => m.id);
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
