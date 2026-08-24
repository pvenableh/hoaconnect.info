/**
 * Message search used to run in the browser, on the caller's own Directus
 * token, so the membership-scoped read policy did the scoping and the query did
 * not have to. Moving it to the server spends the ADMIN token instead — which
 * means the protection that was previously free now has to be written down, and
 * if it is written down wrong every member can grep every private channel in
 * the community.
 *
 * `readableChannelIds` is that written-down rule, and these are its edges:
 * a membership row is the member policy's whole basis; org-wide access is the
 * admin/board policy's; and neither may reach across communities. The search
 * route then fences its query to the returned ids, so anything missing here is
 * unsearchable rather than merely unlinked.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; query?: any };

let ops: Op[];
let memberships: Array<{ organization: string }>;
let channelMembers: Array<{ channel: { id: string; status?: string; organization: string } }>;
let channels: Array<{ id: string; organization: string; is_private?: boolean; status?: string }>;

beforeEach(() => {
  vi.resetModules();
  ops = [];
  memberships = [{ organization: HOME }];
  channelMembers = [];
  channels = [];
});

const directus = {
  request: async (desc: Op) => {
    ops.push(desc);
    if (desc.collection === "hoa_members") return memberships;
    if (desc.collection === "hoa_channel_members") return channelMembers;
    if (desc.collection === "hoa_channels") {
      const and: any[] = desc.query?.filter?._and ?? [];
      return channels.filter((c) => {
        for (const clause of and) {
          if (clause.organization?._in && !clause.organization._in.includes(c.organization)) return false;
          if (clause.is_private?._neq !== undefined && (c.is_private ?? false) === clause.is_private._neq)
            return false;
          if (clause.status?._neq !== undefined && (c.status ?? "published") === clause.status._neq)
            return false;
        }
        return true;
      });
    }
    return [];
  },
} as any;

const load = async () => (await import("#core/server/utils/channel-scope")).readableChannelIds;

const run = (opts: Partial<Parameters<Awaited<ReturnType<typeof load>>>[0]> = {}) =>
  load().then((fn) => fn({ directus, userId: ME, ...opts } as any));

describe("readableChannelIds", () => {
  it("includes channels the caller has a membership row for", async () => {
    channelMembers = [{ channel: { id: "c1", organization: HOME } }];
    expect(await run()).toEqual(["c1"]);
  });

  it("excludes a private channel the caller is not a member of, even for an admin", async () => {
    channels = [
      { id: "public", organization: HOME, is_private: false },
      { id: "private", organization: HOME, is_private: true },
    ];
    const ids = await run({ hasOrgWideAccess: () => true });
    expect(ids).toEqual(["public"]);
  });

  it("includes a private channel once the caller IS a member of it", async () => {
    channels = [{ id: "private", organization: HOME, is_private: true }];
    channelMembers = [{ channel: { id: "private", organization: HOME } }];
    expect(await run({ hasOrgWideAccess: () => true })).toEqual(["private"]);
  });

  it("gives a plain member nothing beyond their own rows", async () => {
    channels = [{ id: "public", organization: HOME, is_private: false }];
    expect(await run()).toEqual([]);
  });

  it("never crosses into another community", async () => {
    channelMembers = [
      { channel: { id: "theirs", organization: OTHER } },
      { channel: { id: "mine", organization: HOME } },
    ];
    channels = [{ id: "their-public", organization: OTHER, is_private: false }];
    expect(await run({ hasOrgWideAccess: () => true })).toEqual(["mine"]);
  });

  it("honours an explicit organization narrowing", async () => {
    memberships = [{ organization: HOME }, { organization: OTHER }];
    channelMembers = [
      { channel: { id: "home-c", organization: HOME } },
      { channel: { id: "other-c", organization: OTHER } },
    ];
    expect(await run({ organizationId: OTHER, hasOrgWideAccess: () => true })).toEqual(["other-c"]);
  });

  it("returns nothing — and asks nothing — for a caller with no active membership", async () => {
    memberships = [];
    channelMembers = [{ channel: { id: "c1", organization: HOME } }];
    expect(await run({ hasOrgWideAccess: () => true })).toEqual([]);
    expect(ops.some((o) => o.collection === "hoa_channel_members")).toBe(false);
  });

  it("drops a deleted channel the caller still has a row for", async () => {
    channelMembers = [{ channel: { id: "gone", organization: HOME, status: "deleted" } }];
    expect(await run()).toEqual([]);
  });

  it("deduplicates a channel reachable both ways", async () => {
    channels = [{ id: "both", organization: HOME, is_private: false }];
    channelMembers = [{ channel: { id: "both", organization: HOME } }];
    expect(await run({ hasOrgWideAccess: () => true })).toEqual(["both"]);
  });
});
