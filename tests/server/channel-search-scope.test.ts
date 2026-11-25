/**
 * Search's scope in one batch (`searchableChannelIds`): the same rule as
 * `readableChannelIds` (channel-scope.test.ts), read as the caller's
 * memberships, channel rows and the channels org-wide access would add, all
 * at once. These pin the batch's shape and the rule's edges over its rows.
 */
import { describe, it, expect, vi } from "vitest";
import { searchScopeSpecs, searchableChannelIds } from "#core/server/utils/channel-scope";

vi.mock("@directus/sdk", () => ({ readItems: () => ({}) }));

const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CH = "33333333-3333-4333-8333-333333333333";
const ME = "user-me";

type Rows = { members?: any[]; cursors?: any[]; channels?: any[] };

function reader(rows: Rows, later: any[] = []) {
  const calls: Array<Record<string, any>> = [];
  const read = async (specs: Record<string, any>) => {
    calls.push(specs);
    if (calls.length > 1) return { channels: later };
    return Object.fromEntries(Object.keys(specs).map((k) => [k, (rows as any)[k] ?? []]));
  };
  return { read, calls };
}

const member = (org: string, status = "active") => ({ organization: org, status, id: `m-${org}` });
const row = (id: string, org: string, status = "published") => ({ channel: { id, organization: org, status } });

describe("searchScopeSpecs", () => {
  it("reads the community's non-private live channels with the caller's rows", () => {
    const s = searchScopeSpecs(ME, { organizationId: HOME });
    expect(Object.keys(s)).toEqual(["members", "cursors", "channels"]);
    expect((s.channels as any).filter).toEqual({
      _and: [{ organization: { _in: [HOME] } }, { is_private: { _neq: true } }, { status: { _neq: "deleted" } }],
    });
  });

  it("reads the one channel searched within when no community is named", () => {
    const s = searchScopeSpecs(ME, { channelId: CH });
    expect((s.channels as any).filter._and[0]).toEqual({ id: { _eq: CH } });
    expect((s.channels as any).fields).toEqual(["id", "organization"]);
  });

  it("reads no channel by an id no channel can have", () => {
    expect(searchScopeSpecs(ME, { organizationId: "nope" }).channels).toBeUndefined();
    expect(searchScopeSpecs(ME, { channelId: "nope" }).channels).toBeUndefined();
  });
});

describe("searchableChannelIds", () => {
  it("is one request for a named community", async () => {
    const { read, calls } = reader({ members: [member(HOME)], cursors: [row("mine", HOME)], channels: [{ id: "pub" }] });
    expect(await searchableChannelIds({ userId: ME, organizationId: HOME, hasOrgWideAccess: () => true, read })).toEqual(["mine", "pub"]);
    expect(calls).toHaveLength(1);
  });

  it("gives a caller without org-wide access only their own live rows in that community", async () => {
    const { read } = reader({
      members: [member(HOME), member(OTHER)],
      cursors: [row("mine", HOME), row("gone", HOME, "deleted"), row("theirs", OTHER)],
      channels: [{ id: "pub" }],
    });
    expect(await searchableChannelIds({ userId: ME, organizationId: HOME, hasOrgWideAccess: () => false, read })).toEqual(["mine"]);
  });

  it("hands the access check the caller's rows in that community, any status", async () => {
    const seen: any[] = [];
    const rows = [member(HOME), { ...member(HOME, "pending"), id: "p" }, member(OTHER)];
    const { read } = reader({ members: rows });
    await searchableChannelIds({ userId: ME, organizationId: HOME, hasOrgWideAccess: (o, m) => (seen.push([o, m]), false), read });
    expect(seen).toEqual([[HOME, rows.slice(0, 2)]]);
  });

  it("returns nothing for a community the caller is not active in", async () => {
    const { read } = reader({ members: [member(HOME, "inactive")], cursors: [row("mine", HOME)], channels: [{ id: "pub" }] });
    expect(await searchableChannelIds({ userId: ME, organizationId: HOME, hasOrgWideAccess: () => true, read })).toEqual([]);
  });

  it("keeps a searched channel only where its community is read org-wide", async () => {
    const rows = { members: [member(HOME), member(OTHER)], channels: [{ id: CH, organization: OTHER }] };
    const check = (o: string) => o === HOME;
    expect(await searchableChannelIds({ userId: ME, channelId: CH, hasOrgWideAccess: check, read: reader(rows).read })).toEqual([]);
    expect(await searchableChannelIds({ userId: ME, channelId: CH, hasOrgWideAccess: () => true, read: reader(rows).read })).toEqual([CH]);
  });

  it("narrows to the searched channel, never widens", async () => {
    const { read } = reader({ members: [member(HOME)], cursors: [row("mine", HOME)] });
    expect(await searchableChannelIds({ userId: ME, channelId: "not-a-uuid", hasOrgWideAccess: () => true, read })).toEqual([]);
  });

  it("reads the org-wide channels second when neither a community nor a channel is named", async () => {
    const { read, calls } = reader({ members: [member(HOME), member(OTHER)], cursors: [row("mine", HOME)] }, [{ id: "pub" }]);
    expect(await searchableChannelIds({ userId: ME, hasOrgWideAccess: (o) => o === OTHER, read })).toEqual(["mine", "pub"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.channels.filter._and[0]).toEqual({ organization: { _in: [OTHER] } });
  });
});
