/**
 * The register's pure core (docs/spec-responsibilities.md): the exactly-one
 * target rule, who holds a job on a date, offices read from board terms, the
 * review date, and the two plans every hand-over and term change writes.
 */
import { describe, it, expect } from "vitest";
import {
  addDays,
  currentHolders,
  holdersAsOf,
  holdsOn,
  officeHolderAsOf,
  officeTermsWithin,
  targetColumns,
  unassignedSince,
  validateTarget,
  type BoardTermRow,
} from "#core/shared/responsibilities/holders";
import { addMonths, isReviewOverdue, nextReview } from "#core/shared/responsibilities/review";
import { planHandOver, planTermChange } from "#core/shared/responsibilities/plan";
import {
  CADENCE_KEYS,
  CATEGORY_KEYS,
  FLORIDA_CONDOMINIUM,
  OFFICE_KEYS,
  rowsToAdd,
  templateFor,
  titleKey,
} from "#core/shared/responsibilities/config";
import { sentences } from "#core/shared/responsibilities/activity";

describe("validateTarget", () => {
  it.each([
    ["office", { office: "treasurer" }, "treasurer"],
    ["member", { member: "m-1" }, "m-1"],
    ["user", { user: "u-1" }, "u-1"],
    ["vendor", { vendor: { id: "v-1", company: "Acme" } }, "v-1"],
    ["team", { team: "t-1" }, "t-1"],
    ["label", { label: "  City of Miami Beach " }, "City of Miami Beach"],
  ])("accepts one %s", (kind, input, value) => {
    expect(validateTarget(input as any)).toEqual({ ok: true, target: { kind, value } });
  });

  it("refuses none, with a clear error", () => {
    const r = validateTarget({ office: null, member: "", label: "   " });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Choose who holds it/);
    expect(validateTarget(null).ok).toBe(false);
  });

  it("refuses two, naming them", () => {
    const r = validateTarget({ office: "treasurer", vendor: "v-1" });
    expect(!r.ok && r.error).toBe("Choose one holder per row, not office and vendor.");
  });

  it("refuses an office that is not a board title", () => {
    const r = validateTarget({ office: "chair" });
    expect(!r.ok && r.error).toMatch(/not a board office/);
  });

  it("targetColumns sets one column and nulls the rest", () => {
    expect(targetColumns({ kind: "vendor", value: "v-1" })).toEqual({
      office: null, member: null, user: null, vendor: "v-1", team: null, label: null,
    });
  });
});

const row = (id: string, start: string | null, end: string | null, extra: Record<string, unknown> = {}) => ({
  id, start_date: start, end_date: end, role: "owner", ...extra,
});

describe("holding on a date", () => {
  it("both ends inclusive", () => {
    const r = row("a", "2026-01-01", "2026-10-31");
    expect(holdsOn(r, "2025-12-31")).toBe(false);
    expect(holdsOn(r, "2026-01-01")).toBe(true);
    expect(holdsOn(r, "2026-10-31")).toBe(true);
    expect(holdsOn(r, "2026-11-01")).toBe(false);
    expect(holdsOn(row("b", null, null), "2026-01-01")).toBe(false);
  });

  it("a hand-over leaves exactly one holder on every day", () => {
    const rows = [row("old", "2026-01-01", "2026-10-31"), row("new", "2026-11-01", null)];
    for (const d of ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]) {
      expect(holdersAsOf(rows, d)).toHaveLength(1);
    }
    expect(holdersAsOf(rows, "2026-10-31")[0]!.id).toBe("old");
    expect(holdersAsOf(rows, "2026-11-01")[0]!.id).toBe("new");
  });

  it("a future row does not hold yet; owners lead", () => {
    const rows = [
      row("backup", "2026-01-01", null, { role: "backup" }),
      row("owner", "2026-02-01", null),
      row("later", "2027-01-01", null),
    ];
    expect(holdersAsOf(rows, "2026-06-01").map((r) => r.id)).toEqual(["owner", "backup"]);
    expect(currentHolders(rows, "2026-06-01").map((r) => r.id)).toEqual(["owner", "backup"]);
  });

  it("unassigned since: the day after the last end, else the day it was created", () => {
    const ended = [row("a", "2026-01-01", "2026-10-11")];
    expect(unassignedSince(ended, "2026-11-15", "2025-06-01T10:00:00Z")).toBe("2026-10-12");
    expect(unassignedSince([], "2026-11-15", "2025-06-01T10:00:00Z")).toBe("2025-06-01");
    expect(unassignedSince([row("b", "2026-01-01", null)], "2026-11-15", "2025-06-01")).toBeNull();
    // An end after the as-of date does not count yet.
    expect(unassignedSince([row("c", "2027-01-01", null), row("d", "2025-01-01", "2025-12-31")], "2026-06-01", null)).toBe("2026-01-01");
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

const term = (id: string, title: string, start: string | null, end: string | null, member = id): BoardTermRow => ({
  id, title, status: "published", term_start: start, term_end: end, hoa_member: member,
});

describe("offices", () => {
  const terms = [
    term("ann", "treasurer", "2026-01-01", "2026-06-15"),
    term("bob", "treasurer", "2026-07-01", null),
    term("cy", "director", "2026-01-01", null),
    term("di", "director", "2026-03-01", "2026-12-31"),
    { ...term("draft", "treasurer", "2026-01-01", null), status: "draft" },
  ];

  it("resolves the person on a date", () => {
    const r = officeHolderAsOf(terms, "treasurer", "2026-03-01");
    expect(r.vacant).toBe(false);
    expect(r.terms.map((t) => t.id)).toEqual(["ann"]);
  });

  it("is vacant in a resignation gap, and drafts never count", () => {
    expect(officeHolderAsOf(terms, "treasurer", "2026-06-20")).toMatchObject({ vacant: true, terms: [] });
    expect(officeHolderAsOf(terms, "president", "2026-06-20").vacant).toBe(true);
  });

  it("directors may be several", () => {
    expect(officeHolderAsOf(terms, "director", "2026-04-01").terms.map((t) => t.id)).toEqual(["cy", "di"]);
  });

  it("two terms inside one assignment, clipped to it", () => {
    const within = officeTermsWithin(terms, "treasurer", "2026-02-01", "2026-10-31");
    expect(within.map((c) => [c.term.id, c.from, c.to])).toEqual([
      ["ann", "2026-02-01", "2026-06-15"],
      ["bob", "2026-07-01", "2026-10-31"],
    ]);
    expect(officeTermsWithin(terms, "treasurer", "2026-08-01", null).map((c) => c.term.id)).toEqual(["bob"]);
  });
});

describe("nextReview", () => {
  it.each([
    ["daily", "2026-01-15", "2026-02-15"],
    ["weekly", "2026-01-15", "2026-02-15"],
    ["monthly", "2026-01-15", "2026-02-15"],
    ["quarterly", "2026-01-15", "2026-04-15"],
    ["annual", "2026-01-15", "2027-01-15"],
    ["continuous", "2026-01-15", "2027-01-15"],
    ["as_needed", "2026-01-15", "2027-01-15"],
  ])("%s", (cadence, last, next) => {
    expect(nextReview(cadence, last)).toBe(next);
  });

  it("clamps the month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(nextReview("quarterly", "2026-11-30")).toBe("2027-02-28");
  });

  it("never verified is due now, and counts as overdue", () => {
    expect(nextReview("monthly", null)).toBeNull();
    expect(isReviewOverdue("monthly", null, "2026-11-15")).toBe(true);
    expect(isReviewOverdue("monthly", "2026-10-15", "2026-11-15")).toBe(false);
    expect(isReviewOverdue("monthly", "2026-10-14", "2026-11-15")).toBe(true);
  });
});

describe("planHandOver", () => {
  const current = { id: "a-1", office: "treasurer", role: "owner", start_date: "2026-01-01", end_date: null };

  it("ends the current row the day before and opens the next from the date", () => {
    const r = planHandOver(current, { vendor: "cpa" }, "2026-11-01");
    expect(r).toEqual({
      ok: true,
      plan: {
        end: { id: "a-1", end_date: "2026-10-31" },
        open: { office: null, member: null, user: null, vendor: "cpa", team: null, label: null, role: "owner", start_date: "2026-11-01", notes: null },
        target: { kind: "vendor", value: "cpa" },
      },
    });
  });

  it("keeps the role unless the next one says otherwise", () => {
    const backup = { ...current, role: "backup" };
    expect((planHandOver(backup, { member: "m-2" }, "2026-11-01") as any).plan.open.role).toBe("backup");
    expect((planHandOver(backup, { member: "m-2", role: "oversight" }, "2026-11-01") as any).plan.open.role).toBe("oversight");
  });

  it("with no next, only ends", () => {
    const r = planHandOver(current, null, "2026-10-12");
    expect(r).toEqual({ ok: true, plan: { end: { id: "a-1", end_date: "2026-10-11" }, open: null, target: null } });
  });

  it("refuses the same holder, an ended row, a date on the start, a bad target", () => {
    expect(planHandOver(current, { office: "treasurer" }, "2026-11-01")).toMatchObject({ ok: false, status: 409 });
    expect(planHandOver({ ...current, end_date: "2026-05-01" }, null, "2026-11-01")).toMatchObject({ ok: false, status: 409 });
    expect(planHandOver(current, { vendor: "cpa" }, "2026-01-01")).toMatchObject({ ok: false, status: 409 });
    expect(planHandOver(current, { vendor: "cpa", label: "x" }, "2026-11-01")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("planTermChange", () => {
  const t = { id: "t-1", hoa_member: "m-1", title: "director", term_start: "2026-01-01", term_end: "2027-12-31", end_reason: null };

  it("end sets the last day and the reason", () => {
    expect(planTermChange(t, { kind: "end", lastDay: "2026-10-15", reason: "resigned" })).toEqual({
      ok: true,
      plan: { patch: { term_end: "2026-10-15", end_reason: "resigned" }, open: null, ends: true },
    });
    expect(planTermChange({ ...t, end_reason: "resigned" }, { kind: "end", lastDay: "2026-10-15", reason: "removed" })).toMatchObject({ ok: false, status: 409 });
    expect(planTermChange(t, { kind: "end", lastDay: "2025-12-01", reason: "removed" })).toMatchObject({ ok: false });
    expect(planTermChange(t, { kind: "end", lastDay: "2026-10-15", reason: "changed_office" as any })).toMatchObject({ ok: false, status: 400 });
  });

  it("change office ends the term and opens one for the same member, keeping the planned end", () => {
    const r = planTermChange(t, { kind: "change_office", effective: "2026-06-01", office: "treasurer" });
    expect(r).toEqual({
      ok: true,
      plan: {
        patch: { term_end: "2026-05-31", end_reason: "changed_office" },
        open: { title: "treasurer", term_start: "2026-06-01", term_end: "2027-12-31", status: "published" },
        ends: true,
      },
    });
    const open = planTermChange({ ...t, term_end: null }, { kind: "change_office", effective: "2026-06-01", office: "treasurer" });
    expect(open.ok && open.plan.open?.term_end).toBeNull();
  });

  it("change office refuses the same office, a date on the start, a term already over", () => {
    expect(planTermChange(t, { kind: "change_office", effective: "2026-06-01", office: "director" })).toMatchObject({ ok: false, status: 409 });
    expect(planTermChange(t, { kind: "change_office", effective: "2026-01-01", office: "treasurer" })).toMatchObject({ ok: false, status: 409 });
    expect(planTermChange({ ...t, term_end: "2026-03-31" }, { kind: "change_office", effective: "2026-06-01", office: "treasurer" })).toMatchObject({ ok: false, status: 409 });
  });

  it("correct patches in place and never carries the member", () => {
    const r = planTermChange(t, { kind: "correct", patch: { term_start: "2026-01-02", message: undefined } });
    expect(r).toEqual({ ok: true, plan: { patch: { term_start: "2026-01-02" }, open: null, ends: false } });
    const sneaky = planTermChange(t, { kind: "correct", patch: { hoa_member: "m-9", message: "x" } as any });
    expect(sneaky.ok && sneaky.plan.patch).toEqual({ message: "x" });
    expect(planTermChange(t, { kind: "correct", patch: { hoa_member: "m-9" } as any })).toMatchObject({ ok: false, status: 400 });
    expect(planTermChange(t, { kind: "correct", patch: {} })).toMatchObject({ ok: false, status: 400 });
    expect(planTermChange(t, { kind: "correct", patch: { term_end: "2025-01-01" } })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("the Florida condominium seed", () => {
  it("covers the five categories with valid cadences and unique titles", () => {
    expect(FLORIDA_CONDOMINIUM.label).toBe("Florida condominium");
    expect(new Set(FLORIDA_CONDOMINIUM.rows.map((r) => r.category))).toEqual(new Set(CATEGORY_KEYS));
    for (const r of FLORIDA_CONDOMINIUM.rows) expect(CADENCE_KEYS).toContain(r.cadence);
    const titles = FLORIDA_CONDOMINIUM.rows.map((r) => titleKey(r.title));
    expect(new Set(titles).size).toBe(titles.length);
    expect(FLORIDA_CONDOMINIUM.rows).toHaveLength(45);
    expect(templateFor("florida_condominium")).toBe(FLORIDA_CONDOMINIUM);
  });

  it("applying is additive and idempotent on title", () => {
    const first = rowsToAdd(FLORIDA_CONDOMINIUM, ["  reconciles BANK statements ", "Something of our own"]);
    expect(first).toHaveLength(44);
    expect(first.find((r) => r.title === "Reconciles bank statements")).toBeUndefined();
    expect(rowsToAdd(FLORIDA_CONDOMINIUM, FLORIDA_CONDOMINIUM.rows.map((r) => r.title))).toEqual([]);
  });

  it("offices are the board title enum", () => {
    expect(OFFICE_KEYS).toEqual(["president", "vice_president", "secretary", "treasurer", "director"]);
  });
});

describe("activity sentences", () => {
  it("says what changed", () => {
    expect(sentences.handedOver("Reconciles bank statements", "Treasurer", "CPA")).toBe(
      "Treasurer ended on Reconciles bank statements; CPA added"
    );
    expect(sentences.handedOver("Pest control", "Acme", null)).toBe("Acme ended on Pest control; nobody holds it now");
    expect(sentences.termEnded("Ann Lee", "treasurer", "resigned")).toBe("Ann Lee's term as Treasurer ended (resigned)");
    expect(sentences.officeChanged("Ann Lee", "director", "treasurer")).toBe("Ann Lee moved from Director to Treasurer");
    expect(sentences.updated("Pest control", ["cadence", "basis", "notes"])).toBe("Updated Pest control (cadence, basis and notes)");
    expect(sentences.template(0, "Florida condominium")).toMatch(/already there/);
  });
});
