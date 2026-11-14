/**
 * Login routing (docs/spec-capability-nav.md): a manager (hat) who can work an
 * area lands on the queue; everyone else lands on the org root, as before.
 */
import { describe, it, expect, vi } from "vitest";
import { orgHomeUrl, resolveHomePath } from "#core/app/composables/useHomeRoute";
import { emptyRoleContext } from "#core/shared/roles/role-context";

function respond(build: (ctx: ReturnType<typeof emptyRoleContext>) => void) {
  const ctx = emptyRoleContext("org-1");
  build(ctx);
  vi.stubGlobal("$fetch", async (url: string, opts: any) => {
    expect(url).toBe("/api/org/role-context");
    expect(opts.query).toEqual({ orgId: "org-1" });
    return { context: ctx };
  });
}

describe("resolveHomePath", () => {
  it("sends a manager who can work an area to the queue", async () => {
    respond((c) => {
      c.hats.manager = true;
      c.areas.inquiries.canWork = true;
    });
    expect(await resolveHomePath("org-1")).toBe("/manage");
  });

  it("sends a manager who is admin to the queue too", async () => {
    respond((c) => {
      c.hats.manager = true;
      c.hats.admin = true;
      for (const a of Object.values(c.areas)) a.canWork = true;
    });
    expect(await resolveHomePath("org-1")).toBe("/manage");
  });

  it("keeps everyone else on the org root", async () => {
    respond((c) => {
      c.hats.admin = true;
      for (const a of Object.values(c.areas)) a.canWork = true;
    });
    expect(await resolveHomePath("org-1")).toBe("/");
    // The hat with nothing to work: no queue to land on.
    respond((c) => {
      c.hats.manager = true;
    });
    expect(await resolveHomePath("org-1")).toBe("/");
  });

  it("falls back to the org root when the context cannot be read", async () => {
    vi.stubGlobal("$fetch", async () => {
      throw new Error("403");
    });
    expect(await resolveHomePath("org-1")).toBe("/");
    expect(await resolveHomePath(null)).toBe("/");
  });

  it("builds the URL", () => {
    expect(orgHomeUrl("lenox", "/")).toBe("/lenox");
    expect(orgHomeUrl("lenox", "/manage")).toBe("/lenox/manage");
  });
});
