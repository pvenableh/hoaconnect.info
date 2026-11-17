/**
 * Delegation to members — the pure model (docs/spec-delegation.md).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HELPER_AREA_KEYS,
  NON_HELPER_GRANT_KEYS,
  helperAreasFor,
  holdsAt,
  isHelperArea,
  openAreasOf,
  planGrantChange,
  type AreaGrantRow,
} from "#core/shared/roles/area-grants";
import { AREAS, MANAGER_GRANT_KEYS } from "#core/shared/transition/grants";
import { buildCommitteeMemberEntry, buildHelperGrantEntry } from "#core/shared/ledger/entries";
import { defaultVisibilityFor } from "#core/shared/ledger/events";

const ORG = "org-a";
const T0 = "2026-11-17T12:00:00.000Z";
const before = "2026-11-17T11:59:59.999Z";
const later = "2026-11-18T09:00:00.000Z";

const row = (over: Partial<AreaGrantRow> = {}): AreaGrantRow => ({
  id: "g-1",
  organization: ORG,
  area: "projects",
  member: "m-1",
  team: null,
  starts_at: T0,
  ends_at: null,
  ...over,
});

describe("which areas a helper can hold", () => {
  it("is exactly the four server-only areas", () => {
    expect([...HELPER_AREA_KEYS]).toEqual(["documents", "feedback", "projects", "responsibilities"]);
  });

  it("every helper area is grantable and gated by a server file, never a page", () => {
    for (const k of HELPER_AREA_KEYS) {
      expect(MANAGER_GRANT_KEYS, k).toContain(k);
      const gate = AREAS.find((a) => a.key === k)!.gate!;
      expect(gate.endsWith(".vue"), `${k} gate ${gate}`).toBe(false);
      expect(existsSync(join(process.cwd(), gate)), gate).toBe(true);
      expect(readFileSync(join(process.cwd(), gate), "utf8")).toContain(k);
    }
  });

  it("the six areas that read Directus with the user's token, or are not a neighbour's, are absent", () => {
    for (const k of ["inquiries", "violations", "directory", "communications", "activity", "contact_platform"]) {
      expect(isHelperArea(k), k).toBe(false);
    }
    expect([...NON_HELPER_GRANT_KEYS].sort()).toEqual(
      ["activity", "communications", "contact_platform", "directory", "inquiries", "violations"]
    );
    expect(isHelperArea("vendors")).toBe(false);
    expect(isHelperArea(undefined)).toBe(false);
  });
});

describe("holdsAt", () => {
  it("starts inclusive, ends exclusive", () => {
    expect(holdsAt(row(), T0)).toBe(true);
    expect(holdsAt(row(), before)).toBe(false);
    expect(holdsAt(row({ ends_at: later }), later)).toBe(false);
    expect(holdsAt(row({ ends_at: later }), "2026-11-18T08:59:59.000Z")).toBe(true);
  });

  it("a row opened and ended the same instant never holds; a row with no start never holds", () => {
    expect(holdsAt(row({ ends_at: T0 }), T0)).toBe(false);
    expect(holdsAt(row({ starts_at: null }), later)).toBe(false);
  });
});

describe("helperAreasFor", () => {
  const read = (rows: AreaGrantRow[], teamIds: string[] = [], memberId: string | null = "m-1") =>
    helperAreasFor({ orgId: ORG, memberId, teamIds, rows, now: later });

  it("reads the member's own rows and their teams' rows, in helper order", () => {
    expect(
      read(
        [row({ area: "responsibilities" }), row({ id: "g-2", member: null, team: "t-1", area: "documents" })],
        ["t-1"]
      )
    ).toEqual(["documents", "responsibilities"]);
  });

  it("ignores ended and future rows", () => {
    expect(read([row({ ends_at: "2026-11-17T18:00:00.000Z" })])).toEqual([]);
    expect(read([row({ starts_at: "2026-12-01T00:00:00.000Z" })])).toEqual([]);
  });

  it("ignores a team the person is not on, another member, another org", () => {
    expect(read([row({ member: null, team: "t-2" })], ["t-1"])).toEqual([]);
    expect(read([row({ member: "m-2" })])).toEqual([]);
    expect(read([row({ organization: "org-b" })])).toEqual([]);
    expect(read([row({ organization: { id: "org-b" } })])).toEqual([]);
  });

  it("ignores a non-helper area and a row with two holders or none", () => {
    expect(read([row({ area: "inquiries" }), row({ area: "communications" })])).toEqual([]);
    expect(read([row({ team: "t-1" })], ["t-1"])).toEqual([]);
    expect(read([row({ member: null })])).toEqual([]);
  });

  it("no membership id reads only team rows", () => {
    expect(read([row(), row({ id: "g-2", member: null, team: "t-1", area: "feedback" })], ["t-1"], null)).toEqual(["feedback"]);
  });
});

describe("planGrantChange", () => {
  const now = new Date(later);
  const base = { orgId: ORG, holder: { kind: "member" as const, id: "m-1" }, holderName: "Obie Hoffman", area: "projects" as const, actorId: "u-admin", now };

  it("on with nothing open opens a row from now, by the actor", () => {
    expect(planGrantChange({ ...base, rows: [], value: true })).toEqual({
      kind: "open",
      row: { organization: ORG, area: "projects", member: "m-1", team: null, starts_at: later, granted_by: "u-admin" },
    });
  });

  it("a committee row names the team, not a member", () => {
    const plan = planGrantChange({ ...base, holder: { kind: "team", id: "t-1" }, rows: [], value: true });
    expect(plan).toMatchObject({ kind: "open", row: { member: null, team: "t-1" } });
  });

  it("off with a row open ends it now, freezing the name; nothing is deleted", () => {
    expect(planGrantChange({ ...base, rows: [row()], value: false })).toEqual({
      kind: "end",
      id: "g-1",
      patch: { ends_at: later, ended_by: "u-admin", end_reason: "revoked", holder_name: "Obie Hoffman" },
    });
  });

  it("is a no-op both ways", () => {
    expect(planGrantChange({ ...base, rows: [row()], value: true })).toEqual({ kind: "none" });
    expect(planGrantChange({ ...base, rows: [], value: false })).toEqual({ kind: "none" });
    expect(planGrantChange({ ...base, rows: [row({ ends_at: T0 })], value: false })).toEqual({ kind: "none" });
  });

  it("openAreasOf lists what a holder has open", () => {
    expect(openAreasOf([row(), row({ id: "g-2", area: "feedback" })], { kind: "member", id: "m-1" }, now)).toEqual(["feedback", "projects"]);
  });
});

describe("ledger entries", () => {
  const actor = { userId: "u-admin", name: "Oscar Hoffman", email: null };

  it("a helper grant names the holder and the area, owner-visible", () => {
    const on = buildHelperGrantEntry({
      organizationId: ORG, organizationName: "1033 Lenox",
      holder: { kind: "member", id: "m-1", name: "Obie Hoffman" },
      area: "projects", on: true, resultingAreas: ["projects"], actor, occurredAt: later,
    });
    expect(on.summary).toBe("Obie Hoffman can now work on Projects.");
    expect(on.event_type).toBe("helper_grant_changed");
    expect(on.visibility).toBe(defaultVisibilityFor("helper_grant_changed"));
    expect(on.visibility).toBe("owners");
    const off = buildHelperGrantEntry({
      organizationId: ORG, organizationName: null,
      holder: { kind: "team", id: "t-1", name: "Landscaping" },
      area: "responsibilities", on: false, resultingAreas: [], actor, occurredAt: later,
    });
    expect(off.summary).toBe("The Landscaping committee no longer works on Responsibilities register.");
    expect(off.payload).toMatchObject({ change: "ended", resulting_areas: [] });
  });

  it("a committee membership change says which areas came with it", () => {
    const base = {
      organizationId: ORG, organizationName: null, team: { id: "t-1", name: "Landscaping" },
      member: { memberId: "m-2", name: "Tester Two" }, actor, occurredAt: later,
    };
    expect(buildCommitteeMemberEntry({ ...base, change: "joined", role: "member", areas: ["projects", "responsibilities"] }).summary)
      .toBe("Tester Two joined the Landscaping committee (Projects and Responsibilities register).");
    expect(buildCommitteeMemberEntry({ ...base, change: "joined", role: "lead", areas: [] }).summary)
      .toBe("Tester Two joined the Landscaping committee as its lead.");
    expect(buildCommitteeMemberEntry({ ...base, change: "left", role: "member", areas: ["projects"] }).summary)
      .toBe("Tester Two left the Landscaping committee (Projects).");
    expect(buildCommitteeMemberEntry({ ...base, change: "role", role: "lead", areas: [] }).summary)
      .toBe("Tester Two became the lead of the Landscaping committee.");
    expect(buildCommitteeMemberEntry({ ...base, change: "role", role: "member", areas: [] }).event_type).toBe("committee_member_changed");
  });
});
