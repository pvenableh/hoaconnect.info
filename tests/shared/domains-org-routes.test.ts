import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  orgScopedRedirect,
  sessionOrgRedirect,
} from "#core/shared/domains/org-routes";

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

describe("sessionOrgRedirect", () => {
  it("collapses the main host's clean root to the org — the one difference from orgScopedRedirect", () => {
    expect(sessionOrgRedirect("/", SLUG)).toBe(`/${SLUG}`);
    // On a custom domain `/` already renders the host org's landing.
    expect(orgScopedRedirect("/", SLUG)).toBeNull();
  });

  it("sends /dashboard to the same place", () => {
    expect(sessionOrgRedirect("/dashboard", SLUG)).toBe(`/${SLUG}`);
  });

  it("sends the moved twins where the route actually is", () => {
    // These were the 404s: the old denylist prefixed them blindly.
    expect(sessionOrgRedirect("/members", SLUG)).toBe(`/${SLUG}/admin/members`);
    expect(sessionOrgRedirect("/units", SLUG)).toBe(`/${SLUG}/admin/units`);
  });

  it("leaves the platform's own pages alone instead of 404-ing them", () => {
    for (const path of [
      "/organizations",
      "/accept-invite",
      "/your-data",
      "/property-managers",
      "/experimental",
      "/account",
      "/subscription-expired",
      "/auth/login",
      "/ui-kit",
    ]) {
      expect(sessionOrgRedirect(path, SLUG)).toBeNull();
    }
  });

  it("still scopes the paths that DO have a twin", () => {
    expect(sessionOrgRedirect("/board", SLUG)).toBe(`/${SLUG}/board`);
    expect(sessionOrgRedirect("/documents", SLUG)).toBe(`/${SLUG}/documents`);
    expect(sessionOrgRedirect("/admin/members", SLUG)).toBe(`/${SLUG}/admin/members`);
  });

  it("cannot loop — a path already on this org returns null", () => {
    expect(sessionOrgRedirect(`/${SLUG}`, SLUG)).toBeNull();
    expect(sessionOrgRedirect(`/${SLUG}/admin/members`, SLUG)).toBeNull();
  });

  it("returns null without a slug", () => {
    expect(sessionOrgRedirect("/", "")).toBeNull();
    expect(sessionOrgRedirect("/board", null)).toBeNull();
  });
});

/**
 * The page tree changes; this mapping must not silently fall behind it.
 *
 * `org-redirect.global` used to be a denylist, so a main-domain page with no
 * `/{slug}` twin turned into a 404 for every signed-in user with an org — it
 * shipped that way three times (billing, then `/organizations`, then `/members`
 * and `/units`). It is an allowlist now, which fails safe, but the other half of
 * the risk is still live: a route WITH a twin that nobody maps just stops
 * redirecting. This walks the real page tree so neither drifts unnoticed.
 */
describe("the org-route mapping matches the real page tree", () => {
  const pagesDir = resolve(__dirname, "../../app/pages");

  /** A path is a route only if a .vue actually resolves — `X.vue` or `X/index.vue`. */
  function isRoute(dir: string, name: string): boolean {
    return (
      existsSync(resolve(dir, `${name}.vue`)) ||
      existsSync(resolve(dir, name, "index.vue"))
    );
  }

  /**
   * Top-level route segments. Both shapes count: `account.vue` AND
   * `organizations/index.vue`. Counting only files is how the first draft of
   * this guard passed while `/organizations` — the reported bug — was broken;
   * counting every folder is how it then flagged `auth/` and `billing/`, which
   * have no index and are not routes at all.
   */
  function topLevelRoutes(): string[] {
    return readdirSync(pagesDir, { withFileTypes: true })
      .filter((e) => (e.isFile() && e.name.endsWith(".vue")) || e.isDirectory())
      .map((e) => (e.isFile() ? e.name.replace(/\.vue$/, "") : e.name))
      .filter((name) => name !== "index" && name !== "[slug]")
      .filter((name) => isRoute(pagesDir, name));
  }

  it("finds the page tree, and both page shapes in it", () => {
    expect(existsSync(pagesDir)).toBe(true);
    const routes = topLevelRoutes();
    expect(routes).toContain("account"); // account.vue
    expect(routes).toContain("organizations"); // organizations/index.vue
    // Folders with no index are not routes and must not be counted.
    expect(routes).not.toContain("auth");
    expect(routes).not.toContain("billing");
  });

  it("never sends a signed-in user to a route that does not exist", () => {
    const slugDir = resolve(pagesDir, "[slug]");
    const broken = topLevelRoutes()
      .map((name) => ({ name, target: sessionOrgRedirect(`/${name}`, SLUG) }))
      .filter(({ target }) => target !== null)
      // Strip the slug back off to ask whether the target resolves under [slug].
      .filter(({ target }) => {
        const rest = target!.slice(`/${SLUG}`.length);
        if (rest === "") return false; // the org root always exists
        const parts = rest.replace(/^\//, "").split("/");
        const dir = parts.length > 1 ? resolve(slugDir, ...parts.slice(0, -1)) : slugDir;
        return !isRoute(dir, parts[parts.length - 1]!);
      });

    expect(broken).toEqual([]);
  });

  it("still redirects every top-level page that HAS a twin", () => {
    const slugDir = resolve(pagesDir, "[slug]");
    const missed = topLevelRoutes()
      .filter((name) => isRoute(slugDir, name))
      .filter((name) => sessionOrgRedirect(`/${name}`, SLUG) === null);

    expect(missed).toEqual([]);
  });
});
