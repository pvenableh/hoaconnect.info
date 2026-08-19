import { describe, it, expect } from "vitest";
import { orgScopedRedirect } from "#core/shared/domains/org-routes";

const SLUG = "605-lincoln";

describe("orgScopedRedirect", () => {
  describe("paths with an org twin at the same path", () => {
    it("scopes them to the host org", () => {
      expect(orgScopedRedirect("/announcements", SLUG)).toBe("/605-lincoln/announcements");
      expect(orgScopedRedirect("/board", SLUG)).toBe("/605-lincoln/board");
      expect(orgScopedRedirect("/documents", SLUG)).toBe("/605-lincoln/documents");
      expect(orgScopedRedirect("/payments", SLUG)).toBe("/605-lincoln/payments");
      expect(orgScopedRedirect("/signup", SLUG)).toBe("/605-lincoln/signup");
    });

    it("treats a trailing slash as the same route", () => {
      expect(orgScopedRedirect("/board/", SLUG)).toBe("/605-lincoln/board");
    });
  });

  describe("paths whose twin moved under /admin", () => {
    it("sends them to the twin that actually exists, not the mirrored path", () => {
      expect(orgScopedRedirect("/members", SLUG)).toBe("/605-lincoln/admin/members");
      expect(orgScopedRedirect("/units", SLUG)).toBe("/605-lincoln/admin/units");
      expect(orgScopedRedirect("/documents/upload", SLUG)).toBe(
        "/605-lincoln/admin/documents/upload"
      );
      expect(orgScopedRedirect("/settings/organization", SLUG)).toBe(
        "/605-lincoln/admin/settings/organization"
      );
    });

    it("does not confuse /documents with /documents/upload", () => {
      // The mirrored path /{slug}/documents/upload does NOT exist — sending it
      // there instead of to the admin twin would 404.
      expect(orgScopedRedirect("/documents", SLUG)).toBe("/605-lincoln/documents");
      expect(orgScopedRedirect("/documents/upload", SLUG)).toBe(
        "/605-lincoln/admin/documents/upload"
      );
    });

    it("sends /dashboard to the org root", () => {
      expect(orgScopedRedirect("/dashboard", SLUG)).toBe("/605-lincoln");
    });
  });

  describe("the /admin tree", () => {
    it("maps by prefix, at any depth", () => {
      expect(orgScopedRedirect("/admin", SLUG)).toBe("/605-lincoln/admin");
      expect(orgScopedRedirect("/admin/members", SLUG)).toBe("/605-lincoln/admin/members");
      expect(orgScopedRedirect("/admin/communications/templates", SLUG)).toBe(
        "/605-lincoln/admin/communications/templates"
      );
    });

    it("does not match a path that merely starts with the same letters", () => {
      expect(orgScopedRedirect("/administrators", SLUG)).toBeNull();
    });
  });

  describe("paths that must be left alone", () => {
    it("leaves the clean root alone — it already renders the org landing by host", () => {
      expect(orgScopedRedirect("/", SLUG)).toBeNull();
    });

    it("leaves the platform's own pages alone", () => {
      for (const path of [
        "/auth/login",
        "/auth/reset-password",
        "/account",
        "/billing/abc123",
        "/organizations",
        "/organizations/new",
        "/approve/token123",
        "/payment/confirmation",
        "/setup",
        "/setup/complete",
        "/accept-invite",
        "/subscription-expired",
        "/property-managers",
        "/experimental",
        "/ui-kit",
        "/settings/subscription",
      ]) {
        expect(orgScopedRedirect(path, SLUG)).toBeNull();
      }
    });

    it("leaves paths already scoped to this org alone, so the caller can't loop", () => {
      expect(orgScopedRedirect(`/${SLUG}`, SLUG)).toBeNull();
      expect(orgScopedRedirect(`/${SLUG}/admin/members`, SLUG)).toBeNull();
      expect(orgScopedRedirect(`/${SLUG}/documents`, SLUG)).toBeNull();
    });

    it("still scopes a DIFFERENT org's slug — tenant isolation owns that case", () => {
      // Not this domain's org, so it isn't the already-scoped case. It also
      // isn't a mapped path, so it falls through untouched and the slug branch
      // of domain-detector redirects it.
      expect(orgScopedRedirect("/harborview-lofts/admin/members", SLUG)).toBeNull();
    });
  });

  describe("bad input", () => {
    it("returns null without a host slug", () => {
      expect(orgScopedRedirect("/admin/members", "")).toBeNull();
      expect(orgScopedRedirect("/admin/members", null)).toBeNull();
      expect(orgScopedRedirect("/admin/members", undefined)).toBeNull();
      expect(orgScopedRedirect("/admin/members", "   ")).toBeNull();
    });

    it("returns null for a path that isn't a path", () => {
      expect(orgScopedRedirect("", SLUG)).toBeNull();
      expect(orgScopedRedirect("admin/members", SLUG)).toBeNull();
    });
  });
});
