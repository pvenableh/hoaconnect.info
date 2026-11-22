import { describe, it, expect } from "vitest";
import { columnOf, groupRequests, planBoardMove, moveTargets } from "#core/shared/requests/board";

const m = (state: string, status: string) => ({ type: "maintenance", status, metadata: { workflow_state: state } });

describe("request board plans", () => {
  it("places requests in columns; closed rides with Resolved", () => {
    expect(columnOf(m("open", "open"))).toBe("open");
    expect(columnOf(m("closed", "closed"))).toBe("resolved");
    const g = groupRequests([m("open", "open"), m("assigned", "in_progress"), m("resolved", "resolved")]);
    expect([g.open.length, g.in_progress.length, g.waiting.length, g.resolved.length]).toEqual([1, 1, 0, 1]);
  });
  it("plans a one-step transition into a column", () => {
    expect(planBoardMove(m("open", "open"), "in_progress")).toEqual({ state: "assigned", label: "Assign" });
    expect(planBoardMove(m("resolved", "resolved"), "in_progress")?.state).toBe("in_progress");
  });
  it("refuses a drop with no transition, or onto its own column", () => {
    expect(planBoardMove(m("open", "open"), "resolved")).toBeNull();
    expect(planBoardMove(m("open", "open"), "open")).toBeNull();
    expect(planBoardMove(m("open", "open"), "waiting")).toBeNull();
  });
  it("Move to… lists exactly the columns a drag could reach", () => {
    expect(moveTargets(m("open", "open")).map((t) => t.key)).toEqual(["in_progress"]);
    expect(moveTargets(m("in_progress", "in_progress")).map((t) => t.key)).toEqual(["resolved"]);
  });
});
