/**
 * Focus on the register (core/shared/responsibilities/focus.ts, Session 18):
 * picking a holder filters the Map and the Grid to their jobs, and Unassigned
 * is its own switch. Table-tested: by person, by office, through an office,
 * the switch, both together, and nothing matching.
 */
import { describe, it, expect } from "vitest";
import { focusLabel, focusMap, focusOptions, parseUnassigned, rowInFocus, type RegisterFocus } from "#core/shared/responsibilities/focus";
import type { MapHolder, MapJob, MapJobHolder, MapModel } from "#core/shared/responsibilities/map";

// Ann sits in the Treasurer's office; Bo is named on a job directly; Lift Co is
// a vendor; the Vice President's office is vacant.
const treasurer: MapJobHolder = { key: "office:treasurer", kind: "office", name: "Treasurer", role: "owner", people: [{ name: "Ann Lee", memberId: "m-ann" }], vacant: false };
const vp: MapJobHolder = { key: "office:vice_president", kind: "office", name: "Vice President", role: "owner", people: [], vacant: true };
const bo: MapJobHolder = { key: "member:m-bo", kind: "member", name: "Bo Chen", role: "owner", people: [], vacant: false };
const lift: MapJobHolder = { key: "vendor:v-lift", kind: "vendor", name: "Lift Co", role: "performs", people: [], vacant: false };

const job = (id: string, category: string, holders: MapJobHolder[]): MapJob => ({ id, title: id, category, holders, unassignedSince: holders.length ? null : "2026-11-01" });
const rail = (h: MapJobHolder, jobCount: number): MapHolder => ({ key: h.key, kind: h.kind, label: h.name, people: h.people, vacant: h.vacant, jobCount });

const model: MapModel = {
  day: "2026-11-19",
  holders: [rail(treasurer, 2), rail(bo, 2), rail(lift, 1)],
  vacant: [rail(vp, 1)],
  unassigned: [job("budget", "financial", []), job("pool", "physical", [])],
  groups: [
    { key: "financial", label: "Financial", jobs: [job("reconcile", "financial", [treasurer]), job("taxes", "financial", [treasurer, bo])] },
    { key: "physical", label: "Physical", jobs: [job("elevator", "physical", [bo, lift]), job("insurance", "physical", [vp])] },
  ],
};

const ids = (m: MapModel) => [...m.unassigned, ...m.groups.flatMap((g) => g.jobs)].map((j) => j.id);
const focus = (holder: string | null, unassigned = true): RegisterFocus => ({ holder, unassigned });

describe("focusMap", () => {
  it.each([
    ["everyone, unassigned shown", focus(null), ["budget", "pool", "reconcile", "taxes", "elevator", "insurance"], 0],
    ["everyone, unassigned hidden", focus(null, false), ["reconcile", "taxes", "elevator", "insurance"], 2],
    ["a person named on jobs", focus("member:m-bo"), ["taxes", "elevator"], 0],
    ["an office", focus("office:treasurer"), ["reconcile", "taxes"], 0],
    ["a person through the office they sit in", focus("member:m-ann"), ["reconcile", "taxes"], 0],
    ["a vendor", focus("vendor:v-lift"), ["elevator"], 0],
    ["a vacant office still holds its job", focus("office:vice_president"), ["insurance"], 0],
    ["a holder with unassigned hidden: the switch counts what it hides", focus("member:m-bo", false), ["taxes", "elevator"], 2],
  ])("%s", (_name, f, shown, hidden) => {
    const out = focusMap(model, f);
    expect(ids(out.model)).toEqual(shown);
    expect(out.shown).toBe(shown.length);
    expect(out.total).toBe(6);
    expect(out.hiddenUnassigned).toBe(hidden);
    expect(out.empty).toBeNull();
  });

  it("keeps the whole rail, so another holder is one tap away", () => {
    const out = focusMap(model, focus("member:m-bo"));
    expect(out.model.holders).toEqual(model.holders);
    expect(out.model.vacant).toEqual(model.vacant);
    expect(out.holder?.label).toBe("Bo Chen");
  });

  it("finds a person who holds jobs only through an office (not a rail entry)", () => {
    const out = focusMap(model, focus("member:m-ann"));
    expect(out.holder).toMatchObject({ key: "member:m-ann", kind: "member", label: "Ann Lee", jobCount: 2 });
  });

  it("a holder not on the map that day still filters: nothing shows, and it says why", () => {
    const out = focusMap(model, focus("member:m-gone"));
    expect(out.holder).toBeNull();
    expect(out.shown).toBe(0);
    expect(out.empty).toBe("holder");
  });

  it("a member on the map with nothing left in focus says why", () => {
    const quiet: MapModel = { ...model, holders: [...model.holders, rail({ ...bo, key: "member:m-cy", name: "Cy" }, 0)] };
    const out = focusMap(quiet, focus("member:m-cy"));
    expect(out.shown).toBe(0);
    expect(out.empty).toBe("holder");
  });

  it("only unassigned jobs, and the switch hides them: empty, because of the switch", () => {
    const onlyGaps: MapModel = { ...model, holders: [], vacant: [], groups: model.groups.map((g) => ({ ...g, jobs: [] })) };
    const out = focusMap(onlyGaps, focus(null, false));
    expect(out.shown).toBe(0);
    expect(out.hiddenUnassigned).toBe(2);
    expect(out.empty).toBe("unassigned-hidden");
  });

  it("an empty register is not an empty focus", () => {
    const none: MapModel = { ...model, holders: [], vacant: [], unassigned: [], groups: [] };
    expect(focusMap(none, focus(null, false)).empty).toBeNull();
  });
});

describe("focusOptions (the grid's holder picker)", () => {
  it("lists the rail and each person in an office, once each, by name", () => {
    expect(focusOptions(model)).toEqual([
      { value: "member:m-ann", label: "Ann Lee" },
      { value: "member:m-bo", label: "Bo Chen" },
      { value: "vendor:v-lift", label: "Lift Co" },
      { value: "office:treasurer", label: "Treasurer" },
      { value: "office:vice_president", label: "Vice President" },
    ]);
  });

  it("does not offer Unassigned: that is its own switch", () => {
    expect(focusOptions(model).some((o) => o.value === "unassigned")).toBe(false);
  });
});

describe("rowInFocus (the grid)", () => {
  const officeRow = { holders: [{ kind: "office" as const, ref: "treasurer", people: [{ termId: "t", memberId: "m-ann", name: "Ann Lee" }] }] };
  const boRow = { holders: [{ kind: "member" as const, ref: "m-bo" }] };
  const emptyRow = { holders: [] };

  it.each([
    ["an office row, everyone", officeRow, focus(null), true],
    ["an office row, by the office", officeRow, focus("office:treasurer"), true],
    ["an office row, by the person in it", officeRow, focus("member:m-ann"), true],
    ["an office row, by someone else", officeRow, focus("member:m-bo"), false],
    ["a named row, by that person", boRow, focus("member:m-bo"), true],
    ["an unassigned row, everyone, shown", emptyRow, focus(null), true],
    ["an unassigned row, everyone, hidden", emptyRow, focus(null, false), false],
    ["an unassigned row, with a holder picked", emptyRow, focus("member:m-bo"), false],
  ])("%s", (_name, row, f, expected) => {
    expect(rowInFocus(row, f)).toBe(expected);
  });
});

describe("words", () => {
  it.each([
    [{ kind: "member" as const, label: "Ana Ruiz" }, 6, "Ana Ruiz’s 6"],
    [{ kind: "member" as const, label: "Marcus Reyes" }, 1, "Marcus Reyes’ 1"],
    [{ kind: "office" as const, label: "Treasurer" }, 10, "the Treasurer’s 10"],
  ])("focusLabel %o", (h, n, out) => {
    expect(focusLabel(h, n)).toBe(out);
  });

  it.each([
    ["0", true, false],
    ["1", false, true],
    [undefined, true, true],
    [undefined, false, false],
    ["yes", false, false],
    [["0"], true, false],
  ])("parseUnassigned(%o, default %s)", (raw, fallback, out) => {
    expect(parseUnassigned(raw, fallback)).toBe(out);
  });
});
