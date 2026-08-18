import { describe, it, expect } from "vitest";
import { deriveRouteFocus } from "#core/shared/ai/route-focus";

describe("deriveRouteFocus", () => {
  it("maps section list + detail routes to a scope", () => {
    expect(deriveRouteFocus("/605-lincoln/admin/vendors").scope).toBe("people");
    expect(deriveRouteFocus("/605-lincoln/admin/members").scope).toBe("people");
    expect(deriveRouteFocus("/605-lincoln/admin/requests/abc-123").scope).toBe("requests");
    expect(deriveRouteFocus("/605-lincoln/admin/projects/xyz").scope).toBe("work");
    expect(deriveRouteFocus("/605-lincoln/admin/meetings").scope).toBe("governance");
    expect(deriveRouteFocus("/605-lincoln/admin/channels/general").scope).toBe("communications");
    expect(deriveRouteFocus("/605-lincoln/admin/emails").scope).toBe("communications");
    expect(deriveRouteFocus("/605-lincoln/admin/payments").scope).toBe("money");
    expect(deriveRouteFocus("/605-lincoln/admin/settings/domains").scope).toBe("settings");
  });

  it("prefers the more specific rule when several could match", () => {
    // vendors lives under property-management conceptually, but the vendors rule
    // wins because it's listed first.
    expect(deriveRouteFocus("/x/admin/vendors").focus).toBe("the Vendors directory");
  });

  it("maps the admin/dashboard root to dashboard", () => {
    expect(deriveRouteFocus("/605-lincoln/admin").scope).toBe("dashboard");
    expect(deriveRouteFocus("/605-lincoln/dashboard").scope).toBe("dashboard");
  });

  it("falls back to workspace for unknown routes", () => {
    expect(deriveRouteFocus("/605-lincoln/admin/something-new")).toEqual({
      scope: "workspace",
      focus: "the association workspace",
    });
    expect(deriveRouteFocus("")).toEqual({ scope: "workspace", focus: "the association workspace" });
  });

  it("is case-insensitive", () => {
    expect(deriveRouteFocus("/X/Admin/Projects/ID").scope).toBe("work");
  });
});
