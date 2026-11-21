// The team home's "items in my area's queue" (docs/plan-unified-experience.md
// §5): one row per helper area the person works, with what is waiting there.
// Pure; the component reads the counts.
import { areaLabel, type AreaKey } from "../transition/grants";

/** Where each helper area's waiting items are worked, and what "waiting" means. */
export const TEAM_QUEUE_AREAS: Partial<Record<AreaKey, { noun: string; path: string }>> = {
  documents: { noun: "draft document", path: "/admin/documents" },
  feedback: { noun: "open poll", path: "/polls" },
};

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
