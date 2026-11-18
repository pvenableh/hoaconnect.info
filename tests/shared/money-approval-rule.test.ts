import { describe, it, expect } from "vitest";
import {
  canDecide,
  evaluateApproval,
  officeOf,
  progressLabel,
  type Decision,
  type Seat,
} from "#core/shared/money/approval-rule";

const seat = (userId: string, office: string): Seat => ({ userId, office });
const approve = (userId: string, office: string): Decision => ({ userId, decision: "approve", office });
const reject = (userId: string, office: string): Decision => ({ userId, decision: "reject", office });

// A full board: three committee officers, a vice president and a director.
const FULL = [
  seat("pres", "president"),
  seat("treas", "treasurer"),
  seat("sec", "secretary"),
  seat("vp", "vice_president"),
  seat("dir", "director"),
];

describe("committee mode", () => {
  it("needs two committee approvals when two committee members are eligible", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["dir"], decisions: [] });
    expect(v.mode).toBe("committee");
    expect(v.needed).toBe(2);
    expect(v.voters.sort()).toEqual(["pres", "sec", "treas"]);
    expect(v.state).toBe("pending");
  });

  it("is approved by two committee members", () => {
    const v = evaluateApproval({
      seats: FULL,
      excluded: ["dir"],
      decisions: [approve("pres", "president"), approve("sec", "secretary")],
    });
    expect(v.state).toBe("approved");
    expect(v.approvals).toBe(2);
  });

  it("does not let a non-committee seat count or decide", () => {
    const v = evaluateApproval({
      seats: FULL,
      excluded: ["dir"],
      decisions: [approve("pres", "president"), approve("vp", "vice_president")],
    });
    expect(v.state).toBe("pending");
    expect(v.approvals).toBe(1);
    expect(canDecide(v, "vp")).toBe(false);
    expect(canDecide(v, "treas")).toBe(true);
  });

  it("stays committee when the requester is one officer and two remain", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["treas"], decisions: [] });
    expect(v.mode).toBe("committee");
    expect(v.voters.sort()).toEqual(["pres", "sec"]);
  });
});

describe("majority mode and the fallback", () => {
  it("falls back to majority when fewer than two committee members are eligible", () => {
    const seats = [seat("pres", "president"), seat("treas", "treasurer"), seat("d1", "director"), seat("d2", "director"), seat("d3", "director")];
    const v = evaluateApproval({ seats, excluded: ["treas"], decisions: [] });
    expect(v.mode).toBe("majority");
    // 5 seats: floor(5/2) + 1 = 3. The excluded treasurer counts as a seat but cannot vote.
    expect(v.needed).toBe(3);
    expect(v.seatCount).toBe(5);
    expect(v.voters.sort()).toEqual(["d1", "d2", "d3", "pres"]);
  });

  it("uses majority on a board with no committee", () => {
    const seats = [seat("d1", "director"), seat("d2", "director"), seat("d3", "director")];
    const v = evaluateApproval({ seats, excluded: [], decisions: [approve("d1", "director"), approve("d2", "director")] });
    expect(v.mode).toBe("majority");
    expect(v.needed).toBe(2);
    expect(v.state).toBe("approved");
  });

  it("counts any seat's approval in majority mode", () => {
    const seats = [seat("pres", "president"), seat("d1", "director"), seat("d2", "director"), seat("d3", "director")];
    // 4 seats: needs 3.
    const v = evaluateApproval({
      seats,
      excluded: [],
      decisions: [approve("pres", "president"), approve("d1", "director")],
    });
    expect(v.mode).toBe("majority");
    expect(v.needed).toBe(3);
    expect(v.state).toBe("pending");
    expect(v.waitingOn.sort()).toEqual(["d2", "d3"]);
  });
});

describe("exclusion", () => {
  it("never lets the requester decide", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["pres"], decisions: [] });
    expect(canDecide(v, "pres")).toBe(false);
    expect(v.excludedSeats).toEqual(["pres"]);
  });

  it("never lets someone who reshaped the round decide, and ignores a decision they slipped in", () => {
    const v = evaluateApproval({
      seats: FULL,
      excluded: ["dir", "sec"],
      decisions: [approve("sec", "secretary"), approve("pres", "president")],
    });
    expect(canDecide(v, "sec")).toBe(false);
    expect(v.approvals).toBe(1);
    expect(v.state).toBe("pending");
  });

  it("falls to majority when excluding the reshaper leaves one committee member", () => {
    // Three seats, so no small-board allowance.
    const seats = [seat("pres", "president"), seat("treas", "treasurer"), seat("d1", "director")];
    const v = evaluateApproval({ seats, excluded: ["d1", "treas"], decisions: [] });
    expect(v.mode).toBe("majority");
    expect(v.needed).toBe(2);
    // Only the president may vote, and two approvals are needed.
    expect(v.state).toBe("cannot_approve");
  });
});

describe("one person holding two offices", () => {
  const seats = [seat("pt", "president"), seat("pt", "treasurer"), seat("sec", "secretary"), seat("d1", "director")];

  it("counts the person once", () => {
    const v = evaluateApproval({ seats, excluded: [], decisions: [] });
    expect(v.seatCount).toBe(3);
    expect(v.mode).toBe("committee");
    expect(v.voters.sort()).toEqual(["pt", "sec"]);
  });

  it("names them by their highest office", () => {
    expect(officeOf(seats, "pt")).toBe("president");
    expect(officeOf(seats, "d1")).toBe("director");
    expect(officeOf(seats, "nobody")).toBeNull();
  });

  it("gives them one vote", () => {
    const v = evaluateApproval({
      seats,
      excluded: [],
      decisions: [approve("pt", "president"), approve("pt", "treasurer")],
    });
    expect(v.approvals).toBe(1);
    expect(v.state).toBe("pending");
  });
});

describe("the rejection threshold", () => {
  it("rejects on one rejection with two eligible committee members", () => {
    const seats = [seat("pres", "president"), seat("treas", "treasurer"), seat("d1", "director")];
    const v = evaluateApproval({ seats, excluded: ["d1"], decisions: [reject("treas", "treasurer")] });
    expect(v.mode).toBe("committee");
    expect(v.state).toBe("rejected");
    expect(canDecide(v, "pres")).toBe(false);
  });

  it("stays pending after one rejection when approval is still reachable", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["dir"], decisions: [reject("sec", "secretary")] });
    expect(v.state).toBe("pending");
    expect(v.waitingOn.sort()).toEqual(["pres", "treas"]);
  });

  it("rejects once the rejections leave fewer voters than approvals still needed", () => {
    const v = evaluateApproval({
      seats: FULL,
      excluded: ["dir"],
      decisions: [reject("sec", "secretary"), approve("pres", "president"), reject("treas", "treasurer")],
    });
    expect(v.state).toBe("rejected");
    expect(v.rejections).toBe(2);
  });

  it("rejects in majority mode at the threshold", () => {
    const seats = [seat("d1", "director"), seat("d2", "director"), seat("d3", "director"), seat("d4", "director"), seat("d5", "director")];
    // Needs 3 of 5; d5 entered it, so four may vote. Two rejections leave two.
    const one = evaluateApproval({ seats, excluded: ["d5"], decisions: [reject("d1", "director")] });
    expect(one.state).toBe("pending");
    const two = evaluateApproval({ seats, excluded: ["d5"], decisions: [reject("d1", "director"), reject("d2", "director")] });
    expect(two.state).toBe("rejected");
  });
});

describe("small boards and cannot_approve", () => {
  it("lets a single seat approve what someone else entered", () => {
    const v = evaluateApproval({ seats: [seat("solo", "president")], excluded: ["admin-no-seat"], decisions: [] });
    // One seat's majority is already one: no allowance needed.
    expect(v).toMatchObject({ state: "pending", mode: "majority", needed: 1, smallBoard: false });
    expect(canDecide(v, "solo")).toBe(true);
    expect(evaluateApproval({ seats: [seat("solo", "president")], excluded: ["admin-no-seat"], decisions: [approve("solo", "president")] }).state).toBe("approved");
  });

  it("never lets a single seat approve its own entry", () => {
    const v = evaluateApproval({ seats: [seat("solo", "president")], excluded: ["solo"], decisions: [] });
    expect(v.state).toBe("cannot_approve");
    expect(canDecide(v, "solo")).toBe(false);
  });

  it("cannot approve with no seats at all", () => {
    const v = evaluateApproval({ seats: [], excluded: ["admin"], decisions: [] });
    expect(v.state).toBe("cannot_approve");
    expect(v.seatCount).toBe(0);
    expect(v.smallBoard).toBe(false);
  });

  it("lets the other seat of two approve when one seat entered it", () => {
    const v = evaluateApproval({ seats: [seat("pres", "president"), seat("d1", "director")], excluded: ["d1"], decisions: [] });
    expect(v).toMatchObject({ state: "pending", needed: 1, smallBoard: true, voters: ["pres"] });
    const no = evaluateApproval({ seats: [seat("pres", "president"), seat("d1", "director")], excluded: ["d1"], decisions: [reject("pres", "president")] });
    expect(no.state).toBe("rejected");
  });

  it("needs both of two seats when neither entered it", () => {
    const v = evaluateApproval({ seats: [seat("pres", "president"), seat("d1", "director")], excluded: ["mgr"], decisions: [] });
    expect(v).toMatchObject({ mode: "majority", needed: 2, smallBoard: false, state: "pending" });
  });

  it("does not lower the need on a board of three or more", () => {
    const seats = [seat("pres", "president"), seat("d1", "director"), seat("d2", "director")];
    const v = evaluateApproval({ seats, excluded: ["d1", "d2"], decisions: [] });
    expect(v).toMatchObject({ needed: 2, smallBoard: false, state: "cannot_approve" });
  });
});

describe("a seat change between decisions", () => {
  it("keeps a decision made by someone who has since left the board", () => {
    // The president approved, then left. The treasurer and secretary remain.
    const before = [seat("pres", "president"), seat("treas", "treasurer"), seat("sec", "secretary")];
    const after = [seat("treas", "treasurer"), seat("sec", "secretary")];
    const decisions = [approve("pres", "president")];
    expect(evaluateApproval({ seats: before, excluded: [], decisions }).approvals).toBe(1);
    const v = evaluateApproval({ seats: after, excluded: [], decisions: [...decisions, approve("sec", "secretary")] });
    expect(v.approvals).toBe(2);
    expect(v.state).toBe("approved");
  });

  it("recomputes the mode from the seats as they stand", () => {
    // Committee at first; the secretary leaves, so only the president is an
    // eligible committee member, and the board of four falls to majority (3).
    const before = [seat("pres", "president"), seat("treas", "treasurer"), seat("sec", "secretary"), seat("d1", "director"), seat("d2", "director")];
    const after = before.filter((s) => s.userId !== "sec");
    const excluded = ["treas"];
    expect(evaluateApproval({ seats: before, excluded, decisions: [] }).mode).toBe("committee");
    const v = evaluateApproval({ seats: after, excluded, decisions: [approve("pres", "president")] });
    expect(v.mode).toBe("majority");
    expect(v.needed).toBe(3);
    expect(v.approvals).toBe(1);
    expect(v.waitingOn.sort()).toEqual(["d1", "d2"]);
  });

  it("lets a newly seated member decide", () => {
    const seats = [...FULL.filter((s) => s.userId !== "sec"), seat("newsec", "secretary")];
    const v = evaluateApproval({ seats, excluded: ["dir"], decisions: [approve("pres", "president")] });
    expect(canDecide(v, "newsec")).toBe(true);
    expect(canDecide(v, "sec")).toBe(false);
  });
});

describe("an admin with no seat", () => {
  it("is never a voter and cannot decide", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["dir"], decisions: [] });
    expect(v.voters).not.toContain("admin");
    expect(canDecide(v, "admin")).toBe(false);
  });

  it("does not count even if a decision of theirs is handed in", () => {
    const v = evaluateApproval({
      seats: FULL,
      excluded: ["dir"],
      decisions: [approve("admin", null as unknown as string), approve("pres", "president")],
    });
    expect(v.approvals).toBe(1);
  });

  it("approves as their seat when they hold one", () => {
    const seats = [...FULL, seat("admin", "treasurer")].filter((s) => s.userId !== "treas");
    const v = evaluateApproval({ seats, excluded: ["dir"], decisions: [] });
    expect(canDecide(v, "admin")).toBe(true);
  });
});

describe("canDecide and progress", () => {
  it("refuses anyone once decided, and anyone who has already decided", () => {
    const v = evaluateApproval({ seats: FULL, excluded: ["dir"], decisions: [approve("pres", "president")] });
    expect(canDecide(v, "pres")).toBe(false);
    expect(canDecide(v, null)).toBe(false);
    const done = evaluateApproval({ seats: FULL, excluded: ["dir"], decisions: [approve("pres", "president"), approve("sec", "secretary")] });
    expect(canDecide(done, "treas")).toBe(false);
  });

  it("says how far along it is", () => {
    expect(progressLabel({ approvals: 1, needed: 2 })).toBe("1 of 2 approvals");
    expect(progressLabel({ approvals: 3, needed: 2 })).toBe("2 of 2 approvals");
  });
});
