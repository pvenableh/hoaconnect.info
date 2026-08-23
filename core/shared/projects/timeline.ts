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
 * Pure by design — no auto-imports, no Directus, no Date.now() beyond what the
 * caller passes. Lives in `shared/` so the app and the Nitro server both get it.
 */

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
