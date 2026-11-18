/**
 * The responsibilities map's pure core (core/shared/responsibilities/map.ts,
 * plan §3.4 "Map view"): who holds what on any day from one read, the model,
 * what lights up, the slider's snap days, and what changed between two days.
 */
import { describe, it, expect } from "vitest";
import {
  changeAnnouncement,
  changeDays,
  changedJobs,
  holdersOnDay,
  lit,
  longDay,
  mapModel,
  publishedMapRows,
} from "#core/shared/responsibilities/map";
import {
  emptyNames,
  publishedRows,
  registerRows,
  type NameBook,
  type StoredAssignee,
  type StoredResponsibility,
  type TermWithName,
} from "#core/shared/responsibilities/views";

// ── A small community ────────────────────────────────────────────────────────
//
// Treasurer: Ann from 2026-01-01, resigns 2026-06-30; vacant July; Bo from
// 2026-08-01. Two directors (Cy from 2026-02-01, Di from 2026-03-01).
// A draft term for the Secretary, which never counts.

const names: NameBook = {
  ...emptyNames(),
  members: { "m-ann": { name: "Ann Lee" }, "m-bo": { name: "Bo Chen" }, "m-ed": { name: "Ed Ruiz" } },
  vendors: { "v-cpa": { name: "Ledger CPA" }, "v-elev": { name: "Lift Co" } },
  teams: { "t-green": { name: "Garden team", color: "#3a7" } },
};

const terms: TermWithName[] = [
  { id: "tm-ann", title: "treasurer", status: "published", term_start: "2026-01-01", term_end: "2026-06-30", hoa_member: "m-ann", member_name: "Ann Lee", end_reason: "resigned" },
  { id: "tm-bo", title: "treasurer", status: "published", term_start: "2026-08-01", term_end: null, hoa_member: "m-bo", member_name: "Bo Chen" },
  { id: "tm-cy", title: "director", status: "published", term_start: "2026-02-01", term_end: null, hoa_member: "m-cy", member_name: null, holder_name: "Cy Old" },
  { id: "tm-di", title: "director", status: "published", term_start: "2026-03-01", term_end: null, hoa_member: "m-di", member_name: "Di Park" },
  { id: "tm-sec", title: "secretary", status: "draft", term_start: "2026-01-01", term_end: null, hoa_member: "m-ed", member_name: "Ed Ruiz" },
];

const job = (id: string, title: string, category: string, extra: Partial<StoredResponsibility> = {}): StoredResponsibility => ({
  id,
  title,
  category,
  cadence: "monthly",
  basis: "bylaws",
  notes: "a private note",
  status: "active",
  member_visible: true,
  date_created: "2025-12-01T10:00:00Z",
  ...extra,
});

const jobs: StoredResponsibility[] = [
  job("j-bank", "Reconcile the bank statements", "finance"),
  job("j-audit", "Annual audit", "finance"),
  job("j-elev", "Elevator contract", "mechanical_safety"),
  job("j-garden", "Landscaping", "building"),
  job("j-minutes", "Keep the minutes", "compliance_records"),
  job("j-welcome", "Welcome new owners", "community"),
  job("j-old", "Old job", "community", { status: "retired" }),
  job("j-new", "Entered later", "building", { date_created: "2026-09-15T08:00:00Z" }),
];

let n = 0;
const row = (responsibility: string, target: Partial<StoredAssignee>, start: string, end: string | null = null, role = "owner", extra: Partial<StoredAssignee> = {}): StoredAssignee => ({
  id: `a-${++n}`,
  responsibility,
  role,
  start_date: start,
  end_date: end,
  ...target,
  ...extra,
});

const assignees: StoredAssignee[] = [
  // The Treasurer's job across a resignation and a vacant month; a CPA backs it up.
  row("j-bank", { office: "treasurer" }, "2026-01-01"),
  row("j-bank", { vendor: "v-cpa" }, "2026-04-01", null, "backup"),
  // Ann did the audit by name, then handed it to the CPA on 2026-05-01.
  row("j-audit", { member: "m-ann" }, "2026-01-01", "2026-04-30", "owner", { holder_name: "Ann Lee" }),
  row("j-audit", { vendor: "v-cpa" }, "2026-05-01"),
  // The elevator: Lift Co until it ended, then nobody.
  row("j-elev", { vendor: "v-elev" }, "2026-01-01", "2026-09-30", "owner", { holder_name: "Lift Co" }),
  // Landscaping: the garden team, with the directors as oversight.
  row("j-garden", { team: "t-green" }, "2026-01-01"),
  row("j-garden", { office: "director" }, "2026-01-01", null, "oversight"),
  // Minutes: the Secretary (only a draft term: always vacant).
  row("j-minutes", { office: "secretary" }, "2026-01-01"),
  // Welcome: a typed name, and Ann by name.
  row("j-welcome", { label: "Welcome committee" }, "2026-02-01"),
  row("j-welcome", { member: "m-ann" }, "2026-02-01", null, "performs"),
  // The retired job's rows never show.
  row("j-old", { member: "m-bo" }, "2026-01-01", "2026-03-31", "owner", { holder_name: "Bo Chen" }),
];

const TODAY = "2026-11-18";
const rowsAsOf = (d: string) => registerRows(jobs, assignees, names, terms, d, TODAY);
const loaded = rowsAsOf(TODAY);

describe("holdersOnDay", () => {
  const days = [
    "2025-12-31", // before anything
    "2026-01-01", // first day
    "2026-02-15", // one director
    "2026-03-01", // two directors
    "2026-04-30", // Ann's last day on the audit
    "2026-05-01", // the CPA's first
    "2026-06-30", // Ann's last day as Treasurer
    "2026-07-15", // Treasurer vacant
    "2026-08-01", // Bo's first day
    "2026-09-30", // Lift Co's last day
    "2026-10-01", // nobody on the elevator
    TODAY,
  ];

  it.each(days)("on %s equals the route's holders for that day (from a read for another day)", (d) => {
    const truth = rowsAsOf(d);
    for (const r of loaded) {
      const want = truth.find((t) => t.id === r.id)!.holders;
      expect(holdersOnDay(r, d), `${r.id} on ${d}`).toEqual(want);
    }
  });

  it("reads an office's person from the terms inside the row: Ann, vacant, Bo", () => {
    const bank = loaded.find((r) => r.id === "j-bank")!;
    const treasurer = (d: string) => holdersOnDay(bank, d).find((h) => h.kind === "office")!;
    expect(treasurer("2026-06-30").people!.map((p) => p.name)).toEqual(["Ann Lee"]);
    expect(treasurer("2026-07-15")).toMatchObject({ people: [], vacant: true });
    expect(treasurer("2026-08-01").people!.map((p) => p.name)).toEqual(["Bo Chen"]);
  });

  it("does not count a draft term", () => {
    const minutes = loaded.find((r) => r.id === "j-minutes")!;
    expect(holdersOnDay(minutes, TODAY)[0]).toMatchObject({ vacant: true, people: [] });
  });

  it("orders owner, performs, backup, oversight", () => {
    const welcome = loaded.find((r) => r.id === "j-welcome")!;
    expect(holdersOnDay(welcome, TODAY).map((h) => h.role)).toEqual(["owner", "performs"]);
    const bank = loaded.find((r) => r.id === "j-bank")!;
    expect(holdersOnDay(bank, TODAY).map((h) => h.role)).toEqual(["owner", "backup"]);
  });
});

describe("mapModel", () => {
  it("lays out holders, the attention groups and the five categories", () => {
    const m = mapModel(loaded, TODAY);
    expect(m.day).toBe(TODAY);
    expect(m.holders.map((h) => [h.key, h.jobCount])).toEqual([
      ["office:treasurer", 1],
      ["office:director", 1],
      ["member:m-ann", 1],
      ["vendor:v-cpa", 2],
      ["team:t-green", 1],
      ["label:Welcome committee", 1],
    ]);
    expect(m.holders[0]).toMatchObject({ label: "Treasurer", vacant: false, people: [{ name: "Bo Chen", memberId: "m-bo" }] });
    expect(m.holders[1]!.people.map((p) => p.name)).toEqual(["Cy Old", "Di Park"]);
    expect(m.vacant.map((h) => [h.key, h.label, h.jobCount])).toEqual([["office:secretary", "Secretary", 1]]);
    expect(m.unassigned.map((j) => [j.id, j.unassignedSince])).toEqual([
      ["j-new", "2026-09-15"],
      ["j-elev", "2026-10-01"],
    ]);
    expect(m.groups.map((g) => [g.key, g.jobs.map((j) => j.id)])).toEqual([
      ["finance", ["j-audit", "j-bank"]],
      ["building", ["j-garden"]],
      ["mechanical_safety", []],
      ["compliance_records", ["j-minutes"]],
      ["community", ["j-welcome"]],
    ]);
  });

  it("leaves retired jobs out, with their holders", () => {
    const m = mapModel(loaded, "2026-02-01");
    const ids = [...m.unassigned, ...m.groups.flatMap((g) => g.jobs)].map((j) => j.id);
    expect(ids).not.toContain("j-old");
    expect(m.holders.map((h) => h.key)).not.toContain("member:m-bo");
  });

  it("leaves out a job not yet entered that nobody held then", () => {
    const ids = (d: string) => mapModel(loaded, d).unassigned.map((j) => j.id);
    expect(ids("2026-09-14")).not.toContain("j-new");
    expect(ids("2026-09-15")).toContain("j-new");
  });

  it("keeps a job whose history began before it was entered, gaps included", () => {
    // Lift Co held the elevator from 2026-01-01 to 2026-09-30; the job was entered 2025-12-01.
    // A job entered later than its history: the same job, entered 2026-11-01.
    const late = loaded.map((r) => (r.id === "j-elev" ? { ...r, date_created: "2026-11-01T00:00:00Z" } : r));
    expect(mapModel(late, "2026-10-15").unassigned.map((j) => [j.id, j.unassignedSince])).toContainEqual(["j-elev", "2026-10-01"]);
    expect(mapModel(late, "2025-12-31").unassigned.map((j) => j.id)).not.toContain("j-elev");
    expect(mapModel(late, "2026-01-01").groups.find((g) => g.key === "mechanical_safety")!.jobs.map((j) => j.id)).toEqual(["j-elev"]);
  });

  it("puts a vacant office in the attention group for that day only", () => {
    expect(mapModel(loaded, "2026-07-15").vacant.map((h) => h.key)).toEqual(["office:secretary", "office:treasurer"]);
    expect(mapModel(loaded, "2026-08-01").vacant.map((h) => h.key)).toEqual(["office:secretary"]);
  });

  it("counts a member's jobs through an office they hold", () => {
    // On 2026-05-01 Ann is Treasurer and performs the welcome job by name.
    const m = mapModel(loaded, "2026-05-01");
    expect(m.holders.find((h) => h.key === "member:m-ann")!.jobCount).toBe(2);
  });

  it("is empty for an empty register", () => {
    const m = mapModel([], TODAY);
    expect(m.holders).toEqual([]);
    expect(m.vacant).toEqual([]);
    expect(m.unassigned).toEqual([]);
    expect(m.groups.every((g) => !g.jobs.length)).toBe(true);
  });
});

describe("the owners' map", () => {
  const sent = publishedRows(jobs, assignees, names, terms, TODAY, true);
  const m = mapModel(publishedMapRows(sent), "1999-01-01");

  it("draws the day the route sent, whatever day it is asked for", () => {
    expect(m.holders.find((h) => h.key === "office:Treasurer")!.people.map((p) => p.name)).toEqual(["Bo Chen"]);
    expect(m.unassigned.map((j) => j.id).sort()).toEqual(["j-elev", "j-new"]);
  });

  it("carries nothing the route did not send", () => {
    const text = JSON.stringify(m);
    for (const word of ["bylaws", "private note", "monthly", "m-bo", "m-ann", "Lift Co", "Old job", "disputed", "2026-01-01"]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("shows unassigned jobs only when the route returned them", () => {
    const hidden = mapModel(publishedMapRows(publishedRows(jobs, assignees, names, terms, TODAY, false)), TODAY);
    expect(hidden.unassigned).toEqual([]);
    expect(hidden.groups.flatMap((g) => g.jobs).length).toBe(5);
  });

  it("has no snap days: there is no history to move through", () => {
    expect(changeDays(publishedMapRows(sent))).toEqual([]);
  });
});

describe("lit", () => {
  const m = mapModel(loaded, TODAY);

  it("lights a holder's jobs", () => {
    expect(lit(m, { holder: "vendor:v-cpa" })!.jobs).toEqual(["j-audit", "j-bank"]);
    expect(lit(m, { holder: "office:secretary" })!.jobs).toEqual(["j-minutes"]);
  });

  it("lights a member's jobs held through an office", () => {
    const may = mapModel(loaded, "2026-05-01");
    expect(lit(may, { holder: "member:m-ann" })!.jobs.sort()).toEqual(["j-bank", "j-welcome"]);
  });

  it("lights a job's holders by role", () => {
    expect(lit(m, { job: "j-bank" })).toEqual({
      jobs: ["j-bank"],
      holders: [
        { key: "office:treasurer", role: "owner" },
        { key: "vendor:v-cpa", role: "backup" },
      ],
    });
    expect(lit(m, { job: "j-garden" })!.holders).toEqual([
      { key: "team:t-green", role: "owner" },
      { key: "office:director", role: "oversight" },
    ]);
  });

  it("lights nothing for no pick, or a pick not on the map that day", () => {
    expect(lit(m, null)).toBeNull();
    expect(lit(m, { holder: "vendor:v-elev" })).toBeNull();
    expect(lit(m, { job: "j-old" })).toBeNull();
  });
});

describe("changeDays", () => {
  it("lists every day the map can change, sorted and once each", () => {
    expect(changeDays(loaded)).toEqual([
      "2025-12-01", // jobs entered
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-07-01", // the day after Ann's term ends
      "2026-08-01",
      "2026-09-15", // a job entered
      "2026-10-01", // the day after Lift Co's row ends
    ]);
  });

  it("leaves out retired jobs' days", () => {
    // j-old's row ended 2026-03-31; 2026-04-01 is there only for the CPA's backup row.
    const without = changeDays(loaded.filter((r) => r.id !== "j-bank"));
    expect(without).not.toContain("2026-04-01");
  });
});

describe("changedJobs", () => {
  const at = (d: string) => mapModel(loaded, d);

  it("finds a hand-over", () => {
    const c = changedJobs(at("2026-04-30"), at("2026-05-01"));
    expect(c.map((x) => x.id)).toEqual(["j-audit"]);
    expect(c[0]!.before.map((h) => h.name)).toEqual(["Ann Lee"]);
    expect(c[0]!.after.map((h) => h.name)).toEqual(["Ledger CPA"]);
  });

  it("finds an election: the office stays, the person changes", () => {
    expect(changedJobs(at("2026-07-15"), at("2026-08-01")).map((x) => x.id)).toEqual(["j-bank"]);
  });

  it("finds a job left with nobody", () => {
    expect(changedJobs(at("2026-09-30"), at("2026-10-01")).map((x) => x.id)).toEqual(["j-elev"]);
  });

  it("does not count a job entered between the two days", () => {
    expect(changedJobs(at("2026-09-14"), at("2026-09-15"))).toEqual([]);
  });

  it("finds nothing on a quiet day, and several across a long jump", () => {
    expect(changedJobs(at("2026-11-01"), at(TODAY))).toEqual([]);
    expect(changedJobs(at("2026-01-01"), at(TODAY)).length).toBeGreaterThan(2);
  });
});

describe("words", () => {
  it("names a day the same in every zone", () => {
    expect(longDay("2026-10-12")).toBe("12 October 2026");
  });

  it("announces the day, one change by name, and several by count", () => {
    const at = (d: string) => mapModel(loaded, d);
    expect(changeAnnouncement("2026-11-01", [])).toBe("As of 1 November 2026.");
    expect(changeAnnouncement("2026-08-01", changedJobs(at("2026-07-15"), at("2026-08-01")))).toBe(
      "As of 1 August 2026. Reconcile the bank statements: Treasurer (vacant), Ledger CPA to Treasurer (Bo Chen), Ledger CPA.",
    );
    expect(changeAnnouncement(TODAY, changedJobs(at("2026-01-01"), at(TODAY)))).toMatch(/^As of 18 November 2026\. \d+ jobs changed holder\.$/);
  });
});
