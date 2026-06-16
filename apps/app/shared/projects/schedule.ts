/**
 * Project timeline date math — shared between server routes and client
 * composables so the schedule is computed identically everywhere.
 *
 * Durations are in BUSINESS DAYS (Mon–Fri); weekends don't count. This
 * mirrors how Earnest's timeline reads ("a 5-day phase" = one work week).
 */

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD (or ISO) string to a UTC Date at midnight, or null. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True for Saturday (6) / Sunday (0) in UTC. */
export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Add `businessDays` working days to a start date and return the resulting
 * date (YYYY-MM-DD). A duration of 1 means the work finishes the same day
 * it starts (a single working day), so we advance `businessDays - 1` working
 * days from the start. Returns null when inputs are unusable.
 *
 *   computeEndDate("2026-06-11", 1) -> "2026-06-11" (Thu)
 *   computeEndDate("2026-06-11", 2) -> "2026-06-12" (Fri)
 *   computeEndDate("2026-06-11", 3) -> "2026-06-15" (skips the weekend → Mon)
 */
export function computeEndDate(
  startDate: string | null | undefined,
  businessDays: number | null | undefined
): string | null {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  const days = Number(businessDays);
  if (!Number.isFinite(days) || days < 1) return toDateOnly(start);

  // If the start lands on a weekend, roll forward to the next working day
  // before counting — the phase can't begin on a Saturday.
  let cursor = new Date(start.getTime());
  while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + MS_PER_DAY);

  let remaining = Math.floor(days) - 1;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
    if (!isWeekend(cursor)) remaining--;
  }
  return toDateOnly(cursor);
}

/** Count of calendar days an event spans (inclusive), for timeline widths. */
export function spanDays(startDate: string | null | undefined, endDate: string | null | undefined): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
}

/** Return the first working day strictly AFTER the given date (YYYY-MM-DD). */
export function nextBusinessDay(dateStr: string | null | undefined): string | null {
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  let cursor = new Date(d.getTime() + MS_PER_DAY);
  while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + MS_PER_DAY);
  return toDateOnly(cursor);
}

// ── Dependency cascade ───────────────────────────────────────────────────────

/** Minimal shape the cascade needs from an event. */
export interface ScheduleEvent {
  id: string;
  title?: string | null;
  event_date?: string | null;
  duration_days?: number | null;
  end_date?: string | null;
  /** Upstream event id (M2O), or the row/object/null. */
  depends_on?: string | { id: string } | null;
}

/** One row of the reschedule confirmation diff. */
export interface ScheduleShift {
  id: string;
  title?: string | null;
  oldStart: string | null;
  newStart: string | null;
  oldEnd: string | null;
  newEnd: string | null;
}

function dependsOnId(ev: ScheduleEvent): string | null {
  const d = ev.depends_on;
  if (!d) return null;
  return typeof d === "string" ? d : d.id ?? null;
}

/**
 * Compute every date shift that follows from editing one event's start and/or
 * duration. A dependent event (one whose `depends_on` points at a shifted
 * event) is pushed so it starts the next business day AFTER its dependency
 * ends — but only ever forward; we never pull a milestone earlier than the
 * dates already on it. The cascade is transitive and cycle-safe.
 *
 * The edited event is the first entry in the returned diff (when its own dates
 * change). Events without a start date can't be positioned and are skipped.
 * The array is empty when nothing actually moves.
 */
export function computeDependencyShifts(
  events: ScheduleEvent[],
  editedId: string,
  newStart: string | null | undefined,
  newDurationDays: number | null | undefined
): ScheduleShift[] {
  const byId = new Map<string, ScheduleEvent>();
  for (const e of events) byId.set(e.id, e);
  const edited = byId.get(editedId);
  if (!edited) return [];

  // Resolved (possibly shifted) start/end per event id.
  const start = new Map<string, string | null>();
  const end = new Map<string, string | null>();
  for (const e of events) {
    start.set(e.id, e.event_date ?? null);
    end.set(e.id, e.end_date ?? (e.event_date ? computeEndDate(e.event_date, e.duration_days ?? 1) : null));
  }

  const shifts = new Map<string, ScheduleShift>();
  const recordIfMoved = (e: ScheduleEvent, ns: string | null, ne: string | null) => {
    const os = e.event_date ?? null;
    const oe = e.end_date ?? (os ? computeEndDate(os, e.duration_days ?? 1) : null);
    start.set(e.id, ns);
    end.set(e.id, ne);
    if (ns !== os || ne !== oe) {
      shifts.set(e.id, { id: e.id, title: e.title ?? null, oldStart: os, newStart: ns, oldEnd: oe, newEnd: ne });
    } else {
      shifts.delete(e.id);
    }
  };

  // Apply the user's edit to the edited event first.
  const editedStart = newStart ?? null;
  const editedDur = newDurationDays ?? edited.duration_days ?? 1;
  recordIfMoved(edited, editedStart, editedStart ? computeEndDate(editedStart, editedDur) : null);

  // Adjacency: dependency id → dependents.
  const dependents = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    const dep = dependsOnId(e);
    if (dep) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(e);
    }
  }

  // Breadth-first propagation, bounded to avoid pathological cycles.
  const queue: string[] = [editedId];
  const visits = new Map<string, number>();
  while (queue.length) {
    const cur = queue.shift()!;
    const visited = (visits.get(cur) ?? 0) + 1;
    visits.set(cur, visited);
    if (visited > events.length + 1) continue; // cycle guard

    const curEnd = end.get(cur) ?? null;
    if (!curEnd) continue;
    const earliest = nextBusinessDay(curEnd);
    if (!earliest) continue;

    for (const dep of dependents.get(cur) ?? []) {
      const depStart = start.get(dep.id) ?? null;
      // Only push forward — never pull a dependent earlier than it already is.
      if (depStart && depStart >= earliest) continue;
      const dur = dep.duration_days ?? 1;
      recordIfMoved(dep, earliest, computeEndDate(earliest, dur));
      queue.push(dep.id);
    }
  }

  // Edited event first, then the rest in event order.
  const order = new Map(events.map((e, i) => [e.id, i] as const));
  return [...shifts.values()].sort((a, b) => {
    if (a.id === editedId) return -1;
    if (b.id === editedId) return 1;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}
