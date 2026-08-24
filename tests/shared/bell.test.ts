/**
 * The bell after Phase 2c reads `directus_notifications` rows, which carry far
 * less than the collection scans they replaced: a subject, a message, a
 * collection and an item id. Everything the three notification surfaces render
 * — type chip, filter tab, icon colour, deep link — is reconstructed from that.
 *
 * So this is where the cutover can go quietly wrong. A row whose type resolves
 * badly doesn't crash; it lands in the wrong filter tab with the wrong icon and
 * nobody notices for a month. These pin the mapping down.
 */

import { describe, it, expect } from "vitest";
import {
  toBellNotification,
  typeForRow,
  priorityForRow,
  categoryForType,
  mergeRow,
  sortRows,
  unreadByType,
  plainText,
  type BellRow,
} from "#core/shared/notifications/bell";

const row = (over: Partial<BellRow> = {}): BellRow => ({
  id: "n1",
  timestamp: "2026-08-24T12:00:00.000Z",
  status: "inbox",
  subject: "New task assigned",
  message: "You were assigned something.",
  collection: "hoa_tasks",
  item: "task-1",
  ...over,
});

describe("what kind of notification this is", () => {
  it("trusts the collection, which is why notifyUsers carries one", () => {
    const cases: Array<[string, string]> = [
      ["hoa_announcements", "announcement"],
      ["hoa_channel_mentions", "mention"],
      ["hoa_meetings", "meeting"],
      ["payment_requests", "payment"],
      ["hoa_documents", "document"],
      ["hoa_members", "membership"],
      ["hoa_join_requests", "membership"],
      ["hoa_comments", "comment"],
      ["hoa_requests", "request"],
      ["hoa_tasks", "task"],
      ["hoa_project_events", "task"],
      ["hoa_emails", "email"],
    ];
    for (const [collection, type] of cases) {
      expect(typeForRow(row({ collection }))).toBe(type);
    }
  });

  it("beats the subject heuristic when both would answer", () => {
    // A comment ON a meeting is a comment. The collection is the fact; the
    // subject is a sentence someone wrote.
    expect(typeForRow(row({ collection: "hoa_comments", subject: "New meeting comment" }))).toBe(
      "comment"
    );
  });

  it("falls back to the subject for rows written before collections were passed", () => {
    const guess = (subject: string) => typeForRow(row({ collection: null, subject }));
    expect(guess("You were mentioned")).toBe("mention");
    expect(guess("Payment overdue")).toBe("payment");
    expect(guess("Milestone needs approval")).toBe("task");
    expect(guess("New inquiry submitted")).toBe("request");
    expect(guess("Welcome to Harborview")).toBe("membership");
  });

  it("lands somewhere renderable rather than nowhere when it cannot tell", () => {
    expect(typeForRow(row({ collection: null, subject: "Hello" }))).toBe("announcement");
    expect(typeForRow(row({ collection: "something_new", subject: "" }))).toBe("announcement");
  });

  it("maps types back to the preference category that governs them", () => {
    expect(categoryForType("meeting")).toBe("meeting");
    expect(categoryForType("task")).toBe("task");
    // Email notifications exist in the bell but have no preference category of
    // their own — the mapping says so rather than inventing one.
    expect(categoryForType("email")).toBeNull();
    expect(categoryForType("nonsense")).toBeNull();
  });
});

describe("urgency, inferred from the words a sender chose", () => {
  it("hears overdue and urgent", () => {
    expect(priorityForRow(row({ subject: "Payment overdue" }))).toBe("urgent");
    expect(priorityForRow(row({ message: "URGENT: water shutoff" }))).toBe("urgent");
    expect(priorityForRow(row({ subject: "Past due balance" }))).toBe("urgent");
  });

  it("hears a request for action", () => {
    expect(priorityForRow(row({ subject: "Milestone needs approval" }))).toBe("high");
    expect(priorityForRow(row({ message: "Action required before Friday" }))).toBe("high");
    expect(priorityForRow(row({ subject: "Reminder: annual meeting" }))).toBe("high");
  });

  it("leaves ordinary notifications alone", () => {
    expect(priorityForRow(row())).toBe("normal");
    expect(priorityForRow(row({ subject: "New document available" }))).toBe("normal");
  });
});

describe("a row becomes something renderable", () => {
  it("carries the fields the surfaces read", () => {
    const n = toBellNotification(row());
    expect(n).toMatchObject({
      id: "n1",
      type: "task",
      title: "New task assigned",
      subtitle: "You were assigned something.",
      date: "2026-08-24T12:00:00.000Z",
      isRead: false,
      priority: "normal",
    });
    expect(n.metadata).toEqual({ taskId: "task-1", projectId: undefined });
  });

  it("reads archived as read — there is no second notion of read state", () => {
    expect(toBellNotification(row({ status: "archived" })).isRead).toBe(true);
    expect(toBellNotification(row({ status: "inbox" })).isRead).toBe(false);
  });

  it("strips markup out of the subtitle so a toast isn't full of tags", () => {
    const n = toBellNotification(row({ message: "<p>Look at   <b>this</b></p>" }));
    expect(n.subtitle).toBe("Look at this");
    expect(plainText(null)).toBe("");
  });

  it("names the sender when the message is empty", () => {
    const n = toBellNotification(
      row({ message: null, sender: { id: "u1", first_name: "Dana", last_name: "Reyes" } })
    );
    expect(n.subtitle).toBe("From Dana Reyes");
  });

  it("gives each type the one metadata key its route needs", () => {
    expect(toBellNotification(row({ collection: "hoa_requests", item: "r1" })).metadata).toEqual({
      requestId: "r1",
    });
    expect(toBellNotification(row({ collection: "hoa_documents", item: "d1" })).metadata).toEqual({
      documentId: "d1",
    });
  });
});

describe("keeping the live list coherent", () => {
  it("replaces a row rather than appending it a second time", () => {
    // Directus re-sends a row on update, and the bell also holds rows it wrote
    // optimistically — appending is the default bug here.
    const before = [row({ id: "a" }), row({ id: "b" })];
    const after = mergeRow(before, row({ id: "a", subject: "Edited" }));
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.id === "a")!.subject).toBe("Edited");
  });

  it("inserts a genuinely new row in sorted position", () => {
    const before = [row({ id: "old", timestamp: "2026-08-01T00:00:00.000Z" })];
    const after = mergeRow(before, row({ id: "new", timestamp: "2026-08-24T00:00:00.000Z" }));
    expect(after.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("sorts newest first, and ties break stably rather than shuffling", () => {
    const same = "2026-08-24T12:00:00.000Z";
    const sorted = sortRows([row({ id: "b", timestamp: same }), row({ id: "a", timestamp: same })]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortRows([row({ id: "x", timestamp: null })])).toHaveLength(1);
  });

  it("counts unread per type, ignoring what has been read", () => {
    const counts = unreadByType([
      row({ id: "1", collection: "hoa_tasks" }),
      row({ id: "2", collection: "hoa_tasks" }),
      row({ id: "3", collection: "hoa_meetings" }),
      row({ id: "4", collection: "hoa_meetings", status: "archived" }),
    ]);
    expect(counts).toEqual({ task: 2, meeting: 1 });
  });
});
