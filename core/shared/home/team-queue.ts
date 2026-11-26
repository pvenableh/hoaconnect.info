// The team home's "items in my area's queue" (docs/plan-unified-experience.md
// §5): one row per helper area the person works, with what is waiting there.
// Pure; the component reads the counts.
import { areaLabel, type AreaKey } from "../transition/grants";

/** Where each helper area's waiting items are worked, and what "waiting" means. */
export const TEAM_QUEUE_AREAS: Partial<Record<AreaKey, { noun: string; path: string }>> = {
  documents: { noun: "draft document", path: "/admin/documents" },
  feedback: { noun: "open poll", path: "/polls" },
  projects: { noun: "overdue project", path: "/projects" },
  responsibilities: { noun: "unassigned job", path: "/admin/responsibilities" },
};

/** Projects still open (not completed or archived) whose due date has passed. `today` is YYYY-MM-DD. */
export function overdueProjectCount(rows: readonly { status?: string | null; due_date?: string | null }[], today: string): number {
  return rows.filter((p) => !["completed", "archived"].includes(p.status ?? "") && !!p.due_date && p.due_date.slice(0, 10) < today).length;
}

/** Register jobs nobody holds, retired jobs left out. */
export function unassignedJobCount(rows: readonly { status?: string | null; holders?: readonly unknown[] | null }[]): number {
  return rows.filter((r) => r.status !== "retired" && !(r.holders?.length)).length;
}

export interface TeamQueueRow {
  area: AreaKey;
  label: string;
  count: number;
  /** "2 draft documents" */
  text: string;
  path: string;
}

/** Rows for the areas this person helps with that have a queue, in `helps` order. */
export function teamQueueRows(helps: readonly AreaKey[], counts: Partial<Record<AreaKey, number>>): TeamQueueRow[] {
  const rows: TeamQueueRow[] = [];
  for (const area of helps) {
    const def = TEAM_QUEUE_AREAS[area];
    if (!def) continue;
    const count = counts[area] ?? 0;
    rows.push({ area, label: areaLabel(area), count, text: `${count} ${def.noun}${count === 1 ? "" : "s"}`, path: def.path });
  }
  return rows;
}
