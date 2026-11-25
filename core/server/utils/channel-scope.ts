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
import type { BatchSpec } from "./directus-graphql";
import { unreadMemberSpecs } from "./channel-unread";

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

/**
 * Which of the caller's orgs they can read every non-private channel in — i.e.
 * where bucket 2 applies. Injected rather than imported so the tests can pin the
 * boundary without standing up admin-auth's session plumbing. (channel-unread
 * has its own, `UnreadOrgWideCheck`, which is also handed the membership rows;
 * a second export of this name would collide in Nitro's server-utils
 * auto-import.)
 */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org-wide check over the caller's `hoa_members` rows in that org (any status, the access snapshot's fields, sorted by id). */
export type SearchOrgWideCheck = (orgId: string, memberRows: any[]) => boolean | Promise<boolean>;

/** A batch reader: `readItemsBatch`, or a stand-in in tests. */
export type ScopeBatchReader = (specs: Record<string, BatchSpec>) => Promise<Record<string, any[]>>;

/** readableChannelIds' org-wide read: the non-private, live channels of the given orgs. */
const orgChannelsFilter = (scope: Record<string, unknown>) => ({
  _and: [scope, { is_private: { _neq: true } }, { status: { _neq: "deleted" } }],
});

/**
 * Search's scope reads as one batch: the caller's memberships and channel
 * rows (as channel-unread reads them) and, ahead of knowing whether the
 * caller reads org-wide, the channels that answer would add: the community's
 * non-private live channels, or the one channel searched within. Only an id
 * a channel can have is read by: anything else matches no channel, and
 * Directus would refuse the filter.
 */
export function searchScopeSpecs(
  userId: string,
  opts: { organizationId?: string | null; channelId?: string | null }
): Record<string, BatchSpec> {
  const specs: Record<string, BatchSpec> = { ...unreadMemberSpecs(userId) };
  if (opts.organizationId) {
    if (UUID.test(opts.organizationId)) {
      specs.channels = {
        collection: "hoa_channels",
        filter: orgChannelsFilter({ organization: { _in: [opts.organizationId] } }),
        fields: ["id"],
        limit: -1,
      };
    }
  } else if (opts.channelId && UUID.test(opts.channelId)) {
    specs.channels = {
      collection: "hoa_channels",
      filter: orgChannelsFilter({ id: { _eq: opts.channelId } }),
      fields: ["id", "organization"],
      limit: -1,
    };
  }
  return specs;
}

/**
 * readableChannelIds, narrowed to `channelId` as search narrows it, in one
 * request (two when neither a community nor a channel is named and the caller
 * reads org-wide somewhere). The same rule: a live channel row in one of the
 * caller's active communities, or a non-private live channel of a community
 * where hasOrgWideAccess holds, which it answers from the rows already read.
 */
export async function searchableChannelIds(opts: {
  userId: string;
  organizationId?: string | null;
  channelId?: string | null;
  hasOrgWideAccess: SearchOrgWideCheck;
  /** Defaults to `readItemsBatch`. */
  read?: ScopeBatchReader;
}): Promise<string[]> {
  const { userId, organizationId = null, channelId = null } = opts;
  const read: ScopeBatchReader = opts.read ?? ((specs) => readItemsBatch(specs));

  const specs = searchScopeSpecs(userId, { organizationId, channelId });
  const first = await read(specs);
  const members = first.members ?? [];
  let orgIds = [
    ...new Set(members.filter((r) => r?.status === "active").map((r) => idOf(r.organization)).filter(Boolean)),
  ] as string[];
  if (organizationId) orgIds = orgIds.filter((o) => o === organizationId);
  if (!orgIds.length) return [];

  const ids = new Set<string>();
  for (const m of first.cursors ?? []) {
    const ch = m?.channel;
    if (!ch || typeof ch !== "object" || !ch.id) continue;
    if (ch.status === "deleted") continue;
    const org = idOf(ch.organization);
    if (org && orgIds.includes(org)) ids.add(ch.id);
  }

  const orgWideOrgs: string[] = [];
  for (const org of orgIds) {
    if (await opts.hasOrgWideAccess(org, members.filter((r) => idOf(r.organization) === org))) orgWideOrgs.push(org);
  }

  if (orgWideOrgs.length) {
    let orgChannels: any[];
    if (specs.channels && organizationId) {
      // The named community's channels; orgWideOrgs can only be that community.
      orgChannels = first.channels ?? [];
    } else if (specs.channels) {
      // The one channel searched within, when its community is read org-wide.
      orgChannels = (first.channels ?? []).filter((c) => orgWideOrgs.includes(idOf(c.organization) ?? ""));
    } else if (channelId || organizationId) {
      // Not an id any channel or community has: no org-wide channel can match it.
      orgChannels = [];
    } else {
      const r = await read({
        channels: {
          collection: "hoa_channels",
          filter: orgChannelsFilter({ organization: { _in: orgWideOrgs } }),
          fields: ["id"],
          limit: -1,
        },
      });
      orgChannels = r.channels ?? [];
    }
    for (const c of orgChannels) if (c?.id) ids.add(c.id);
  }

  const all = [...ids];
  return channelId ? all.filter((id) => id === channelId) : all;
}
