import { vendorEndsOn, type VendorDates } from "../vendors/contract-end";
// What the board and team homes draw (docs/plan-unified-experience.md §5):
// pure shaping of tasks, vendors and approvals the app already reads.

export interface HomeTask {
  id: string;
  title?: string | null;
  status?: string | null;
  due_date?: string | null;
  parent_task?: string | null;
}

export const taskDone = (t: HomeTask) => t.status === "completed";

/** Open tasks first by due date (undated last), then by title: "my tasks". */
export function myOpenTasks<T extends HomeTask>(tasks: readonly T[]): T[] {
  return tasks
    .filter((t) => !taskDone(t))
    .sort((a, b) => {
      const da = a.due_date ? Date.parse(a.due_date) : Infinity;
      const db = b.due_date ? Date.parse(b.due_date) : Infinity;
      return da === db ? String(a.title ?? "").localeCompare(String(b.title ?? "")) : da < db ? -1 : 1;
    });
}

/** The team `Ring`: tasks done against tasks held. */
export function teamProgress(tasks: readonly HomeTask[]): { done: number; total: number } {
  return { done: tasks.filter(taskDone).length, total: tasks.length };
}

export interface WeekDay {
  /** YYYY-MM-DD */
  date: string;
  /** Mon, Tue, … */
  label: string;
  /** Open tasks due that day. */
  due: number;
}

/** Seven days from `asOf` (UTC dates), with the open tasks due on each. */
export function weekStrip(tasks: readonly HomeTask[], asOf: Date): WeekDay[] {
  const start = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    return {
      date,
      label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      due: tasks.filter((t) => !taskDone(t) && t.due_date?.slice(0, 10) === date).length,
    };
  });
}

export interface HomeVendor extends VendorDates {
  status?: string | null;
}

/**
 * The `Heatstrip` values for a year: one count per day a vendor's contract or
 * cover ends (`contract_end`, else the older `active_until`).
 */
export function vendorEndDays(vendors: readonly HomeVendor[], year: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vendors) {
    const day = vendorEndsOn(v);
    if (v.status === "archived" || !day) continue;
    if (Number(day.slice(0, 4)) === year) out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}
