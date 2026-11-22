/**
 * Timeline-view decisions, shared and pure.
 *
 * Two questions live here, both of which used to be inline template logic in
 * three different files:
 *
 *   1. Is this worth OPENING on? The Gantt is the best thing on a project page
 *      — dependency connectors, drag-to-reschedule, approvals — and it sat
 *      behind the third of four tabs, so most people never saw it. Defaulting
 *      to it needs a rule, and the rule needs a test.
 *   2. How far along is a phase? A bar's LENGTH is when the work happens; its
 *      FILL is how much of it is done. Those are different facts and the chart
 *      should say both.
 *
 * Session 12 adds the drag maths: a pixel distance becomes whole days, and a
 * move or an edge-resize becomes the start and business-day duration the
 * existing reschedule route already takes. Dragging never invents a new write.
 *
 * Pure by design — no auto-imports, no Directus, no Date.now() beyond what the
 * caller passes. Lives in `shared/` so the app and the Nitro server both get it.
 */

import {
  computeEndDate,
  isWeekend,
  parseDateOnly,
  toDateOnly,
} from "./schedule";

const MS_DAY = 86_400_000;

/** The minimum an event has to expose for these rules. */
export interface TimelineEventLike {
  status?: string | null;
  event_date?: string | null;
  tasks?: { status?: string | null }[] | null;
}

/** The minimum a project has to expose for these rules. */
export interface TimelineProjectLike {
  status?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  events?: TimelineEventLike[] | null;
}

/**
 * One bar on a date axis is a fact, not a timeline — Overview says it better,
 * and a board column says it better still. Two is where a schedule starts
 * having a shape.
 */
export const TIMELINE_MIN_DATED = 2;

export interface EventProgress {
  done: number;
  total: number;
  /** 0–100. */
  pct: number;
}

/**
 * Task completion for one phase, or null when it has no tasks.
 *
 * Null is not zero. An empty bar reads as "nothing has been done"; the truth
 * for a phase with no task list is "nobody is tracking it that way", and the
 * chart must not confuse the two — callers draw the solid bar for null.
 *
 * A phase marked completed is 100% regardless of its checkboxes: the person who
 * closed it outranks a task somebody forgot to tick.
 */
export function eventProgress(e: TimelineEventLike): EventProgress | null {
  const tasks = e.tasks || [];
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct =
    e.status === "completed" ? 100 : Math.round((done / tasks.length) * 100);
  return { done, total: tasks.length, pct };
}

/** Does this project have enough dated milestones to be worth opening on? */
export function projectOpensOnTimeline(
  project: TimelineProjectLike | null | undefined,
): boolean {
  if (!project) return false;
  const dated = (project.events || []).filter((e) => !!e.event_date).length;
  return dated >= TIMELINE_MIN_DATED;
}

/** Is this project positioned on a date axis at all? */
export function isScheduled(p: TimelineProjectLike): boolean {
  return Boolean(
    p.start_date || p.due_date || (p.events || []).some((e) => !!e.event_date),
  );
}

/**
 * Does the org-wide projects list open on the timeline?
 *
 * Archived projects don't count. An archive full of finished, fully dated work
 * would otherwise decide where today's work opens, which is backwards.
 */
export function listOpensOnTimeline(
  projects: TimelineProjectLike[] | null | undefined,
): boolean {
  const scheduled = (projects || []).filter(
    (p) => p.status !== "archived" && isScheduled(p),
  ).length;
  return scheduled >= TIMELINE_MIN_DATED;
}

// ── Drag maths ───────────────────────────────────────────────────────────────

export interface BarEventLike {
  event_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
}

export interface BarPlan {
  /** New start, YYYY-MM-DD. */
  start: string;
  /** New length in business days (>= 1). */
  duration: number;
}

/** Whole days for a pointer distance; 0 when the drag was a nudge, not a move. */
export function daysFromPixels(px: number, pxPerDay: number): number {
  if (!Number.isFinite(px) || !(pxPerDay > 0)) return 0;
  const d = Math.round(px / pxPerDay);
  return d === 0 ? 0 : d;
}

/** Calendar-day offset of a YYYY-MM-DD date, or null when unparseable. */
export function addCalendarDays(date: string | null | undefined, days: number): string | null {
  const d = parseDateOnly(date);
  if (!d) return null;
  return toDateOnly(new Date(d.getTime() + Math.trunc(days) * MS_DAY));
}

/** Working days from start to end, both included; 1 when end is not after start. */
export function businessDaysInclusive(start: string, end: string): number {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (!s || !e || e.getTime() <= s.getTime()) return 1;
  let n = 0;
  for (let t = s.getTime(); t <= e.getTime(); t += MS_DAY) {
    if (!isWeekend(new Date(t))) n++;
  }
  return Math.max(1, n);
}

/** The bar's current end: its stored end, else start plus duration. */
function currentEnd(e: BarEventLike): string | null {
  if (!e.event_date) return null;
  return e.end_date || computeEndDate(e.event_date, e.duration_days ?? 1);
}

/** Move the whole bar by `days` calendar days; length is kept. Null = no change. */
export function planBarMove(e: BarEventLike, days: number): BarPlan | null {
  if (!days || !e.event_date) return null;
  const start = addCalendarDays(e.event_date, days);
  if (!start) return null;
  return { start, duration: e.duration_days ?? businessDaysInclusive(e.event_date, currentEnd(e) || e.event_date) };
}

/** Drag the right edge by `days` calendar days; start is kept. Null = no change. */
export function planBarResize(e: BarEventLike, days: number): BarPlan | null {
  if (!days || !e.event_date) return null;
  const end = currentEnd(e);
  const newEnd = addCalendarDays(end, days);
  if (!newEnd) return null;
  const duration = businessDaysInclusive(e.event_date, newEnd);
  if (duration === (e.duration_days ?? businessDaysInclusive(e.event_date, end || e.event_date))) return null;
  return { start: e.event_date, duration };
}

/**
 * Keyboard equivalent of a drag. Arrow keys nudge the bar a day; Shift+Arrow
 * moves its right edge a day. Anything else is not ours.
 */
export function barKeyAction(
  key: string,
  shift: boolean,
): { kind: "move" | "resize"; days: number } | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  return { kind: shift ? "resize" : "move", days: key === "ArrowRight" ? 1 : -1 };
}
