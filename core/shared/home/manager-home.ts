// What the property manager's home draws (docs/plan-unified-experience.md §5):
// the delegated queue, the load bars and the response-time sparkline. Pure
// shaping of `hoa_requests` rows the manager already reads, so the tests need
// no network.
import { areaLabel, type AreaKey } from "../transition/grants";

export interface ManagerRequest {
  id: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  priority?: string | null;
  assigned_to?: { id?: string; first_name?: string; last_name?: string } | string | null;
  date_created?: string | null;
  date_updated?: string | null;
}

/** The manager area that works each request type (matches the inquiries page). */
export function areaForType(type: string | null | undefined): AreaKey {
  return type === "violation" ? "violations" : "inquiries";
}

export const isOpenStatus = (s: string | null | undefined) => s !== "resolved" && s !== "closed";

/**
 * The queue across the areas this manager can work, oldest first. `canWork`
 * answers per area (RoleContext.areas[k].canWork), so a grant that is switched
 * off hides that area's rows.
 */
export function delegatedQueue<T extends ManagerRequest>(
  rows: readonly T[],
  canWork: (area: AreaKey) => boolean,
): T[] {
  return rows
    .filter((r) => isOpenStatus(r.status) && canWork(areaForType(r.type)))
    .sort((a, b) => Date.parse(a.date_created ?? "") - Date.parse(b.date_created ?? "") || 0);
}

export interface LoadBar {
  area: AreaKey;
  label: string;
  open: number;
}

/** Open items per delegated area, busiest first; areas with nothing open are kept at 0. */
export function loadByArea(queue: readonly ManagerRequest[], areas: readonly AreaKey[]): LoadBar[] {
  const counts = new Map<AreaKey, number>(areas.map((a) => [a, 0]));
  for (const r of queue) {
    const a = areaForType(r.type);
    if (counts.has(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts]
    .map(([area, open]) => ({ area, label: areaLabel(area), open }))
    .sort((a, b) => b.open - a.open);
}

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

/**
 * Average hours from created to last update for requests that are now resolved
 * or closed, bucketed by the week they finished, oldest first (the Sparkline's
 * values). There is no first-response timestamp, so the last update stands in.
 * A week with nothing finished carries the previous value, 0 before any.
 */
export function responseHoursSeries(rows: readonly ManagerRequest[], asOf: Date, weeks = 8): number[] {
  const end = asOf.getTime();
  const sums = new Array<number>(weeks).fill(0);
  const counts = new Array<number>(weeks).fill(0);
  for (const r of rows) {
    if (isOpenStatus(r.status)) continue;
    const made = Date.parse(r.date_created ?? "");
    const done = Date.parse(r.date_updated ?? "");
    if (!Number.isFinite(made) || !Number.isFinite(done) || done < made || done > end) continue;
    const idx = weeks - 1 - Math.floor((end - done) / WEEK);
    if (idx < 0) continue;
    sums[idx] += (done - made) / HOUR;
    counts[idx] += 1;
  }
  const out: number[] = [];
  let last = 0;
  for (let i = 0; i < weeks; i++) {
    last = counts[i] ? Math.round(sums[i] / counts[i]) : last;
    out.push(last);
  }
  return out;
}

export interface CommunityRequest extends ManagerRequest {
  organization?: string | { id?: string } | null;
}

export interface CommunityLoad {
  id: string;
  name: string;
  open: number;
}

const orgOf = (r: CommunityRequest) => (typeof r.organization === "object" ? r.organization?.id : r.organization) ?? "";

/**
 * Open items per community the manager works, busiest first; a community with
 * nothing open stays at 0. `canWork` limits which areas count (the same switch
 * the queue uses), so a grant that is off adds nothing to the bar.
 */
export function loadByCommunity(
  rows: readonly CommunityRequest[],
  communities: readonly { id: string; name: string }[],
  canWork: (area: AreaKey) => boolean = () => true,
): CommunityLoad[] {
  const counts = new Map<string, number>(communities.map((c) => [c.id, 0]));
  for (const r of rows) {
    if (!isOpenStatus(r.status) || !canWork(areaForType(r.type))) continue;
    const id = orgOf(r);
    if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return communities
    .map((c) => ({ id: c.id, name: c.name, open: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

export interface Assignee {
  /** Directus user id, or "" for unassigned. */
  id: string;
  name: string;
}

/** The people a request can be handed to, "Unassigned" last; duplicates by user id are dropped. */
export function assigneeOptions(
  people: readonly { id?: string | null; first_name?: string | null; last_name?: string | null }[],
): Assignee[] {
  const seen = new Set<string>();
  const out: Assignee[] = [];
  for (const p of people) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed" });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  out.push({ id: "", name: "Unassigned" });
  return out;
}
