/**
 * The caller's standing read once per request (core/server/utils/
 * access-snapshot.ts): each helper's old rule, applied to the snapshot's rows,
 * and how the base and full snapshots share their reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessSnapshot,
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
});
