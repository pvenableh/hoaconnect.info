/**
 * The public email web view: sent emails for anyone, drafts for senders only,
 * and never script on the app's origin.
 *
 *  - GET /api/email/view/:id — a draft takes requireAdminOrManagerGrant
 *    (communications) on its community; every answer carries a CSP sandbox
 *    with no allow-scripts / allow-same-origin. Until 2026-11-12 drafts were
 *    public and the community's raw HTML ran on the app's origin;
 *  - GET /api/email/resolve — a draft's web_slug resolves only for senders
 *    (404 otherwise; the slug comes from the subject, so it is guessable).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  id: "email-sent",
  query: {} as Record<string, string>,
  headers: {} as Record<string, string>,
  rendered: 0,
}));

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
}));
vi.mock("#core/server/utils/email-templates-mjml", () => ({
  buildWebViewHtml: () => {
    h.rendered++;
    return "<html><script>alert(1)</script></html>";
  },
}));
vi.mock("#core/server/utils/email-compliance", () => ({ emailComplianceSchema: async () => ({ members: true, emailClass: false }) }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const view = (await import("#core/server/api/email/view/[id].get")).default as (e: H3Event) => Promise<any>;
const resolve = (await import("#core/server/api/email/resolve.get")).default as (e: H3Event) => Promise<any>;

const ORG = { id: "org-lenox", name: "1033 Lenox", slug: "lenox", settings: null };
const EMAILS: Record<string, any> = {
  "email-sent": { id: "email-sent", status: "sent", subject: "Dues", content: "<p>Hi</p>", email_type: "general", organization: ORG },
  "email-draft": { id: "email-draft", status: "draft", subject: "Assessment", content: "<p>Draft</p>", email_type: "general", organization: ORG },
};

let canSend: boolean;

beforeEach(() => {
  h.id = "email-sent";
  h.query = {};
  h.headers = {};
  h.rendered = 0;
  canSend = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("getRouterParam", () => h.id);
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("setHeader", (_e: unknown, name: string, value: string) => {
    h.headers[name] = value;
  });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://d.test" } }));
  vi.stubGlobal("resolveEmailBranding", () => ({ headerText: null, footerImage: null, homepageUrl: null }));
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, grant: string) => {
    if (!canSend || org !== "org-lenox" || grant !== "communications") {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (op.op === "readItem") return EMAILS[op.id] ?? null;
      if (op.op === "readItems" && op.collection === "hoa_emails") {
        const ref = op.query.filter._or[0].web_slug._eq;
        const e = Object.values(EMAILS).find((x) => x.id === ref || x.web_slug === ref || `${x.id}-slug` === ref);
        return e ? [{ ...e, organization: e.organization.id }] : [];
      }
      return [];
    },
  }));
});

describe("GET /api/email/view/:id", () => {
  it("serves a sent email to anyone, sandboxed with no script and an opaque origin", async () => {
    await view({} as H3Event);
    expect(h.rendered).toBe(1);
    const csp = h.headers["Content-Security-Policy"];
    expect(csp).toMatch(/^sandbox\b/);
    expect(csp).not.toContain("allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
  });

  it("refuses a draft to someone who can't send for the community, before rendering it", async () => {
    h.id = "email-draft";
    await expect(view({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.rendered).toBe(0);
  });

  it("shows a draft to a sender, sandboxed and uncached", async () => {
    canSend = true;
    h.id = "email-draft";
    await view({} as H3Event);
    expect(h.rendered).toBe(1);
    expect(h.headers["Content-Security-Policy"]).toMatch(/^sandbox\b/);
    expect(h.headers["Cache-Control"]).toBe("private, no-store");
  });
});

describe("GET /api/email/resolve", () => {
  it("resolves a sent email for anyone", async () => {
    h.query = { org: "lenox", ref: "email-sent-slug" };
    expect(await resolve({} as H3Event)).toEqual({ id: "email-sent", subject: "Dues" });
  });

  it("answers 'not found' for a draft to anyone who can't send", async () => {
    h.query = { org: "lenox", ref: "email-draft-slug" };
    await expect(resolve({} as H3Event)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("resolves a draft for a sender", async () => {
    canSend = true;
    h.query = { org: "lenox", ref: "email-draft-slug" };
    expect(await resolve({} as H3Event)).toEqual({ id: "email-draft", subject: "Assessment" });
  });
});
