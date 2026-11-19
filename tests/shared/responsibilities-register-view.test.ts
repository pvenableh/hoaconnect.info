import { describe, it, expect } from "vitest";
import {
  REGISTER_GROUPS,
  isHeldRow,
  ownersWouldSeeUnassigned,
  publishedHolder,
  publishedSearchText,
  registerSearchText,
  targetFromPick,
  unassignedSinceText,
  whoLine,
} from "#core/shared/responsibilities/register-view";
import { CATEGORY_KEYS } from "#core/shared/responsibilities/config";
import type { HolderView, PublishedRow, RegisterRow } from "#core/shared/responsibilities/views";

const holder = (over: Partial<HolderView>): HolderView => ({
  id: "h",
  kind: "member",
  ref: "m1",
  name: "Ann Lee",
  role: "owner",
  start_date: "2026-01-01",
  end_date: null,
  notes: null,
  ...over,
});

const job = (over: Partial<RegisterRow> & { holders?: HolderView[]; assignees?: HolderView[] }): RegisterRow =>
  ({
    id: "j",
    title: "Reconciles bank statements",
    category: "finance",
    cadence: "monthly",
    basis: "unknown",
    status: "active",
    member_visible: true,
    holders: [],
    assignees: [],
    ...over,
  }) as unknown as RegisterRow;

const treasurer = holder({
  id: "o1",
  kind: "office",
  ref: "treasurer",
  name: "Treasurer",
  people: [{ termId: "t1", memberId: "m9", name: "Bo Chan" }],
});
const vacantOffice = holder({ id: "o2", kind: "office", ref: "secretary", name: "Secretary", people: [], vacant: true });
const vendor = holder({ id: "v1", kind: "vendor", ref: "v1", name: "Acme Elevator", role: "performs" });

describe("REGISTER_GROUPS", () => {
  it("is the five categories, in the register's order", () => {
    expect(REGISTER_GROUPS.map((g) => g.key)).toEqual(CATEGORY_KEYS);
    expect(REGISTER_GROUPS.every((g) => g.label.length > 0)).toBe(true);
  });
});

describe("ownersWouldSeeUnassigned", () => {
  const TODAY = "2026-11-16";
  const held = [holder({ start_date: "2026-01-01", end_date: null })];
  const ended = [holder({ start_date: "2026-01-01", end_date: "2026-10-31" })];
  const future = [holder({ start_date: "2027-01-01", end_date: null })];

  it("counts live, member-visible jobs with nobody holding them today", () => {
    const rows = [
      job({ assignees: held }), // held
      job({ assignees: ended }), // ended: unassigned
      job({ assignees: [] }), // never held
      job({ assignees: future }), // starts later
    ];
    expect(ownersWouldSeeUnassigned(rows, TODAY)).toBe(3);
  });
  it("leaves out retired jobs and jobs hidden from members", () => {
    const rows = [job({ status: "retired" }), job({ member_visible: false }), job({ member_visible: null as unknown as boolean })];
    expect(ownersWouldSeeUnassigned(rows, TODAY)).toBe(1);
  });
  it("reads today, not the as-of date the rows were loaded for", () => {
    // Loaded as of a date when the job was held: its `holders` say held, its history says it ended.
    const row = job({ holders: held, assignees: ended });
    expect(ownersWouldSeeUnassigned([row], TODAY)).toBe(1);
  });
  it("an empty register counts nothing", () => expect(ownersWouldSeeUnassigned([], TODAY)).toBe(0));
});

describe("search and the who line", () => {
  const row = job({ title: "Pest control", category: "building", cadence: "monthly", basis: "contract", basis_reference: "Orkin 2026", holders: [treasurer, vendor] });
  it("search reads the title, section, cadence, basis and who", () => {
    const hay = registerSearchText(row).filter(Boolean).join(" ").toLowerCase();
    for (const word of ["pest control", "building", "monthly", "contract", "orkin", "bo chan", "acme elevator"]) {
      expect(hay, word).toContain(word);
    }
  });
  it("the who line names offices with their person and non-owner roles", () => {
    expect(whoLine(row)).toBe("Treasurer (Bo Chan), Acme Elevator (performs)");
    expect(whoLine(job({ holders: [] }))).toBe("");
    expect(whoLine(job({ holders: [vacantOffice] }))).toBe("Secretary (vacant)");
  });
});

describe("targetFromPick", () => {
  it("each kind becomes the one column the route takes", () => {
    expect(targetFromPick({ kind: "office", value: "treasurer" })).toEqual({ office: "treasurer" });
    expect(targetFromPick({ kind: "member", value: "m1" })).toEqual({ member: "m1" });
    expect(targetFromPick({ kind: "vendor", value: "v1" })).toEqual({ vendor: "v1" });
    expect(targetFromPick({ kind: "team", value: "t1" })).toEqual({ team: "t1" });
    expect(targetFromPick({ kind: "label", value: "  City of Miami Beach " })).toEqual({ label: "City of Miami Beach" });
  });
  it("nothing picked is no target", () => {
    expect(targetFromPick({ kind: "none", value: "m1" })).toBeNull();
    expect(targetFromPick({ kind: "member", value: "" })).toBeNull();
    expect(targetFromPick({ kind: "label", value: "   " })).toBeNull();
  });
});

describe("the owners' view", () => {
  it("an office holder carries the people who hold it; a vacant one says so", () => {
    const held = publishedHolder({ kind: "office", name: "Treasurer", role: "owner", people: ["Ann Lee"] }, 0);
    expect(held).toMatchObject({ kind: "office", name: "Treasurer", people: [{ name: "Ann Lee" }] });
    expect(held.vacant).toBe(false);
    const vacant = publishedHolder({ kind: "office", name: "Secretary", role: "owner", people: [] }, 1);
    expect(vacant.vacant).toBe(true);
    expect(vacant.people).toEqual([]);
  });
  it("anyone else is a name and a role, and no more", () => {
    const v = publishedHolder({ kind: "vendor", name: "Acme Elevator", role: "performs" }, 2);
    expect(v).toMatchObject({ kind: "vendor", name: "Acme Elevator", role: "performs" });
    expect(v.people).toBeUndefined();
    expect(v.notes).toBeNull();
    expect(v.start_date).toBeNull();
  });
  it("each holder of one job has its own key", () => {
    const a = publishedHolder({ kind: "label", name: "Nobody", role: "owner" }, 0);
    const b = publishedHolder({ kind: "label", name: "Nobody", role: "backup" }, 1);
    expect(a.id).not.toBe(b.id);
  });
  it("tells a held row from an unassigned one", () => {
    const held: PublishedRow = { id: "1", title: "Pest control", category: "building", cadence: "monthly", lastVerified: null, who: [] };
    const gap: PublishedRow = { id: "2", title: "Deposits", category: "finance", unassignedSince: "2026-10-12" };
    expect(isHeldRow(held)).toBe(true);
    expect(isHeldRow(gap)).toBe(false);
  });
  it("search finds a job by its title, section, holder and the person in an office", () => {
    const held: PublishedRow = {
      id: "1",
      title: "Pest control",
      category: "building",
      cadence: "monthly",
      lastVerified: null,
      who: [{ kind: "office", name: "Treasurer", role: "owner", people: ["Ann Lee"] }],
    };
    const hay = publishedSearchText(held).join(" ").toLowerCase();
    for (const w of ["pest control", "building", "treasurer", "ann lee", "monthly"]) expect(hay, w).toContain(w);
  });
  it("an unassigned job reads its date as an owner would say it", () => {
    expect(unassignedSinceText("2026-10-12")).toBe("12 October 2026");
    expect(unassignedSinceText("2026-01-05T00:00:00.000Z")).toBe("5 January 2026");
  });
});
