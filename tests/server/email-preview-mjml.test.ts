/**
 * GET /api/email/preview-mjml (Earnest parity round 3, Phase 4): the org gate,
 * the templates and formats, the unsaved palette, and the sandbox header.
 * Renders only — the fake Directus answers the org read and nothing else.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ query: {} as Record<string, string>, headers: {} as Record<string, string>, reads: [] as any[] }));

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
}));

const ORG = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Harborview Lofts",
  legal_name: "Harborview Lofts Condominium Association, Inc.",
  slug: "demo",
  email: "board@harborview.example",
  street_address: "100 Harbor Way",
  city: "Portland",
  state: "ME",
  zip: "04101",
  settings: { id: "s1", logo: { id: "logo-1", width: 600, height: 200 }, colors: [{ primary: "#1e3a8a", accent: "#f59e0b" }], header_text: "Official Communication of {name}" },
};

beforeAll(async () => {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://cms.test" } }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("#core/server/api/email/preview-mjml.get");
}, 120_000);

beforeEach(() => {
  h.query = {};
  h.headers = {};
  h.reads = [];
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u1" } }));
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("setHeader", (_e: unknown, k: string, v: string) => void (h.headers[k] = v));
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, g: string) => {
    if (org !== ORG.id || g !== "communications") throw Object.assign(new Error("403"), { statusCode: 403 });
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.reads.push(op);
      const f = op.query.filter;
      const hit = f.id?._eq === ORG.id || f.slug?._eq === ORG.slug;
      return hit ? [structuredClone(ORG)] : [];
    },
  }));
});

const route = async () => (await import("#core/server/api/email/preview-mjml.get")).default as any;

describe("GET /api/email/preview-mjml", () => {
  it("is org-gated: another org's admin gets 403; an unknown org 404; no org 400", async () => {
    vi.stubGlobal("requireAdminOrManagerGrant", async () => {
      throw Object.assign(new Error("403"), { statusCode: 403 });
    });
    h.query = { org: "demo" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    h.query = { org: "nope" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 404 });
    h.query = {};
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("the gate asks for the communications grant on the org it read (by slug or id)", async () => {
    const asked: string[] = [];
    vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, g: string) => void asked.push(`${org}:${g}`));
    h.query = { org: "demo" };
    await (await route())({});
    h.query = { org: ORG.id };
    await (await route())({});
    expect(asked).toEqual([`${ORG.id}:communications`, `${ORG.id}:communications`]);
  });

  it("html: a whole document, sandboxed, in the org's brand, with the logo sized from its metadata", async () => {
    h.query = { org: "demo", template: "newsletter" };
    const html = await (await route())({});
    expect(html).toMatch(/^<!doctype html>/i);
    expect(h.headers["Content-Security-Policy"]).toBe("sandbox");
    expect(h.headers["Content-Type"]).toContain("text/html");
    expect(html).toContain("background-color:#1e3a8a");
    expect(html).toContain(`width="150" height="50"`);
    expect(html).toContain("Official Communication of Harborview Lofts");
  });

  it("the unsaved palette and header line override what is stored; palette=none is the platform default", async () => {
    h.query = { org: "demo", template: "notice", primary: "#7c3aed", headerText: "Draft line" };
    let html = await (await route())({});
    expect(html).toContain("background-color:#7c3aed");
    expect(html).toContain("Draft line");
    h.query = { org: "demo", template: "notice", palette: "none" };
    html = await (await route())({});
    expect(html).toContain("background-color:#14532d");
    h.query = { org: "demo", template: "notice", primary: "red;}" };
    html = await (await route())({});
    expect(html).toContain("background-color:#1e3a8a");
  });

  it("notification: the branded notification email for a category, its CTA, the notifications footer", async () => {
    h.query = { org: "demo", template: "notification", category: "payment" };
    const html = await (await route())({});
    expect(html).toContain("Your dues are due on the 1st");
    expect(html).toContain("https://app.test/demo/payments");
    expect(html).toContain("Pay now");
  });

  it("invitation: the member invitation in the org's brand, a sample accept link, the invitation footer", async () => {
    h.query = { org: "demo", template: "invitation" };
    const html = await (await route())({});
    expect(html).toContain("invited to join Harborview Lofts");
    expect(html).toContain("https://app.test/demo/accept-invite?token=sample");
    expect(html).toContain("Accept Invitation");
    expect(html).toContain("invited this address to its HOA Connect portal");
  });

  it("format=mjml is the composed source; format=text the plain part", async () => {
    h.query = { org: "demo", template: "alert", format: "mjml" };
    const mjml = await (await route())({});
    expect(mjml).toMatch(/^\s*<mjml>/);
    expect(mjml).not.toMatch(/@HEADER|@CONTENT|@FOOTER|\{\{/);
    expect(h.headers["Content-Type"]).toContain("text/plain");
    h.query = { org: "demo", template: "alert", format: "text" };
    const text = await (await route())({});
    expect(text).not.toContain("<");
    expect(text).toContain("Harborview Lofts");
  });

  it.each([
    ["reminder-dues", "Total due", "https://app.test/demo/payments", "cannot be unsubscribed"],
    ["reminder-meeting", "Monthly board meeting", "https://app.test/demo/meetings", "these notifications are on"],
    ["reminder-violation", "Correct by", "https://app.test/demo/requests/r1", "cannot be unsubscribed"],
    ["reminder-poll", "Should we repaint the fence green?", "https://app.test/demo/polls", "these notifications are on"],
  ] as const)("%s (Phase 5a): the reminder partial in the org's brand, its button, its class footer", async (template, text, href, footer) => {
    h.query = { org: "demo", template };
    const html = await (await route())({});
    expect(html).toMatch(/^<!doctype html>/i);
    expect(h.headers["Content-Security-Policy"]).toBe("sandbox");
    expect(html).toContain(text);
    expect(html).toContain(href);
    expect(html).toContain(footer);
    expect(html.indexOf(footer)).toBeGreaterThan(html.indexOf("All rights reserved"));
    expect(html).toContain("background-color:#1e3a8a");
    h.query = { org: "demo", template, format: "mjml" };
    expect(await (await route())({})).not.toMatch(/@CONTENT|\{\{/);
  });

  it("rejects an unknown template, format or category", async () => {
    for (const q of [{ template: "invoice" }, { format: "pdf" }, { template: "notification", category: "gossip" }]) {
      h.query = { org: "demo", ...q };
      await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});
