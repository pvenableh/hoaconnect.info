/**
 * Reading a community's email takes the same gate as sending one: an admin of
 * that community, or a manager with the communications grant.
 *
 *  - GET /api/email/:id — the gate runs on the community the email belongs to,
 *    before its recipients are read; until 2026-11-12 any signed-in user could
 *    read any community's email (content, every recipient's name and address);
 *  - GET /api/email/list — the gate runs on the community asked for; until
 *    then any signed-in user could list any community's emails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({ reads: [] as string[], query: {} as Record<string, string>, id: "email-lenox" }));

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  aggregate: (collection: string, options: any) => ({ op: "aggregate", collection, options }),
}));
vi.mock("#core/server/utils/email-compliance", () => ({ emailComplianceSchema: async () => ({ members: true, emailClass: true }) }));
vi.mock("#core/server/utils/email-send-queue", () => ({ emailQueueSchema: async () => true }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const detail = (await import("#core/server/api/email/[id].get")).default as (e: H3Event) => Promise<any>;
const list = (await import("#core/server/api/email/list.get")).default as (e: H3Event) => Promise<any>;

const EMAILS: Record<string, any> = {
  "email-lenox": { id: "email-lenox", organization: { id: "org-lenox", name: "1033 Lenox" }, status: "sent", subject: "Dues", send_run_key: "m:1" },
  "email-other": { id: "email-other", organization: { id: "org-other", name: "Other" }, status: "sent", subject: "Private", send_run_key: "m:1" },
};

beforeEach(() => {
  h.reads = [];
  h.query = {};
  h.id = "email-lenox";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("getRouterParam", () => h.id);
  vi.stubGlobal("getQuery", () => h.query);
  // Oscar manages Lenox (communications) and nothing else.
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, grant: string) => {
    if (org !== "org-lenox" || grant !== "communications") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.reads.push(`${op.op}:${op.collection}`);
      if (op.op === "readItem") return EMAILS[op.id] ?? null;
      if (op.op === "readItems" && op.collection === "hoa_email_recipients") return [{ id: "r1", recipient_email: "dana@example.com" }];
      if (op.op === "readItems") return [{ id: "e1", subject: "Dues" }];
      if (op.op === "aggregate") return [{ count: 1 }];
      return null;
    },
  }));
});

describe("GET /api/email/:id", () => {
  it("answers the caller's own community's email, recipients included", async () => {
    const res = await detail({} as H3Event);
    expect(res.email.subject).toBe("Dues");
    expect(res.email.recipients).toHaveLength(1);
  });

  it("refuses another community's email before reading its recipients", async () => {
    h.id = "email-other";
    await expect(detail({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.reads).not.toContain("readItems:hoa_email_recipients");
  });
});

describe("GET /api/email/list", () => {
  it("lists the caller's own community, and refuses another before reading anything", async () => {
    h.query = { organizationId: "org-lenox" };
    expect((await list({} as H3Event)).emails).toHaveLength(1);
    h.reads = [];
    h.query = { organizationId: "org-other" };
    await expect(list({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.reads).toEqual([]);
  });
});
