import { describe, it, expect } from "vitest";
import {
  requestWorkflows,
  requestTypeList,
  getWorkflow,
  getStateMeta,
  availableTransitions,
  type RequestWorkflow,
} from "~/config/requestWorkflows";

const ACTOR_NONE = { isBoard: false, isSubmitter: false, isAssignee: false };
const ACTOR_BOARD = { isBoard: true, isSubmitter: false, isAssignee: false };
const ACTOR_SUBMITTER = { isBoard: false, isSubmitter: true, isAssignee: false };
const ACTOR_ASSIGNEE = { isBoard: false, isSubmitter: false, isAssignee: true };

/** All state values reachable from the workflow's initial state. */
function reachableStates(wf: RequestWorkflow): Set<string> {
  const seen = new Set<string>([wf.initialState]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of wf.transitions) {
      if (seen.has(t.from) && !seen.has(t.to)) {
        seen.add(t.to);
        grew = true;
      }
    }
  }
  return seen;
}

describe("requestWorkflows config integrity", () => {
  const workflows = Object.values(requestWorkflows);

  it("exposes every workflow through requestTypeList", () => {
    expect(requestTypeList).toHaveLength(workflows.length);
  });

  for (const wf of workflows) {
    describe(`workflow: ${wf.type}`, () => {
      const stateValues = new Set(wf.states.map((s) => s.value));

      it("declares a valid initial state", () => {
        expect(stateValues.has(wf.initialState)).toBe(true);
      });

      it("only transitions between declared states", () => {
        for (const t of wf.transitions) {
          expect(stateValues.has(t.from), `${wf.type}: from "${t.from}"`).toBe(true);
          expect(stateValues.has(t.to), `${wf.type}: to "${t.to}"`).toBe(true);
        }
      });

      it("terminal states have no outgoing transitions", () => {
        const terminals = wf.states.filter((s) => s.terminal).map((s) => s.value);
        expect(terminals.length).toBeGreaterThan(0);
        for (const t of wf.transitions) {
          expect(terminals, `${wf.type}: terminal "${t.from}" has outgoing transition`).not.toContain(t.from);
        }
      });

      it("a terminal state is reachable from the initial state", () => {
        const reachable = reachableStates(wf);
        const terminals = wf.states.filter((s) => s.terminal).map((s) => s.value);
        expect(terminals.some((s) => reachable.has(s))).toBe(true);
      });

      it("every declared state is reachable (no orphans)", () => {
        const reachable = reachableStates(wf);
        for (const s of wf.states) {
          expect(reachable.has(s.value), `${wf.type}: state "${s.value}" unreachable`).toBe(true);
        }
      });

      it("states map onto the shared stored lifecycle", () => {
        for (const s of wf.states) {
          expect(["open", "in_progress", "waiting", "resolved", "closed"]).toContain(s.status);
        }
      });
    });
  }
});

describe("getWorkflow", () => {
  it("returns the matching workflow", () => {
    expect(getWorkflow("arc").type).toBe("arc");
  });

  it("falls back to task for unknown or missing types", () => {
    expect(getWorkflow("nonsense").type).toBe("task");
    expect(getWorkflow(null).type).toBe("task");
    expect(getWorkflow(undefined).type).toBe("task");
  });
});

describe("getStateMeta", () => {
  it("resolves a state's metadata", () => {
    expect(getStateMeta("violation", "cure_period").label).toBe("Cure Period");
  });

  it("falls back to the first state for unknown values", () => {
    expect(getStateMeta("maintenance", "bogus").value).toBe("open");
    expect(getStateMeta("maintenance", null).value).toBe("open");
  });
});

describe("availableTransitions role gating", () => {
  it("returns nothing for an actor with no roles on board-only transitions", () => {
    expect(availableTransitions("violation", "reported", ACTOR_NONE)).toHaveLength(0);
  });

  it("lets the board perform board transitions", () => {
    const ts = availableTransitions("violation", "reported", ACTOR_BOARD);
    expect(ts.map((t) => t.to)).toContain("notice_sent");
  });

  it("board can also act as submitter and assignee (superset)", () => {
    // maintenance assigned → in_progress is an assignee transition
    const ts = availableTransitions("maintenance", "assigned", ACTOR_BOARD);
    expect(ts.map((t) => t.to)).toContain("in_progress");
  });

  it("assignee can perform assignee transitions but not board ones", () => {
    const ts = availableTransitions("maintenance", "resolved", ACTOR_ASSIGNEE);
    // resolved → closed and resolved → in_progress are both board-only
    expect(ts).toHaveLength(0);
    const start = availableTransitions("maintenance", "assigned", ACTOR_ASSIGNEE);
    expect(start.map((t) => t.to)).toContain("in_progress");
  });

  it("submitter gets submitter transitions only", () => {
    // no submitter transitions exist in maintenance; sanity-check none leak
    const ts = availableTransitions("maintenance", "open", ACTOR_SUBMITTER);
    expect(ts).toHaveLength(0);
  });

  it("defaults to the initial state when current state is missing", () => {
    const ts = availableTransitions("arc", null, ACTOR_BOARD);
    expect(ts.map((t) => t.to)).toContain("under_review");
  });

  it("terminal states offer no transitions to anyone", () => {
    expect(availableTransitions("arc", "completed", ACTOR_BOARD)).toHaveLength(0);
  });
});
