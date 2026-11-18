/**
 * The responsibilities map (plan §3.4 "Map view", Phase 2c): the register's
 * rows redrawn as holders on one side and jobs on the other, for any day.
 *
 * Pure. Everything here is derived from what the two GET routes already return:
 * the admin's `RegisterRow` carries every holder row ever (`assignees`) and, on
 * an office row, every term of the office inside it (`terms`), so any day
 * resolves without another request; the owners' `PublishedRow` carries today
 * only, and a model built from it has nothing else to show.
 */
import { CATEGORIES, OFFICE_KEYS, ROLE_KEYS, type AssigneeRole } from "./config";
import { addDays, holdsOn, unassignedSince, type TargetKind } from "./holders";
import { isHeldRow, publishedHolder, holderKey } from "./register-view";
import type { HolderView, PersonRef, PublishedRow, RegisterRow } from "./views";

// ── Who holds a job on a day ─────────────────────────────────────────────────

const roleRank = (r: string | null | undefined) => {
  const i = (ROLE_KEYS as readonly string[]).indexOf(r || "owner");
  return i < 0 ? ROLE_KEYS.length : i;
};

const within = (from: string | null, to: string | null, d: string) => (!from || from <= d) && (!to || to >= d);

/**
 * Who holds a job on `day`, from the row's own history alone: the holder rows
 * that hold on that day (`holdsOn`, both ends inclusive) and, for an office,
 * the people whose term of it covers that day (its `terms`, already clipped to
 * the row). Equal to the `holders` the route builds for that day, in the same
 * order (owner, performs, backup, oversight; then by start), with one caveat
 * the view cannot settle: the route also orders by `sort`, which the view does
 * not carry, and orders two directors by their term's own start, where the view
 * has it clipped to the row.
 */
export function holdersOnDay(row: Pick<RegisterRow, "assignees">, day: string): HolderView[] {
  return row.assignees
    .filter((a) => holdsOn(a, day))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || String(a.start_date).localeCompare(String(b.start_date)))
    .map((a) => {
      if (a.kind !== "office") return a;
      const people: PersonRef[] = (a.terms ?? [])
        .filter((t) => within(t.from, t.to, day))
        .map((t) => ({ termId: t.termId, memberId: t.memberId, name: t.name }));
      return { ...a, people, vacant: people.length === 0 };
    });
}

// ── The model ────────────────────────────────────────────────────────────────

/**
 * One job as the map reads it. The admin's rows carry `assignees` (the whole
 * history) and resolve any day; the owners' rows do not, so they show the day
 * the route sent and nothing else.
 */
export interface MapSourceRow {
  id: string;
  title: string;
  category: string;
  status?: string | null;
  date_created?: string | null;
  holders: HolderView[];
  unassignedSince: string | null;
  assignees?: HolderView[];
}

export interface MapPerson {
  name: string;
  memberId: string | null;
}

export interface MapJobHolder {
  /** "office:treasurer", "member:<id>", "label:City of Miami Beach". */
  key: string;
  kind: TargetKind;
  name: string;
  role: AssigneeRole;
  /** An office: who holds it on the day. */
  people: MapPerson[];
  /** An office nobody holds on the day. */
  vacant: boolean;
}

export interface MapJob {
  id: string;
  title: string;
  category: string;
  holders: MapJobHolder[];
  /** Nobody holds it on the day: the first day nobody did. */
  unassignedSince: string | null;
}

export interface MapHolder {
  key: string;
  kind: TargetKind;
  label: string;
  /** An office: who holds it on the day. Empty and `vacant` when nobody does. */
  people: MapPerson[];
  vacant: boolean;
  /** The jobs that light up when this holder is picked. */
  jobCount: number;
}

export interface MapModel {
  day: string;
  /** Everyone who holds a job on the day: offices (by rank), members, users, vendors, teams, names. */
  holders: MapHolder[];
  /** Offices that hold a job and that nobody holds on the day: the attention group. */
  vacant: MapHolder[];
  /** Jobs nobody holds on the day: the attention group. */
  unassigned: MapJob[];
  /** Every held job, in the five categories, in the register's order. */
  groups: { key: string; label: string; jobs: MapJob[] }[];
}

const KIND_ORDER: TargetKind[] = ["office", "member", "user", "vendor", "team", "label"];

const day10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

function jobHolder(h: HolderView): MapJobHolder {
  const people = (h.people ?? []).map((p) => ({ name: p.name, memberId: p.memberId }));
  return {
    key: holderKey(h),
    kind: h.kind,
    name: h.name,
    role: h.role || "owner",
    people,
    vacant: h.kind === "office" && people.length === 0,
  };
}

/** The member a rail key names, when it names one: "member:<id>" → "<id>". */
const memberOf = (key: string) => (key.startsWith("member:") ? key.slice(7) : null);

/** Does the holder `key` hold this job: by name, or (a member) through an office they hold that day. */
function holdsJob(job: MapJob, key: string): boolean {
  const member = memberOf(key);
  return job.holders.some((h) => h.key === key || (!!member && h.people.some((p) => p.memberId === member)));
}

const allJobs = (m: MapModel) => [...m.unassigned, ...m.groups.flatMap((g) => g.jobs)];

/**
 * The first day a job is on the map: the day it was entered, or its first
 * holder's start when the history begins earlier. Null for the owners' rows.
 */
function firstDay(r: MapSourceRow): string | null {
  const days = [day10(r.date_created), ...(r.assignees ?? []).map((a) => day10(a.start_date))].filter((d): d is string => !!d);
  return days.length ? days.sort()[0]! : null;
}

/**
 * The map for one day. Retired jobs are left out; so is a job on a day before
 * it existed: before it was entered and before its first holder (otherwise
 * every earlier day would read it as "unassigned since" a later date). A job
 * whose recorded history began before it was entered is on the map from then,
 * gaps included. Rows with history resolve the day from it; rows without (the
 * owners') are drawn as sent.
 */
export function mapModel(rows: readonly MapSourceRow[], day: string): MapModel {
  const jobs: MapJob[] = [];
  for (const r of rows) {
    if (r.status === "retired") continue;
    const held = r.assignees ? holdersOnDay({ assignees: r.assignees }, day) : r.holders;
    const first = r.assignees ? firstDay(r) : null;
    if (!held.length && first && first > day) continue;
    jobs.push({
      id: r.id,
      title: r.title,
      category: r.category,
      holders: held.map(jobHolder),
      unassignedSince: held.length ? null : r.assignees ? unassignedSince(r.assignees, day, r.date_created) : r.unassignedSince,
    });
  }

  const rail = new Map<string, MapHolder>();
  for (const j of jobs) {
    for (const h of j.holders) {
      if (rail.has(h.key)) continue;
      rail.set(h.key, { key: h.key, kind: h.kind, label: h.name, people: h.people, vacant: h.vacant, jobCount: 0 });
    }
  }
  for (const h of rail.values()) h.jobCount = jobs.filter((j) => holdsJob(j, h.key)).length;

  const officeRank = (h: MapHolder) => {
    const i = (OFFICE_KEYS as readonly string[]).indexOf(h.key.slice(7));
    return i < 0 ? OFFICE_KEYS.length : i;
  };
  const order = (a: MapHolder, b: MapHolder) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    (a.kind === "office" ? officeRank(a) - officeRank(b) : 0) ||
    a.label.localeCompare(b.label);
  const all = [...rail.values()].sort(order);

  const catRank = (c: string) => {
    const i = CATEGORIES.findIndex((x) => x.key === c);
    return i < 0 ? CATEGORIES.length : i;
  };
  // Rows arrive in the register's order (category, sort, title); unassigned jobs keep it.
  const unassigned = jobs.filter((j) => !j.holders.length).sort((a, b) => catRank(a.category) - catRank(b.category));

  return {
    day,
    holders: all.filter((h) => !h.vacant),
    vacant: all.filter((h) => h.vacant),
    unassigned,
    groups: CATEGORIES.map((c) => ({
      key: c.key as string,
      label: c.label as string,
      jobs: jobs.filter((j) => j.holders.length && j.category === c.key),
    })),
  };
}

/**
 * The owners' rows as the map reads them: held rows with today's holders,
 * unassigned rows (only when the route sent them) with their date. No history:
 * a model built from these cannot show another day, a basis or a note, because
 * none of it is here.
 */
export function publishedMapRows(rows: readonly PublishedRow[]): MapSourceRow[] {
  return rows.map((r) =>
    isHeldRow(r)
      ? { id: r.id, title: r.title, category: r.category, holders: r.who.map(publishedHolder), unassignedSince: null }
      : { id: r.id, title: r.title, category: r.category, holders: [], unassignedSince: r.unassignedSince },
  );
}

// ── Picking ──────────────────────────────────────────────────────────────────

export type MapSelection = { holder: string } | { job: string } | null;

export interface Lit {
  /** The jobs a picked holder holds; for a picked job, that job. */
  jobs: string[];
  /** The holders of a picked job, with their role; for a picked holder, that holder. */
  holders: { key: string; role: AssigneeRole | null }[];
}

/**
 * What lights up. A holder: every job they hold that day, by name or (a member)
 * through an office they hold. A job: its holders, by role. A pick that is not
 * on the map that day lights nothing, and the page shows everything.
 */
export function lit(model: MapModel, selection: MapSelection): Lit | null {
  if (!selection) return null;
  const jobs = allJobs(model);
  if ("holder" in selection) {
    const known = [...model.holders, ...model.vacant].some((h) => h.key === selection.holder);
    if (!known) return null;
    return { jobs: jobs.filter((j) => holdsJob(j, selection.holder)).map((j) => j.id), holders: [{ key: selection.holder, role: null }] };
  }
  const job = jobs.find((j) => j.id === selection.job);
  if (!job) return null;
  return { jobs: [job.id], holders: job.holders.map((h) => ({ key: h.key, role: h.role })) };
}

// ── Time ─────────────────────────────────────────────────────────────────────

/**
 * Every day the map can change, sorted: a job is entered, a holder row starts,
 * the day after one ends, and (an office) a term starts or the day after it
 * ends. The slider snaps to these. Retired jobs are not on the map, so their
 * days are not here.
 */
export function changeDays(rows: readonly Pick<MapSourceRow, "status" | "date_created" | "assignees">[]): string[] {
  const days = new Set<string>();
  const add = (d: string | null | undefined, plus = 0) => {
    const v = day10(d);
    if (v) days.add(plus ? addDays(v, plus) : v);
  };
  for (const r of rows) {
    if (r.status === "retired" || !r.assignees) continue;
    add(r.date_created);
    for (const a of r.assignees) {
      add(a.start_date);
      add(a.end_date, 1);
      for (const t of a.terms ?? []) {
        add(t.from);
        add(t.to, 1);
      }
    }
  }
  return [...days].sort();
}

export interface MapChange {
  id: string;
  title: string;
  before: MapJobHolder[];
  after: MapJobHolder[];
}

const signature = (j: MapJob) =>
  j.holders
    .map((h) => `${h.key}|${h.role}|${h.people.map((p) => p.memberId ?? p.name).sort().join(",")}`)
    .sort()
    .join(";");

/**
 * The jobs whose holders differ between two days: a hand-over, a holder ended
 * or added, or an election (the office stays, the person behind it changes).
 * A job on only one of the two days was entered between them, not handed over,
 * and is not counted.
 */
export function changedJobs(a: MapModel, b: MapModel): MapChange[] {
  const before = new Map(allJobs(a).map((j) => [j.id, j]));
  const out: MapChange[] = [];
  for (const j of allJobs(b)) {
    const was = before.get(j.id);
    if (was && signature(was) !== signature(j)) out.push({ id: j.id, title: j.title, before: was.holders, after: j.holders });
  }
  return out;
}

// ── Words ────────────────────────────────────────────────────────────────────

/** "12 October 2026", the same day in every time zone. */
export function longDay(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd!)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const holderWords = (hs: readonly MapJobHolder[]) =>
  hs.length
    ? hs
        .map((h) => (h.kind === "office" ? `${h.name} (${h.people.length ? h.people.map((p) => p.name).join(", ") : "vacant"})` : h.name))
        .join(", ")
    : "nobody";

/**
 * What the live region says when the day moves: "As of 12 October 2026. 3 jobs
 * changed holder." One change is named: "Reconcile the bank statements: Treasurer
 * (Ann Lee) to Treasurer (Bo Chen)."
 */
export function changeAnnouncement(day: string, changes: readonly MapChange[]): string {
  const head = `As of ${longDay(day)}.`;
  if (!changes.length) return head;
  if (changes.length === 1) {
    const c = changes[0]!;
    return `${head} ${c.title}: ${holderWords(c.before)} to ${holderWords(c.after)}.`;
  }
  return `${head} ${changes.length} jobs changed holder.`;
}
