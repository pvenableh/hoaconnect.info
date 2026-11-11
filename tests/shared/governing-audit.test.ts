/**
 * Governing documents: reading the audit trail (core/shared/governing/audit.ts).
 * The viewer shows stored values as they are; these prove nothing is tidied.
 */
import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, auditActionLabel, auditChanges, auditValue } from "#core/shared/governing/audit";

describe("auditChanges", () => {
  it("lists only the fields that differ, with text exactly as stored", () => {
    const before = { text: "Poxies shall be in writing,  filed. \n", citation: null, review_state: "reviewed" };
    const after = { text: "Proxies shall be in writing,  filed. \n", citation: null, review_state: "reviewed" };
    expect(auditChanges(before, after)).toEqual([{ field: "text", before: before.text, after: after.text }]);
  });

  it("shows a field that exists on one side only", () => {
    expect(auditChanges({ status: "draft" }, { status: "published", provisions: 3 })).toEqual([
      { field: "status", before: "draft", after: "published" },
      { field: "provisions", before: "", after: "3" },
    ]);
  });

  it("handles a row with nothing after (a delete) and one with neither", () => {
    expect(auditChanges({ title: "Rules" }, null)).toEqual([{ field: "title", before: "Rules", after: "" }]);
    expect(auditChanges(null, null)).toEqual([]);
  });

  it("shows a value that is not a set of fields whole", () => {
    expect(auditChanges(["a"], ["b"])).toEqual([{ field: "", before: '[\n  "a"\n]', after: '[\n  "b"\n]' }]);
  });
});

describe("labels", () => {
  it("names every listed action and falls back to the raw name", () => {
    for (const action of AUDIT_ACTIONS) expect(auditActionLabel(action)).not.toBe(action);
    expect(auditActionLabel("something_new")).toBe("something_new");
    expect(auditValue("  kept  ")).toBe("  kept  ");
  });
});
