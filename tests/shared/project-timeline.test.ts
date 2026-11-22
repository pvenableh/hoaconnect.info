import { describe, it, expect } from "vitest";
import {
  eventProgress,
  projectOpensOnTimeline,
  isScheduled,
  listOpensOnTimeline,
  TIMELINE_MIN_DATED,
  daysFromPixels,
  addCalendarDays,
  businessDaysInclusive,
  planBarMove,
  planBarResize,
  barKeyAction,
} from "#core/shared/projects/timeline";

describe("eventProgress", () => {
  it("returns null for a phase with no tasks — null is not zero", () => {
    // An empty bar would read as "nothing has been done". The truth is "nobody
    // is tracking it that way", and the Gantt draws a solid bar for null.
    expect(eventProgress({ status: "pending", tasks: [] })).toBeNull();
    expect(eventProgress({ status: "pending" })).toBeNull();
  });

  it("counts completed tasks against the total", () => {
    expect(
      eventProgress({
        tasks: [{ status: "completed" }, { status: "completed" }, { status: "todo" }, { status: "todo" }],
      })
    ).toEqual({ done: 2, total: 4, pct: 50 });
  });

  it("rounds rather than truncating", () => {
    expect(eventProgress({ tasks: [{ status: "completed" }, {}, {}] })?.pct).toBe(33);
    expect(eventProgress({ tasks: [{ status: "completed" }, { status: "completed" }, {}] })?.pct).toBe(67);
  });

  it("a completed phase is 100% even with tasks left open", () => {
    // Whoever closed the phase outranks a checkbox nobody ticked.
    const p = eventProgress({ status: "completed", tasks: [{ status: "todo" }, { status: "todo" }] });
    expect(p).toEqual({ done: 0, total: 2, pct: 100 });
  });
});

describe("projectOpensOnTimeline", () => {
  it("needs two dated events — one bar is a fact, not a timeline", () => {
    expect(projectOpensOnTimeline({ events: [{ event_date: "2026-06-01" }] })).toBe(false);
    expect(
      projectOpensOnTimeline({ events: [{ event_date: "2026-06-01" }, { event_date: "2026-07-01" }] })
    ).toBe(true);
  });

  it("ignores events with no date", () => {
    expect(
      projectOpensOnTimeline({ events: [{ event_date: "2026-06-01" }, { event_date: null }, {}] })
    ).toBe(false);
  });

  it("is false for a project with no events at all, and for nothing", () => {
    expect(projectOpensOnTimeline({})).toBe(false);
    expect(projectOpensOnTimeline(null)).toBe(false);
    expect(projectOpensOnTimeline(undefined)).toBe(false);
  });
});

describe("isScheduled", () => {
  it("counts a start date, a due date, or any dated event", () => {
    expect(isScheduled({ start_date: "2026-06-01" })).toBe(true);
    expect(isScheduled({ due_date: "2026-06-01" })).toBe(true);
    expect(isScheduled({ events: [{ event_date: "2026-06-01" }] })).toBe(true);
  });

  it("is false for a project with no dates anywhere", () => {
    expect(isScheduled({ title: "Someday" } as any)).toBe(false);
    expect(isScheduled({ events: [{ event_date: null }] })).toBe(false);
  });
});

describe("listOpensOnTimeline", () => {
  it("needs two scheduled projects", () => {
    expect(listOpensOnTimeline([{ due_date: "2026-06-01" }])).toBe(false);
    expect(listOpensOnTimeline([{ due_date: "2026-06-01" }, { start_date: "2026-07-01" }])).toBe(true);
  });

  it("does not count archived projects", () => {
    // An archive full of finished, fully dated work shouldn't decide where
    // today's work opens.
    expect(
      listOpensOnTimeline([
        { status: "archived", due_date: "2025-01-01" },
        { status: "archived", due_date: "2025-02-01" },
        { status: "active", due_date: "2026-06-01" },
      ])
    ).toBe(false);
  });

  it("does not count projects with no dates", () => {
    expect(
      listOpensOnTimeline([{ status: "active" }, { status: "active" }, { status: "active", due_date: "2026-06-01" }])
    ).toBe(false);
  });

  it("is false for an empty or missing list", () => {
    expect(listOpensOnTimeline([])).toBe(false);
    expect(listOpensOnTimeline(null)).toBe(false);
  });

  it("both rules share one threshold", () => {
    expect(TIMELINE_MIN_DATED).toBe(2);
  });
});

describe("bar drag maths", () => {
  it("turns pixels into whole days and ignores a nudge", () => {
    expect(daysFromPixels(36, 18)).toBe(2);
    expect(daysFromPixels(-27, 18)).toBe(-1);
    expect(daysFromPixels(5, 18)).toBe(0);
    expect(daysFromPixels(10, 0)).toBe(0);
  });

  it("adds calendar days across a month end", () => {
    expect(addCalendarDays("2026-06-29", 3)).toBe("2026-07-02");
    expect(addCalendarDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addCalendarDays(null, 1)).toBeNull();
  });

  it("counts working days inclusive of both ends", () => {
    expect(businessDaysInclusive("2026-06-11", "2026-06-11")).toBe(1);
    expect(businessDaysInclusive("2026-06-11", "2026-06-15")).toBe(3); // Thu Fri Mon
  });

  it("moves a bar and keeps its length", () => {
    const e = { event_date: "2026-06-11", duration_days: 3, end_date: "2026-06-15" };
    expect(planBarMove(e, 7)).toEqual({ start: "2026-06-18", duration: 3 });
    expect(planBarMove(e, 0)).toBeNull();
    expect(planBarMove({ event_date: null }, 2)).toBeNull();
  });

  it("resizes by the right edge and never goes below one day", () => {
    const e = { event_date: "2026-06-11", duration_days: 3, end_date: "2026-06-15" };
    expect(planBarResize(e, 1)).toEqual({ start: "2026-06-11", duration: 4 });
    expect(planBarResize(e, -30)).toEqual({ start: "2026-06-11", duration: 1 });
    // Dragging the edge over a weekend changes no working day.
    expect(planBarResize({ event_date: "2026-06-11", duration_days: 2, end_date: "2026-06-12" }, 1)).toBeNull();
  });

  it("maps arrow keys to a one-day move, Shift to a resize", () => {
    expect(barKeyAction("ArrowRight", false)).toEqual({ kind: "move", days: 1 });
    expect(barKeyAction("ArrowLeft", false)).toEqual({ kind: "move", days: -1 });
    expect(barKeyAction("ArrowRight", true)).toEqual({ kind: "resize", days: 1 });
    expect(barKeyAction("Enter", false)).toBeNull();
  });
});
