// Realtime by polling: two polls become the events a Directus subscription sent.
import { describe, expect, it } from "vitest";
import { diffRows, pollQuery, POLL_ROW_LIMIT, type RowSnapshot } from "#core/shared/realtime/diff";

const snap = (rows: any[]) => diffRows(new Map(), rows, true).next;

describe("diffRows", () => {
  it("a new row is a create, a changed row an update, an unchanged row nothing", () => {
    const before = snap([{ id: "a", text: "hi" }, { id: "b", text: "x" }]);
    const d = diffRows(before, [{ id: "a", text: "hi" }, { id: "b", text: "edited" }, { id: "c", text: "new" }], true);
    expect(d.create).toEqual([{ id: "c", text: "new" }]);
    expect(d.update).toEqual([{ id: "b", text: "edited" }]);
    expect(d.delete).toEqual([]);
  });

  it("a row gone from a complete poll is a delete, given as its bare key in its own type", () => {
    const before = snap([{ id: 7 }, { id: 8 }]);
    const d = diffRows(before, [{ id: 7 }], true);
    expect(d.delete).toEqual([8]);
    expect([...d.next.keys()]).toEqual(["7"]);
  });

  it("a full poll reports no delete and keeps what it cannot see, so it does not come back as new", () => {
    const before = snap([{ id: "old" }, { id: "kept" }]);
    const d = diffRows(before, [{ id: "kept" }], false);
    expect(d.delete).toEqual([]);
    expect(d.next.has("old")).toBe(true);
    expect(diffRows(d.next, [{ id: "old" }, { id: "kept" }], true).create).toEqual([]);
  });

  it("ignores rows with no id", () => {
    const d = diffRows(new Map() as RowSnapshot, [null, { text: "no id" }, { id: "x" }], true);
    expect(d.create).toEqual([{ id: "x" }]);
  });
});

describe("pollQuery", () => {
  it("keeps fields, filter and sort, adds id, and caps the rows", () => {
    expect(pollQuery({ fields: ["channel", "date_created"], filter: { channel: { _eq: "c1" } }, sort: ["-date_created"] })).toEqual({
      fields: ["channel", "date_created", "id"],
      filter: { channel: { _eq: "c1" } },
      sort: ["-date_created"],
      limit: POLL_ROW_LIMIT,
    });
  });

  it("all fields when none are given; no filter or sort when none or not an object", () => {
    expect(pollQuery({ fields: [], filter: null, sort: null })).toEqual({ fields: ["*"], limit: POLL_ROW_LIMIT });
    expect(pollQuery({ fields: ["*"], filter: ["x"], sort: [] })).toEqual({ fields: ["*"], limit: POLL_ROW_LIMIT });
    expect(pollQuery(undefined)).toEqual({ fields: ["*"], limit: POLL_ROW_LIMIT });
  });
});
