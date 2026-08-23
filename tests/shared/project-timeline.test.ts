import { describe, it, expect } from "vitest";
import {
  eventProgress,
  projectOpensOnTimeline,
  isScheduled,
  listOpensOnTimeline,
  TIMELINE_MIN_DATED,
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
