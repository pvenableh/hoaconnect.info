/**
 * Which channels a user may read — the flat id list, for the surfaces that need
 * a scope rather than the per-channel detail `channel-unread.ts` computes.
 *
 * This exists because search moved to the server. Client-side search ran on the
 * caller's own Directus token, so the membership-scoped read policy did the
 * scoping for free; the moment a route asks with the admin token, that
 * protection is gone and the route has to reproduce it deliberately. Getting
 * this wrong would let any member grep every private channel in the community,
 * so the rule is written once, here, and both callers use it.
 *
 * Two sources, matching the two read paths the Directus policies grant:
 *   1. an `hoa_channel_members` row — the member policy's whole basis;
 *   2. every non-private channel of an org the caller administers or sits on
 *      the board of — the admin policy's org scope.
 */

import { readItems } from "@directus/sdk";

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

export type OrgWideAccessCheck = (orgId: string) => boolean | Promise<boolean>;

export async function readableChannelIds(opts: {
  directus: ReturnType<typeof getTypedDirectus>;
  userId: string;
  /** Restrict to one org; omitted means every org the caller belongs to. */
  organizationId?: string | null;
  hasOrgWideAccess?: OrgWideAccessCheck;
}): Promise<string[]> {
  const { directus, userId } = opts;
  const hasOrgWideAccess = opts.hasOrgWideAccess ?? (() => false);

  const memberRows = (await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, status: { _eq: "active" } },
      fields: ["organization"],
      limit: -1,
    })
  )) as unknown as Array<{ organization: any }>;

  let orgIds = [...new Set(memberRows.map((r) => idOf(r.organization)).filter(Boolean))] as string[];
  if (opts.organizationId) {
    orgIds = orgIds.filter((o) => o === opts.organizationId);
  }
  if (!orgIds.length) return [];

  const ids = new Set<string>();

  const memberships = (await directus.request(
    readItems("hoa_channel_members", {
      filter: { user: { _eq: userId } },
      fields: [{ channel: ["id", "status", "organization"] }],
      limit: -1,
    })
  )) as unknown as Array<{ channel: any }>;

  for (const m of memberships) {
    const ch = m.channel;
    if (!ch || typeof ch !== "object" || !ch.id) continue;
    if (ch.status === "deleted") continue;
    const org = idOf(ch.organization);
    if (org && orgIds.includes(org)) ids.add(ch.id);
  }

  const orgWideOrgs: string[] = [];
  for (const org of orgIds) {
    if (await hasOrgWideAccess(org)) orgWideOrgs.push(org);
  }

  if (orgWideOrgs.length) {
    const orgChannels = (await directus.request(
      readItems("hoa_channels", {
        filter: {
          _and: [
            { organization: { _in: orgWideOrgs } },
            { is_private: { _neq: true } },
            { status: { _neq: "deleted" } },
          ],
        } as never,
        fields: ["id"],
        limit: -1,
      })
    )) as unknown as Array<{ id: string }>;
    for (const c of orgChannels) if (c?.id) ids.add(c.id);
  }

  return [...ids];
}
