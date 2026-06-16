import { describe, it, expect } from "vitest";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_BATCH_LIMIT,
  normalizeActivityEvent,
  normalizeActivityBatch,
} from "#core/shared/activity/events";

describe("normalizeActivityEvent", () => {
  it("normalizes a valid page_view", () => {
    expect(
      normalizeActivityEvent({ type: "page_view", path: "  /605-lincoln/documents  " })
    ).toEqual({
      event_type: "page_view",
      path: "/605-lincoln/documents",
      target_collection: null,
      target_id: null,
      label: null,
      metadata: null,
      session_id: null,
    });
  });

  it("carries target + label + metadata for a download", () => {
    const out = normalizeActivityEvent({
      type: "download",
      targetCollection: "hoa_documents",
      targetId: "doc-1",
      label: "Pool Rules.pdf",
      metadata: { size: 1024 },
      sessionId: "sess-1",
    });
    expect(out).toMatchObject({
      event_type: "download",
      target_collection: "hoa_documents",
      target_id: "doc-1",
      label: "Pool Rules.pdf",
      metadata: { size: 1024 },
      session_id: "sess-1",
    });
  });

  it("rejects an unknown event type", () => {
    expect(normalizeActivityEvent({ type: "drop_database" })).toBeNull();
    expect(normalizeActivityEvent({ type: 123 as any })).toBeNull();
    expect(normalizeActivityEvent({} as any)).toBeNull();
  });

  it("drops empty strings to null and ignores array/non-object metadata", () => {
    const out = normalizeActivityEvent({ type: "search", path: "   ", metadata: [1, 2] as any });
    expect(out).toMatchObject({ event_type: "search", path: null, metadata: null });
  });

  it("caps overlong fields", () => {
    const out = normalizeActivityEvent({ type: "page_view", path: "/".repeat(5000) });
    expect(out!.path!.length).toBe(1024);
  });

  it("accepts every declared event type", () => {
    for (const t of ACTIVITY_EVENT_TYPES) {
      expect(normalizeActivityEvent({ type: t })?.event_type).toBe(t);
    }
  });
});

describe("normalizeActivityBatch", () => {
  it("filters invalid entries", () => {
    const out = normalizeActivityBatch([
      { type: "page_view", path: "/a" },
      { type: "nope" },
      { type: "download", targetId: "x" },
      null,
    ]);
    expect(out.map((e) => e.event_type)).toEqual(["page_view", "download"]);
  });

  it("caps the batch at the limit", () => {
    const many = Array.from({ length: ACTIVITY_BATCH_LIMIT + 20 }, () => ({ type: "page_view" }));
    expect(normalizeActivityBatch(many)).toHaveLength(ACTIVITY_BATCH_LIMIT);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeActivityBatch("nope")).toEqual([]);
    expect(normalizeActivityBatch(undefined)).toEqual([]);
  });
});
