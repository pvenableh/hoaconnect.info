import { describe, it, expect } from "vitest";
import { actionListSpec } from "#core/server/utils/ai-action-reads";

describe("actionListSpec", () => {
  it("reads the community's feed newest first, 50 by default", () => {
    const s = actionListSpec("org-1", {});
    expect(s).toMatchObject({
      collection: "ai_actions",
      filter: { organization: { _eq: "org-1" } },
      sort: ["-date_created"],
      limit: 50,
    });
    expect(s.fields).toContain("requested_by.first_name");
    expect(s.fields).toContain("approved_by.last_name");
    expect(s.fields).toContain("preview");
  });

  it("narrows by status, and by entity only when both type and id are given", () => {
    expect(actionListSpec("o", { status: "pending" }).filter).toEqual({ organization: { _eq: "o" }, status: { _eq: "pending" } });
    expect(actionListSpec("o", { entityType: "notice" }).filter).toEqual({ organization: { _eq: "o" } });
    expect(actionListSpec("o", { entityType: "notice", entityId: "n1" }).filter).toEqual({
      organization: { _eq: "o" },
      entity_type: { _eq: "notice" },
      entity_id: { _eq: "n1" },
    });
  });

  it("caps the page at 200 and falls back to 50 for a missing or bad limit", () => {
    expect(actionListSpec("o", { limit: "10" }).limit).toBe(10);
    expect(actionListSpec("o", { limit: "500" }).limit).toBe(200);
    expect(actionListSpec("o", { limit: "abc" }).limit).toBe(50);
    expect(actionListSpec("o", { limit: "0" }).limit).toBe(50);
  });
});
