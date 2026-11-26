import { describe, expect, it } from "vitest";
import { myOpenTasks, teamProgress, vendorEndDays, weekStrip } from "#core/shared/home/board-team-home";
import { overdueProjectCount, teamQueueRows, unassignedJobCount } from "#core/shared/home/team-queue";

const t = (id: string, status: string, due?: string) => ({ id, title: id, status, due_date: due ?? null });

describe("board and team home", () => {
  it("orders open tasks by due date, undated last, and drops done ones", () => {
    const rows = [t("c", "new"), t("b", "new", "2026-12-02"), t("a", "in_progress", "2026-11-25"), t("d", "completed", "2026-11-01")];
    expect(myOpenTasks(rows).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("counts done against held", () => {
    expect(teamProgress([t("a", "completed"), t("b", "new")])).toEqual({ done: 1, total: 2 });
    expect(teamProgress([])).toEqual({ done: 0, total: 0 });
  });

  it("builds seven days from today with open tasks due on each", () => {
    const days = weekStrip([t("a", "new", "2026-11-22"), t("b", "completed", "2026-11-22"), t("c", "new", "2026-12-30")], new Date("2026-11-21T10:00:00Z"));
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: "2026-11-21", label: "Sat", due: 0 });
    expect(days[1].due).toBe(1);
  });

  it("counts vendor end dates in the year, skipping archived and other years", () => {
    expect(vendorEndDays([{ active_until: "2026-12-31" }, { active_until: "2026-12-31" }, { active_until: "2027-01-02" }, { active_until: "2026-03-01", status: "archived" }, {}], 2026)).toEqual({ "2026-12-31": 2 });
  });
  it("counts a vendor on its contract end, before the older active_until", () => {
    expect(vendorEndDays([{ contract_end: "2026-06-30", active_until: "2026-12-31" }, { contract_end: "2026-06-30" }], 2026)).toEqual({ "2026-06-30": 2 });
  });
});

describe("team queue", () => {
  it("lists only helper areas that have a queue, with counts and plurals", () => {
    const rows = teamQueueRows(["documents", "feedback", "inquiries"], { documents: 2, feedback: 1 });
    expect(rows.map((r) => r.text)).toEqual(["2 draft documents", "1 open poll"]);
    expect(rows[0].path).toBe("/admin/documents");
  });
  it("shows zero for a queue with nothing waiting", () => {
    expect(teamQueueRows(["documents"], {})[0].text).toBe("0 draft documents");
  });
});

describe("team queue states", () => {
  it("an open project past its due date is overdue; done, undated and future ones are not", () => {
    const rows = [
      { status: "active", due_date: "2026-11-20" },
      { status: "on_hold", due_date: "2026-11-25T00:00:00" },
      { status: "completed", due_date: "2026-11-01" },
      { status: "active", due_date: "2026-12-01" },
      { status: "planning", due_date: null },
    ];
    expect(overdueProjectCount(rows, "2026-11-26")).toBe(2);
  });
  it("a job nobody holds is unassigned unless retired", () => {
    expect(unassignedJobCount([{ status: "active", holders: [] }, { status: "retired", holders: [] }, { status: "active", holders: [{}] }, { status: "disputed" }])).toBe(2);
  });
  it("projects and responsibilities helpers get their rows", () => {
    expect(teamQueueRows(["projects", "responsibilities"], { projects: 1, responsibilities: 3 }).map((r) => r.text)).toEqual(["1 overdue project", "3 unassigned jobs"]);
  });
});
