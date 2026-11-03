/**
 * The resident home's "Up next" (Earnest parity round 3, Phase 5b) — pure:
 * which dues, meeting, poll and request update earn a row, in what order, in
 * the reminders' words, on the community's clock.
 *
 * New York is on EST (UTC−5) from Sun, Nov 1 2026, so 9:30 am there is 14:30Z.
 */
import { describe, expect, it } from "vitest";
import { buildUpNext } from "#core/shared/home/up-next";

const NOW = new Date("2026-11-03T14:30:00Z"); // Tue, Nov 3, 9:30 am in New York
const NY = { asOf: NOW, timeZone: "America/New_York" };

describe("buildUpNext: dues", () => {
  const charge = (over: Record<string, unknown> = {}) => ({ id: "c1", title: "November dues", status: "active", amount_remaining: 450, due_date: "2026-11-10", ...over });

  it("lists a charge due inside two weeks, in the reminders' words", () => {
    const [item] = buildUpNext({ charges: [charge()] }, NY);
    expect(item).toMatchObject({ kind: "dues", title: "$450.00 · November dues", sub: "Due Tue, Nov 10", route: "/payments", urgent: false });
  });

  it("is urgent from three days out, and says today and tomorrow", () => {
    expect(buildUpNext({ charges: [charge({ due_date: "2026-11-06" })] }, NY)[0]!.urgent).toBe(true);
    expect(buildUpNext({ charges: [charge({ due_date: "2026-11-04" })] }, NY)[0]).toMatchObject({ sub: "Due tomorrow, Wed, Nov 4", urgent: true });
    expect(buildUpNext({ charges: [charge({ due_date: "2026-11-03" })] }, NY)[0]!.sub).toBe("Due today");
  });

  it("skips what is far off, paid, canceled or owes nothing", () => {
    expect(buildUpNext({ charges: [charge({ due_date: "2026-12-30" })] }, NY)).toEqual([]);
    expect(buildUpNext({ charges: [charge({ status: "paid" }), charge({ id: "c2", status: "canceled" }), charge({ id: "c3", amount_remaining: 0 })] }, NY)).toEqual([]);
  });

  it("says how late an overdue charge is, whatever its age", () => {
    const [item] = buildUpNext({ charges: [charge({ status: "overdue", due_date: "2026-10-25" })] }, NY);
    expect(item).toMatchObject({ sub: "Was due Sun, Oct 25 · 9 days overdue", urgent: true });
    expect(buildUpNext({ charges: [charge({ status: "overdue", due_date: "2026-10-02" })] }, NY)).toHaveLength(1);
    // A charge past its due date whose status the worker hasn't flipped yet is still late.
    expect(buildUpNext({ charges: [charge({ due_date: "2026-11-02" })] }, NY)[0]!.sub).toBe("Was due Mon, Nov 2 · 1 day overdue");
  });

  it("reads the due date on the community's clock", () => {
    // 9:30 pm Mon in Los Angeles is already Tue in UTC: a charge due Tuesday is due tomorrow, not today.
    const la = { asOf: new Date("2026-11-03T05:30:00Z"), timeZone: "America/Los_Angeles" };
    expect(buildUpNext({ charges: [charge({ due_date: "2026-11-03" })] }, la)[0]!.sub).toBe("Due tomorrow, Tue, Nov 3");
  });

  it("puts the most urgent charge first", () => {
    const items = buildUpNext({ charges: [charge({ id: "late", status: "overdue", due_date: "2026-10-20" }), charge({ id: "soon", due_date: "2026-11-12" })] }, NY);
    expect(items.map((i) => i.key)).toEqual(["dues:late", "dues:soon"]);
  });
});

describe("buildUpNext: meetings", () => {
  const meeting = (over: Record<string, unknown> = {}) => ({ id: "m1", title: "Monthly board meeting", meeting_date: "2026-11-10T23:30:00Z", location: "Clubhouse", ...over });

  it("shows only the next one, with when and where", () => {
    const items = buildUpNext({ meetings: [meeting({ id: "later", meeting_date: "2026-11-20T23:30:00Z" }), meeting()] }, NY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "meeting:m1", kind: "meeting", title: "Monthly board meeting", route: "/meetings", urgent: false });
    expect(items[0]!.sub).toContain("Clubhouse");
  });

  it("is urgent inside a day, and skips the past and the far future", () => {
    expect(buildUpNext({ meetings: [meeting({ meeting_date: "2026-11-04T00:00:00Z" })] }, NY)[0]!.urgent).toBe(true);
    expect(buildUpNext({ meetings: [meeting({ meeting_date: "2026-11-03T13:00:00Z" })] }, NY)).toEqual([]);
    expect(buildUpNext({ meetings: [meeting({ meeting_date: "2027-02-01T23:30:00Z" })] }, NY)).toEqual([]);
  });
});

describe("buildUpNext: polls", () => {
  const poll = (over: Record<string, unknown> = {}) => ({ id: "p1", title: "Repaint the fence?", closes_at: "2026-11-04T13:00:00Z", voted: false, ...over });

  it("asks for a vote, and says when it closes", () => {
    const [item] = buildUpNext({ polls: [poll()] }, NY);
    expect(item).toMatchObject({ kind: "poll", title: "Vote: Repaint the fence?", route: "/polls", urgent: true });
    expect(item!.sub).toMatch(/^Closes /);
  });

  it("skips a poll already voted in, already closed, or closing past the horizon", () => {
    expect(buildUpNext({ polls: [poll({ voted: true })] }, NY)).toEqual([]);
    expect(buildUpNext({ polls: [poll({ closes_at: "2026-11-03T13:00:00Z" })] }, NY)).toEqual([]);
    expect(buildUpNext({ polls: [poll({ closes_at: "2027-01-01T00:00:00Z" })] }, NY)).toEqual([]);
  });

  it("an open poll with no close time is just open", () => {
    expect(buildUpNext({ polls: [poll({ closes_at: null })] }, NY)[0]).toMatchObject({ sub: "Open now", urgent: false });
  });
});

describe("buildUpNext: requests", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    title: "Broken gate",
    type: "maintenance",
    status: "in_progress",
    metadata: { status_changed_at: "2026-11-02T15:00:00Z" },
    ...over,
  });

  it("shows a status change from the last week", () => {
    const [item] = buildUpNext({ requests: [request()] }, NY);
    expect(item).toMatchObject({ kind: "request", title: "Broken gate", route: "/requests/r1", urgent: false });
    expect(item!.sub).toMatch(/^Now in progress · /);
  });

  it("uses the workflow's own word when it has one", () => {
    expect(buildUpNext({ requests: [request({ metadata: { status_changed_at: "2026-11-02T15:00:00Z", workflow_state: "board_review" } })] }, NY)[0]!.sub).toMatch(/^Now board review · /);
  });

  it("skips old changes, open ones that never changed, and the board's own request types", () => {
    expect(buildUpNext({ requests: [request({ metadata: { status_changed_at: "2026-10-20T15:00:00Z" } })] }, NY)).toEqual([]);
    expect(buildUpNext({ requests: [request({ metadata: {} })] }, NY)).toEqual([]);
    expect(buildUpNext({ requests: [request({ status: "open" })] }, NY)).toEqual([]);
    expect(buildUpNext({ requests: [request({ type: "violation" })] }, NY)).toEqual([]);
  });
});

describe("buildUpNext: the list", () => {
  it("puts urgent first, an update after what is still ahead, and caps it", () => {
    const items = buildUpNext(
      {
        charges: [{ id: "c1", title: "Dues", status: "active", amount_remaining: 100, due_date: "2026-11-12" }],
        meetings: [{ id: "m1", title: "Meeting", meeting_date: "2026-11-09T23:30:00Z" }],
        polls: [{ id: "p1", title: "Poll", closes_at: "2026-11-03T20:00:00Z", voted: false }],
        requests: [{ id: "r1", title: "Gate", type: "maintenance", status: "resolved", metadata: { status_changed_at: "2026-11-03T10:00:00Z" } }],
      },
      { ...NY, limit: 3 }
    );
    expect(items.map((i) => i.kind)).toEqual(["poll", "meeting", "dues"]);
  });

  it("is empty when there is nothing, or nothing valid", () => {
    expect(buildUpNext({}, NY)).toEqual([]);
    expect(buildUpNext({ charges: [{ id: "x", status: "active", amount_remaining: 5, due_date: "garbage" }] }, NY)).toEqual([]);
  });
});
