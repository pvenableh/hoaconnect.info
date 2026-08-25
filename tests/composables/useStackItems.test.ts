/**
 * The stacks home's item model (Round 2, Phase 7).
 *
 * The adapters are boring on purpose; the thing worth testing hard is the rule
 * the whole page rests on — **a fact appears exactly once**. The classic
 * dashboard's failure mode is that one overdue request shows up as a stat, a
 * chart bar, a notice and a pending proposal; if the stacks repeat that, they
 * are just the same page with rounder corners.
 *
 * The load-bearing collision is between a notice's `proposedAction` and the
 * `ai_actions` row created FROM it. Neither knows about the other, so they meet
 * on `act:<entityType>:<entityId>:<actionType>` — deliberately the same
 * identity `/api/ai/notices/propose` dedupes pending proposals on.
 */

import { describe, it, expect } from "vitest";
import {
  buildStacks,
  proposalToStackItem,
  noticeToStackItem,
  unreadChannelToStackItem,
  headlineToStackItem,
  actionFactKey,
  actionTypeLabel,
  normalizeTitle,
} from "#core/app/composables/useStackItems";

const proposal = (over: Record<string, any> = {}): any => ({
  id: "a1",
  action_type: "create_task",
  status: "pending",
  title: "Follow up on the irrigation valve",
  entity_type: "hoa_requests",
  entity_id: "r1",
  outbound: false,
  date_created: "2026-08-24T10:00:00Z",
  ...over,
});

const notice = (over: Record<string, any> = {}): any => ({
  id: "req:r1:aged",
  priority: "high",
  type: "warning",
  icon: "i-lucide-clock",
  title: "Request open for 45 days",
  description: "The leaking irrigation valve at the east gate has no owner.",
  actionLabel: "Open request",
  actionRoute: "/requests/r1",
  entityType: "hoa_requests",
  entityId: "r1",
  score: 72,
  ...over,
});

describe("adapters", () => {
  it("maps a pending proposal into Decide, with its domain dot", () => {
    const item = proposalToStackItem(proposal());
    expect(item.pile).toBe("decide");
    expect(item.kind).toBe("proposal");
    expect(item.domain).toBe("requests");
    expect(item.action?.id).toBe("a1");
  });

  it("says out loud when a proposal reaches people", () => {
    const item = proposalToStackItem(proposal({ action_type: "send_email", outbound: true }));
    expect(item.sub).toContain("goes out to people");
    expect(actionTypeLabel("send_email")).toBe("Send an email");
  });

  it("falls back to the row id when a proposal names no record", () => {
    const item = proposalToStackItem(proposal({ entity_type: null, entity_id: null }));
    expect(item.factKey).toBe("aa:a1");
    expect(item.domain).toBeUndefined();
  });

  it("routes a notice by what it asks of you", () => {
    expect(noticeToStackItem(notice()).pile).toBe("do");
    expect(noticeToStackItem(notice({ type: "insight" })).pile).toBe("know");
    expect(
      noticeToStackItem(
        notice({
          proposedAction: { actionType: "create_task", title: "Follow up", payload: {} },
        })
      ).pile
    ).toBe("decide");
  });

  it("carries the notice's own verb through as the row's escape", () => {
    const item = noticeToStackItem(notice());
    expect(item.route).toBe("/requests/r1");
    expect(item.routeLabel).toBe("Open request");
  });

  it("counts unread messages in the singular when there is one", () => {
    expect(unreadChannelToStackItem({ id: "c1", name: "Board", count: 1 }).sub).toBe(
      "1 unread message"
    );
    expect(unreadChannelToStackItem({ id: "c1", name: "Board", count: 4 }).sub).toBe(
      "4 unread messages"
    );
  });

  it("points a headline back at the room that wrote it", () => {
    const item = headlineToStackItem("Two invoices are past due", 0, null);
    expect(item.pile).toBe("know");
    expect(item.route).toBe("/admin/boardroom");
    expect(item.sub).toBe("From the board briefing");
  });

  it("derives the same fact key the propose endpoint dedupes on", () => {
    expect(actionFactKey("hoa_requests", "r1", "create_task")).toBe(
      "act:hoa_requests:r1:create_task"
    );
    expect(actionFactKey(null, "r1", "create_task")).toBeNull();
    expect(actionFactKey("hoa_requests", null, "create_task")).toBeNull();
  });
});

describe("buildStacks — a fact appears exactly once", () => {
  it("hides a notice whose proposal already exists as a pending row", () => {
    const s = buildStacks({
      proposals: [proposal()],
      notices: [
        notice({
          id: "req:r1:unowned",
          proposedAction: { actionType: "create_task", title: "Follow up", payload: {} },
        }),
      ],
    });
    expect(s.decide).toHaveLength(1);
    expect(s.decide[0]!.kind).toBe("proposal");
    // And it does not fall through to Do either — the fact is claimed, not moved.
    expect(s.do).toHaveLength(0);
    expect(s.know).toHaveLength(0);
  });

  it("keeps a notice whose proposal is for a DIFFERENT action on the same record", () => {
    const s = buildStacks({
      proposals: [proposal({ action_type: "create_task" })],
      notices: [
        notice({
          id: "req:r1:assign",
          proposedAction: { actionType: "assign_request", title: "Assign it", payload: {} },
        }),
      ],
    });
    expect(s.decide).toHaveLength(2);
  });

  it("keeps a notice whose proposal is on a different record", () => {
    const s = buildStacks({
      proposals: [proposal({ entity_id: "r1" })],
      notices: [
        notice({
          id: "req:r2:aged",
          entityId: "r2",
          proposedAction: { actionType: "create_task", title: "Follow up", payload: {} },
        }),
      ],
    });
    expect(s.decide).toHaveLength(2);
  });

  it("drops a briefing headline that restates a row already on screen", () => {
    const s = buildStacks({
      notices: [notice({ title: "Request open for 45 days" })],
      headlines: ["Request open for 45 days!", "Two invoices are past due"],
    });
    expect(s.do).toHaveLength(1);
    expect(s.know.map((i) => i.title)).toEqual(["Two invoices are past due"]);
  });

  it("does not apply the text guard to structured rows", () => {
    // Two genuinely distinct records can share a title; only prose is matched
    // by text, because text similarity is a weak signal.
    const s = buildStacks({
      notices: [
        notice({ id: "req:r1:aged", entityId: "r1", title: "Request needs an owner" }),
        notice({ id: "req:r2:aged", entityId: "r2", title: "Request needs an owner" }),
      ],
    });
    expect(s.do).toHaveLength(2);
  });

  it("ignores proposals that are not pending", () => {
    const s = buildStacks({
      proposals: [
        proposal({ id: "a1", status: "executed" }),
        proposal({ id: "a2", status: "rejected", entity_id: "r2" }),
        proposal({ id: "a3", status: "pending", entity_id: "r3" }),
      ],
    });
    expect(s.decide.map((i) => i.action?.id)).toEqual(["a3"]);
  });

  it("ignores channels with nothing unread", () => {
    const s = buildStacks({
      channels: [
        { id: "c1", name: "Board", count: 0 },
        { id: "c2", name: "Maintenance", count: 3 },
      ],
    });
    expect(s.do.map((i) => i.title)).toEqual(["Maintenance"]);
  });

  it("drops blank headlines rather than rendering an empty row", () => {
    const s = buildStacks({ headlines: ["", "   ", "A real point"] });
    expect(s.know.map((i) => i.title)).toEqual(["A real point"]);
  });

  it("sorts each pile by attention, highest first", () => {
    const s = buildStacks({
      notices: [
        notice({ id: "n-low", entityId: "r1", title: "Low", score: 10 }),
        notice({ id: "n-high", entityId: "r2", title: "High", score: 90 }),
        notice({ id: "n-mid", entityId: "r3", title: "Mid", score: 50 }),
      ],
    });
    expect(s.do.map((i) => i.title)).toEqual(["High", "Mid", "Low"]);
  });

  it("caps each pile so one noisy source cannot bury the others", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      notice({ id: `n${i}`, entityId: `r${i}`, score: i })
    );
    const s = buildStacks({ notices: many }, { do: 5 });
    expect(s.do).toHaveLength(5);
    expect(s.do[0]!.notice?.id).toBe("n29");
  });

  it("returns three empty piles for an empty community", () => {
    expect(buildStacks({})).toEqual({ decide: [], do: [], know: [] });
  });

  it("normalizes titles for comparison without mangling the displayed text", () => {
    expect(normalizeTitle("Request open for 45 days!")).toBe("request open for 45 days");
    expect(normalizeTitle("  Two   invoices — past due ")).toBe("two invoices past due");
  });
});
