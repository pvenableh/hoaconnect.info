/**
 * Focus on the responsibilities register (asked 2026-11-19, Session 18): pick
 * a holder and only the jobs they hold stay, in the Map and in the Grid; and
 * "Unassigned" is its own switch, independent of the holder.
 *
 * Pure. The page keeps the two choices in the URL (`?holder=`, `?unassigned=`),
 * so Grid and Map share them and a link reopens them; everything drawn comes
 * from here.
 *
 *  · A holder is a rail key: "office:treasurer", "member:<id>", "vendor:<id>",
 *    "label:City of Miami Beach". A member holds a job by name or through an
 *    office they sit in on the day, exactly as the map lights it (`holdsJob`).
 *  · A holder who is not on the map that day (the slider moved before they
 *    held anything, or after they left) still filters: nothing shows, and the
 *    empty state says so and offers Show all. The pick stays, so moving the
 *    slider back finds them again.
 *  · Unassigned jobs hold nobody, so a holder filter never keeps one; the
 *    switch only matters with no holder picked. The count of what the switch
 *    hides is kept, so an admin who hides them can see how many are hidden.
 */
import type { MapHolder, MapJob, MapModel } from "./map";
import type { HolderView } from "./views";

export interface RegisterFocus {
  /** A rail key, or null for everyone. */
  holder: string | null;
  /** Show the jobs nobody holds. */
  unassigned: boolean;
}

/** Why a focus shows nothing, so the empty state can say so. */
export type FocusEmpty = "holder" | "unassigned-hidden" | null;

export interface FocusedMap {
  /** The model with only the jobs in focus (the rail is untouched, so another holder is one tap away). */
  model: MapModel;
  /** The picked holder, when it is on the map that day (null for everyone, or a pick not on the map). */
  holder: MapHolder | null;
  /** Jobs shown. */
  shown: number;
  /** Jobs on the map that day, before any focus. */
  total: number;
  /** Unassigned jobs the switch is hiding (0 when it shows them). */
  hiddenUnassigned: number;
  /** Nothing to show, and why. */
  empty: FocusEmpty;
}

/** The member a rail key names, when it names one: "member:<id>" → "<id>". */
const memberOf = (key: string) => (key.startsWith("member:") ? key.slice(7) : null);

/** Does the holder `key` hold this job: by name, or (a member) through an office they hold that day. */
export function jobHeldBy(job: Pick<MapJob, "holders">, key: string): boolean {
  const member = memberOf(key);
  return job.holders.some((h) => h.key === key || (!!member && h.people.some((p) => p.memberId === member)));
}

/**
 * The holder a key names, or null when it is not on the map that day. A rail
 * entry, or a member who holds jobs only through an office (the rail lists the
 * office, the Grid's picker lists the person too, and the URL is shared).
 */
export function focusHolder(model: MapModel, key: string | null): MapHolder | null {
  if (!key) return null;
  const rail = [...model.holders, ...model.vacant];
  const onRail = rail.find((h) => h.key === key);
  if (onRail) return onRail;
  const member = memberOf(key);
  if (!member) return null;
  const person = rail.flatMap((h) => h.people).find((p) => p.memberId === member);
  if (!person) return null;
  const jobs = [...model.unassigned, ...model.groups.flatMap((g) => g.jobs)];
  return {
    key,
    kind: "member",
    label: person.name,
    people: [],
    vacant: false,
    jobCount: jobs.filter((j) => jobHeldBy(j, key)).length,
  };
}

/** The map with only the jobs in focus. */
export function focusMap(model: MapModel, focus: RegisterFocus): FocusedMap {
  const holder = focusHolder(model, focus.holder);
  const total = model.unassigned.length + model.groups.reduce((n, g) => n + g.jobs.length, 0);
  const keep = (j: MapJob) => !focus.holder || jobHeldBy(j, focus.holder);

  const hiddenUnassigned = focus.unassigned ? 0 : model.unassigned.length;
  // A holder never holds an unassigned job, so with one picked the group is empty either way.
  const unassigned = focus.unassigned && !focus.holder ? model.unassigned : [];
  const groups = model.groups.map((g) => ({ ...g, jobs: g.jobs.filter(keep) }));
  const shown = unassigned.length + groups.reduce((n, g) => n + g.jobs.length, 0);

  let empty: FocusEmpty = null;
  if (!shown && total) empty = focus.holder ? "holder" : "unassigned-hidden";

  return { model: { ...model, unassigned, groups }, holder, shown, total, hiddenUnassigned, empty };
}

export interface FocusOption {
  value: string;
  label: string;
}

/**
 * Who the Grid's holder picker offers: everyone on the map's rail (offices,
 * vacant ones included, members, vendors, teams, names), and each person who
 * sits in an office that day, so "Ann Lee" finds her jobs whether a row names
 * her or the Treasurer. Once each, by name. (The owners' rows carry no member
 * ids, so their picker lists the offices and names it was sent.)
 */
export function focusOptions(model: MapModel): FocusOption[] {
  const seen = new Map<string, string>();
  for (const h of [...model.vacant, ...model.holders]) {
    seen.set(h.key, h.label);
    for (const p of h.people) if (p.memberId && !seen.has(`member:${p.memberId}`)) seen.set(`member:${p.memberId}`, p.name);
  }
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

// ── The grid ─────────────────────────────────────────────────────────────────

/** A holder as the grid's rows carry it, keyed as the rail keys it. */
type RowHolder = Pick<HolderView, "kind" | "ref" | "people">;

const rowHolderKey = (h: Pick<HolderView, "kind" | "ref">) => `${h.kind}:${h.ref}`;

/**
 * Is a grid row in focus? The same rule as the map: a holder keeps the rows
 * they hold (by name, or a member through an office); the switch drops rows
 * nobody holds. Retired rows have no holder on the day and count as held by
 * nobody, so a holder filter drops them; the register's own status control
 * decides whether they show at all.
 */
export function rowInFocus(row: { holders: readonly RowHolder[] }, focus: RegisterFocus): boolean {
  if (!row.holders.length) return !focus.holder && focus.unassigned;
  if (!focus.holder) return true;
  const member = memberOf(focus.holder);
  return row.holders.some(
    (h) => rowHolderKey(h) === focus.holder || (!!member && (h.people ?? []).some((p) => p.memberId === member)),
  );
}

// ── Words ────────────────────────────────────────────────────────────────────

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

/** "Ana Ruiz’s 6" · "the Treasurer’s 10": the start of the focus line. */
export function focusLabel(holder: Pick<MapHolder, "kind" | "label">, count: number): string {
  const name = holder.kind === "office" ? `the ${holder.label}` : holder.label;
  return `${possessive(name)} ${count}`;
}

/** Parse `?unassigned=`: "0" hides, "1" shows, anything else is the page's default. */
export function parseUnassigned(raw: unknown, fallback: boolean): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "0") return false;
  if (v === "1") return true;
  return fallback;
}
