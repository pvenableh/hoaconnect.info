/**
 * The caller's standing read once per request (core/server/utils/
 * access-snapshot.ts): each helper's old rule, applied to the snapshot's rows,
 * and how the base and full snapshots share their reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessSnapshot,
  activeBoardMemberFrom,
  batchWithAccessSnapshot,
  batchWithAccessSnapshotBySlug,
  adminFrom,
  boardPositionFrom,
  boardSeatActorFrom,
  helperAreasFrom,
  isTeamLeadFrom,
  managerGrantsFrom,
  membershipFrom,
  type AccessSnapshot,
} from "#core/server/utils/access-snapshot";

const ROLES = { hoaAdmin: "role-admin", propertyManager: "role-pm" };
const TODAY = "2026-11-25";
const NOW = new Date("2026-11-25T12:00:00Z");

const term = (title: string, over: Record<string, unknown> = {}) => ({ title, status: "published", term_start: "2026-01-01", term_end: null, sort: null, ...over });
const membership = (over: Record<string, unknown> = {}) => ({ id: "m-1", status: "active", role: null, manager_permissions: null, board_member_terms: [], ...over });
const snap = (over: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  userId: "u-1",
  orgId: "org-1",
  mine: [membership()],
  teams: [],
  restrictions: [],
  areaGrants: [],
  ...over,
});

describe("admin and membership", () => {
  it("an HOA Admin on an active or pending membership is an admin; on an inactive one, not", () => {
    expect(adminFrom(snap({ mine: [membership({ role: "role-admin" })] }), ROLES)).toMatchObject({ isAdmin: true, isHoaAdmin: true, memberId: "m-1" });
    expect(adminFrom(snap({ mine: [membership({ role: { id: "role-admin" }, status: "pending" })] }), ROLES).isAdmin).toBe(true);
    expect(adminFrom(snap({ mine: [membership({ role: "role-admin", status: "inactive" })] }), ROLES)).toEqual({
      isAdmin: false,
      isAppAdmin: false,
      isHoaAdmin: false,
      userId: "u-1",
    });
    expect(adminFrom(snap(), ROLES)).toMatchObject({ isAdmin: false, memberId: "m-1" });
  });

  it("a member is an active membership; pending is not", () => {
    expect(membershipFrom(snap({ mine: [membership({ role: "role-x" })] }))).toEqual({ isMember: true, memberId: "m-1", memberRole: "role-x" });
    expect(membershipFrom(snap({ mine: [membership({ status: "pending" })] }))).toEqual({ isMember: false });
    expect(membershipFrom(snap({ mine: [] }))).toEqual({ isMember: false });
  });
});

describe("board office", () => {
  it("a current published term, first by sort with nulls last; never an ended, future or draft one", () => {
    const mine = [
      membership({
        board_member_terms: [
          term("president", { term_end: "2026-11-24" }),
          term("secretary", { term_start: "2026-11-26" }),
          term("vice_president", { status: "draft" }),
          term("director", { sort: null }),
          term("treasurer", { sort: 2 }),
        ],
      }),
    ];
    expect(boardPositionFrom(snap({ mine }), TODAY)).toBe("treasurer");
    expect(boardSeatActorFrom(snap({ mine }), TODAY)).toBe("board_treasurer");
  });

  it("an office counts only on an active membership", () => {
    const mine = [membership({ status: "inactive", board_member_terms: [term("president")] })];
    expect(boardPositionFrom(snap({ mine }), TODAY)).toBeNull();
    expect(boardSeatActorFrom(snap({ mine }), TODAY)).toBeNull();
  });
});

describe("active board member (isActiveBoardMember's rule)", () => {
  const seated = (...terms: any[]) => snap({ mine: [membership({ board_member_terms: terms })] });

  it("a published term that has started and not ended, on an active membership", () => {
    expect(activeBoardMemberFrom(seated(term("president")), NOW)).toBe(true);
    expect(activeBoardMemberFrom(seated(term("president", { term_start: null, term_end: "2026-12-31" })), NOW)).toBe(true);
    expect(activeBoardMemberFrom(seated(term("president", { term_start: TODAY })), NOW)).toBe(true);
    expect(activeBoardMemberFrom(snap(), NOW)).toBe(false);
  });

  it("not a future, ended, unpublished or inactive one", () => {
    expect(activeBoardMemberFrom(seated(term("president", { term_start: "2026-11-26" })), NOW)).toBe(false);
    expect(activeBoardMemberFrom(seated(term("president", { term_end: "2026-11-24" })), NOW)).toBe(false);
    expect(activeBoardMemberFrom(seated(term("president", { status: "draft" })), NOW)).toBe(false);
    const inactive = snap({ mine: [membership({ status: "inactive", board_member_terms: [term("president")] })] });
    expect(activeBoardMemberFrom(inactive, NOW)).toBe(false);
  });

  it("reads a term as over on its last day, as the timestamp comparison it replaces does", () => {
    expect(activeBoardMemberFrom(seated(term("president", { term_end: TODAY })), NOW)).toBe(false);
  });

  it("any active membership's term counts, not just the first", () => {
    const mine = [membership({ id: "m-1" }), membership({ id: "m-2", board_member_terms: [term("treasurer")] })];
    expect(activeBoardMemberFrom(snap({ mine }), NOW)).toBe(true);
  });
});

describe("manager grants and team lead", () => {
  it("an active Property Manager membership's grants, {} when unset; otherwise null", () => {
    expect(managerGrantsFrom(snap({ mine: [membership({ role: "role-pm", manager_permissions: { projects: true } })] }), ROLES)).toEqual({ projects: true });
    expect(managerGrantsFrom(snap({ mine: [membership({ role: "role-pm" })] }), ROLES)).toEqual({});
    expect(managerGrantsFrom(snap({ mine: [membership({ role: "role-pm", status: "pending" })] }), ROLES)).toBeNull();
    expect(managerGrantsFrom(snap({ mine: [membership({ role: "role-pm" })] }), { hoaAdmin: "role-admin" })).toBeNull();
  });

  it("leads a team when any of their team rows is a lead's", () => {
    expect(isTeamLeadFrom(snap({ teams: [{ role: "member" }, { role: "lead" }] }))).toBe(true);
    expect(isTeamLeadFrom(snap({ teams: [{ role: "member" }] }))).toBe(false);
  });
});

describe("helper areas", () => {
  const grant = (over: Record<string, unknown>) => ({ id: "g", organization: "org-1", area: "projects", member: null, team: null, starts_at: "2026-11-01T00:00:00Z", ends_at: null, ...over });
  const team = (id: string, over: Record<string, unknown> = {}) => ({ role: "member", team: { id, status: "active", organization: "org-1", ...over } });

  it("their own grants and their active teams' grants in this community", () => {
    const s = snap({
      teams: [team("t-1"), team("t-old", { status: "archived" }), team("t-other", { organization: "org-2" })],
      areaGrants: [
        grant({ id: "g1", member: "m-1", area: "projects" }),
        grant({ id: "g2", team: "t-1", area: "documents" }),
        grant({ id: "g3", team: "t-old", area: "feedback" }),
        grant({ id: "g4", team: "t-other", area: "responsibilities" }),
        grant({ id: "g5", member: "m-other", area: "responsibilities" }),
        grant({ id: "g6", member: "m-1", area: "feedback", ends_at: "2026-11-24T00:00:00Z" }),
      ],
    });
    // An archived team, another community's team, someone else's grant and an ended grant give nothing.
    expect(helperAreasFrom(s, NOW)).toEqual(["documents", "projects"]);
  });

  it("none while restricted, and none without an active membership", () => {
    const areaGrants = [grant({ member: "m-1" })];
    expect(helperAreasFrom(snap({ areaGrants, restrictions: [{ member: "m-1", starts_at: "2026-11-01T00:00:00Z", ends_at: null, lifted_at: null }] }), NOW)).toEqual([]);
    expect(helperAreasFrom(snap({ areaGrants, mine: [membership({ status: "pending" })] }), NOW)).toEqual([]);
  });
});

describe("one read per request", () => {
  let calls: string[][];
  let batches: Record<string, any>[];
  let fail: boolean;
  const rows = { mine: [membership({ role: "role-admin" })], teams: [{ role: "lead" }], restrictions: [], areaGrants: [] };

  beforeEach(() => {
    calls = [];
    batches = [];
    fail = false;
    vi.stubGlobal("getUserSession", async () => ({ user: { id: "u-1" } }));
    vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
      calls.push(Object.keys(specs));
      batches.push(specs);
      if (fail) throw new Error("directus down");
      return Object.fromEntries(Object.keys(specs).map((k) => [k, (rows as any)[k]]));
    });
  });

  it("the base reads only the memberships, and the full snapshot then reads only the rest", async () => {
    const event = { context: {} } as any;
    const base = await accessSnapshot(event, "org-1", "base");
    expect(base?.mine).toHaveLength(1);
    const full = await accessSnapshot(event, "org-1");
    expect(full).toMatchObject({ mine: rows.mine, teams: rows.teams });
    expect(calls).toEqual([["mine"], ["teams", "restrictions", "areaGrants"]]);
    // Only the caller's own rows, in this community.
    expect(batches[0]!.mine.filter).toEqual({ user: { _eq: "u-1" }, organization: { _eq: "org-1" } });
    expect(batches[1]!.teams.filter).toEqual({ user: { _eq: "u-1" }, organization: { _eq: "org-1" } });
  });

  it("asked for in full first, one read serves the base too, however many ask", async () => {
    const event = { context: {} } as any;
    const full = accessSnapshot(event, "org-1");
    const [b1, b2, f2] = await Promise.all([accessSnapshot(event, "org-1", "base"), accessSnapshot(event, "org-1", "base"), accessSnapshot(event, "org-1")]);
    expect(await full).toBe(f2);
    expect(b1).toBe(b2);
    expect(b1?.mine).toEqual(rows.mine);
    expect(calls).toEqual([["mine", "teams", "restrictions", "areaGrants"]]);
  });

  it("each request and each community reads its own", async () => {
    await accessSnapshot({ context: {} } as any, "org-1", "base");
    await accessSnapshot({ context: {} } as any, "org-1", "base");
    const event = { context: {} } as any;
    await accessSnapshot(event, "org-1", "base");
    await accessSnapshot(event, "org-2", "base");
    expect(calls).toHaveLength(4);
  });

  it("a failed read is null, so the helpers read one by one as before", async () => {
    fail = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await accessSnapshot({ context: {} } as any, "org-1")).toBeNull();
    expect(await accessSnapshot({ context: {} } as any, "org-1", "base")).toBeNull();
  });

  it("no session or no community: no read", async () => {
    vi.stubGlobal("getUserSession", async () => ({}));
    expect(await accessSnapshot({ context: {} } as any, "org-1")).toBeNull();
    vi.stubGlobal("getUserSession", async () => ({ user: { id: "u-1" } }));
    expect(await accessSnapshot({ context: {} } as any, "")).toBeNull();
    expect(calls).toEqual([]);
  });

  describe("batchWithAccessSnapshot", () => {
    const pages = { collection: "pages", fields: ["id"] };
    const answer = (specs: Record<string, any>) =>
      Object.fromEntries(Object.keys(specs).map((k) => [k, k === "pages" ? [{ id: "p1" }] : (rows as any)[k.replace(/^access_/, "")]]));

    beforeEach(() => {
      vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
        calls.push(Object.keys(specs));
        batches.push(specs);
        if (fail) throw new Error("directus down");
        return answer(specs);
      });
    });

    it("reads the route's rows and the full standing in one request, and the helpers then read nothing", async () => {
      const event = { context: {} } as any;
      const out = await batchWithAccessSnapshot(event, "org-1", { pages });
      expect(out).toEqual({ pages: [{ id: "p1" }] });
      expect(calls).toEqual([["pages", "access_mine", "access_teams", "access_restrictions", "access_areaGrants"]]);
      expect(batches[0]!.access_mine.filter).toEqual({ user: { _eq: "u-1" }, organization: { _eq: "org-1" } });

      const full = await accessSnapshot(event, "org-1");
      expect(full).toMatchObject({ userId: "u-1", orgId: "org-1", mine: rows.mine, teams: rows.teams });
      expect((await accessSnapshot(event, "org-1", "base"))?.mine).toEqual(rows.mine);
      expect(calls).toHaveLength(1);
    });

    it("\"base\" reads only the memberships with the route's rows; a full question then reads the rest", async () => {
      const event = { context: {} } as any;
      const out = await batchWithAccessSnapshot(event, "org-1", { pages }, "base");
      expect(out).toEqual({ pages: [{ id: "p1" }] });
      expect(calls).toEqual([["pages", "access_mine"]]);
      expect((await accessSnapshot(event, "org-1", "base"))?.mine).toEqual(rows.mine);
      expect(calls).toHaveLength(1);

      const full = await accessSnapshot(event, "org-1");
      expect(full).toMatchObject({ mine: rows.mine, teams: rows.teams });
      expect(calls).toEqual([["pages", "access_mine"], ["teams", "restrictions", "areaGrants"]]);
    });

    it("with the standing already read, or no session, reads only the route's rows", async () => {
      const event = { context: {} } as any;
      await accessSnapshot(event, "org-1", "base");
      await batchWithAccessSnapshot(event, "org-1", { pages });
      vi.stubGlobal("getUserSession", async () => ({}));
      await batchWithAccessSnapshot({ context: {} } as any, "org-1", { pages });
      expect(calls).toEqual([["mine"], ["pages"], ["pages"]]);
    });

    it("a failed batch throws and leaves the standing unread", async () => {
      const event = { context: {} } as any;
      fail = true;
      await expect(batchWithAccessSnapshot(event, "org-1", { pages })).rejects.toThrow("directus down");
      fail = false;
      expect((await accessSnapshot(event, "org-1"))?.mine).toEqual(rows.mine);
    });

    it("refuses a route key that could collide with the standing's", async () => {
      await expect(batchWithAccessSnapshot({ context: {} } as any, "org-1", { access_mine: pages })).rejects.toThrow(/reserved/);
      expect(calls).toEqual([]);
    });
  });

  describe("batchWithAccessSnapshotBySlug", () => {
    const pagesFor = (org: Record<string, unknown>) => ({ pages: { collection: "pages", fields: ["id"], filter: { organization: org } } });
    let orgRows: any[];

    beforeEach(() => {
      orgRows = [{ id: "org-1" }];
      vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
        calls.push(Object.keys(specs));
        batches.push(specs);
        if (fail) throw new Error("directus down");
        return Object.fromEntries(
          Object.keys(specs).map((k) => [
            k,
            k === "pages" ? [{ id: "p1" }] : k === "access_org" ? orgRows : (rows as any)[k.replace(/^access_/, "")],
          ])
        );
      });
    });

    it("reads the slug, the route's rows and the full standing in one request, all by slug", async () => {
      const event = { context: {} } as any;
      const out = await batchWithAccessSnapshotBySlug(event, "demo", pagesFor);
      expect(out).toEqual({ orgId: "org-1", rows: { pages: [{ id: "p1" }] } });
      expect(calls).toEqual([["pages", "access_org", "access_mine", "access_teams", "access_restrictions", "access_areaGrants"]]);
      const bySlug = { slug: { _eq: "demo" } };
      expect(batches[0]!.access_org).toEqual({ collection: "hoa_organizations", filter: bySlug, fields: ["id"], limit: 2 });
      expect(batches[0]!.pages.filter).toEqual({ organization: bySlug });
      expect(batches[0]!.access_mine.filter).toEqual({ user: { _eq: "u-1" }, organization: bySlug });
      expect(batches[0]!.access_restrictions.filter._and[0]).toEqual({ member: { user: { _eq: "u-1" }, organization: bySlug } });

      // The standing is cached under the community's id.
      expect(await accessSnapshot(event, "org-1")).toMatchObject({ orgId: "org-1", mine: rows.mine, teams: rows.teams });
      expect(calls).toHaveLength(1);
    });

    it("an unknown slug is no community, as resolveOrgId answers", async () => {
      orgRows = [];
      expect(await batchWithAccessSnapshotBySlug({ context: {} } as any, "nope", pagesFor)).toEqual({ orgId: "", rows: { pages: [] } });
    });

    it("a shared slug, no session or a failed batch hands back to the route, caching nothing", async () => {
      const event = { context: {} } as any;
      orgRows = [{ id: "org-1" }, { id: "org-2" }];
      expect(await batchWithAccessSnapshotBySlug(event, "demo", pagesFor)).toBeNull();
      fail = true;
      expect(await batchWithAccessSnapshotBySlug(event, "demo", pagesFor)).toBeNull();
      fail = false;
      vi.stubGlobal("getUserSession", async () => ({}));
      expect(await batchWithAccessSnapshotBySlug({ context: {} } as any, "demo", pagesFor)).toBeNull();
      expect(calls).toHaveLength(2);
      expect(event.context.__accessSnapshot?.size ?? 0).toBe(0);
    });
  });
});
