// Work board plans (plan-unified-experience §4 Direct manipulation, Session 11).
// Pure: which column a request sits in, and which workflow state a drop on a
// column means. The drag, the "Move to…" menu and the keyboard all call the same
// plan, then the existing `applyTransition` writes it.
import { availableTransitions, getStateMeta, getWorkflow } from "../../app/config/requestWorkflows";

export type BoardStatus = "open" | "in_progress" | "waiting" | "resolved";

export const REQUEST_BOARD_COLUMNS: { key: BoardStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
];

type Card = { type?: string | null; status?: string | null; metadata?: Record<string, any> | null };

/** The column a request belongs in (closed requests sit with Resolved). */
export function columnOf(r: Card): BoardStatus {
  const s = r.status === "closed" ? "resolved" : r.status;
  return (REQUEST_BOARD_COLUMNS.find((c) => c.key === s)?.key ?? "open") as BoardStatus;
}

export function groupRequests<T extends Card>(rows: readonly T[]): Record<BoardStatus, T[]> {
  const out = { open: [], in_progress: [], waiting: [], resolved: [] } as Record<BoardStatus, T[]>;
  for (const r of rows) out[columnOf(r)].push(r);
  return out;
}

/**
 * The state a drop on `to` means for this request, or null when its workflow has
 * no one-step board transition into that column. Never invents a transition.
 */
export function planBoardMove(r: Card, to: BoardStatus): { state: string; label: string } | null {
  if (columnOf(r) === to) return null;
  const wf = getWorkflow(r.type);
  const from = (r.metadata?.workflow_state as string) || wf.initialState;
  const hit = availableTransitions(r.type, from, { isBoard: true, isSubmitter: true, isAssignee: true }).find(
    (t) => getStateMeta(r.type, t.to).status === to
  );
  return hit ? { state: hit.to, label: hit.label } : null;
}

/** Columns a request can be moved to from where it is (for the "Move to…" menu). */
export function moveTargets(r: Card): { key: BoardStatus; label: string; state: string }[] {
  return REQUEST_BOARD_COLUMNS.flatMap((c) => {
    const p = planBoardMove(r, c.key);
    return p ? [{ key: c.key, label: c.label, state: p.state }] : [];
  });
}
