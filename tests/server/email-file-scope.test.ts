/**
 * An email carries only its own community's files (core/server/utils/org-files.ts).
 *
 * The email routes read, fetch and store Directus files with the ADMIN token.
 * Until 2026-11-12 they took any file id: a manager of one community could name
 * another community's private PDF — as an attachment, or as an inline
 * `<img src=…/assets/<id>>` — and have it mailed to any test address, stored
 * on a draft, or described by the preview. Now each id must be in the
 * community's library (its folder tree), or claimed by one of its records other
 * than an email's own attachment list; a body image or footer photo may also be
 * any image the public policy already serves. The queued sender drops a foreign
 * file from an email stored before the check, rather than mail it.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { H3Event } from "h3";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DIRECTUS = "https://d.test";

// Lenox (org-a) has a library rooted at fa-root; Birch (org-b) at fb-root.
const FOLDERS: Record<string, string | null> = {
  "fa-root": null,
  "fa-uploads": "fa-root",
  "fa-emails": "fa-uploads",
  "fb-root": null,
  "fb-docs": "fb-root",
};
const A_PDF = "aaaaaaaa-0000-4000-8000-000000000001"; // Lenox Uploads/Emails
const A_UNFILED_DOC = "aaaaaaaa-0000-4000-8000-000000000002"; // no folder; a Lenox hoa_documents row
const B_PDF = "bbbbbbbb-0000-4000-8000-000000000001"; // Birch Documents, private
const B_IMAGE = "bbbbbbbb-0000-4000-8000-000000000002"; // Birch image: public
const B_GOV_IMAGE = "bbbbbbbb-0000-4000-8000-000000000003"; // Birch governing page image: not public
const FILES: Record<string, { id: string; folder: string | null; type: string; description: string | null; filename_download: string }> = {
  [A_PDF]: { id: A_PDF, folder: "fa-emails", type: "application/pdf", description: null, filename_download: "budget.pdf" },
  [A_UNFILED_DOC]: { id: A_UNFILED_DOC, folder: null, type: "application/pdf", description: null, filename_download: "bylaws.pdf" },
  [B_PDF]: { id: B_PDF, folder: "fb-docs", type: "application/pdf", description: null, filename_download: "birch-legal.pdf" },
  [B_IMAGE]: { id: B_IMAGE, folder: "fb-root", type: "image/png", description: null, filename_download: "pool.png" },
  [B_GOV_IMAGE]: { id: B_GOV_IMAGE, folder: "fb-docs", type: "image/png", description: "governing-file", filename_download: "p1.png" },
};
const ORGS: Record<string, Record<string, unknown>> = {
  [ORG_A]: { id: ORG_A, name: "1033 Lenox", slug: "lenox", folder: "fa-root", street_address: "1 Elm St", city: "Austin", state: "TX", zip: "78701", settings: null },
  [ORG_B]: { id: ORG_B, name: "Birch", slug: "birch", folder: "fb-root", street_address: "2 Oak St", city: "Austin", state: "TX", zip: "78702", settings: null },
};

const h = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  ops: [] as Array<{ op: string; collection?: string; id?: string; query?: any; data?: any }>,
  writes: [] as string[],
  fetched: [] as string[],
  sent: [] as any[],
  /** file-owner records: which org's row points at which file. */
  owners: [] as Array<{ collection: string; field: string; file: string; org: string }>,
  emails: {} as Record<string, any>,
  failFiles: false,
}));

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readFiles: (query: any) => ({ op: "readFiles", collection: "directus_files", query }),
  readFolder: (id: string, query: any) => ({ op: "readFolder", collection: "directus_folders", id, query }),
  readFolders: (query: any) => ({ op: "readFolders", collection: "directus_folders", query }),
  createFolder: (data: any) => ({ op: "createFolder", collection: "directus_folders", data }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
}));
vi.mock("#core/server/utils/email-compliance", () => ({ emailComplianceSchema: async () => ({ members: false, emailClass: false }) }));
vi.mock("#core/server/utils/email-send-queue", async (orig) => ({
  ...(await orig<typeof import("#core/server/utils/email-send-queue")>()),
  // The synchronous send: the request itself fetches and mails.
  emailQueueSchema: async () => false,
}));
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  ...(await orig<typeof import("#core/server/utils/sendgrid")>()),
  sendOrganizationEmail: async (m: any) => {
    h.sent.push(m);
    return { success: true, messageId: `msg-${h.sent.length}` };
  },
}));

const JUNCTIONS: Record<string, string> = {
  hoa_emails_files: "hoa_emails_id",
  hoa_meetings_files: "hoa_meetings_id",
  hoa_projects_files: "hoa_projects_id",
  hoa_project_events_files: "hoa_project_events_id",
};

function fakeDirectus() {
  return {
    request: async (op: any) => {
      h.ops.push(op);
      const c = op.collection;
      if (op.op === "createItem" || op.op === "updateItem") {
        h.writes.push(`${op.op}:${c}`);
        return { id: op.id ?? `${c}-new`, ...op.data };
      }
      if (op.op === "readFiles") {
        if (h.failFiles) throw new Error("Directus down");
        const ids: string[] = (op.query?.filter?.id?._in ?? []).map((v: string) => v.toLowerCase());
        return ids.map((id) => FILES[id]).filter(Boolean);
      }
      if (op.op === "readFolder") {
        if (!(op.id in FOLDERS)) throw new Error("not found");
        return { id: op.id, parent: FOLDERS[op.id] };
      }
      if (op.op === "readItem" && c === "hoa_organizations") return ORGS[op.id] ?? null;
      if (op.op === "readItem" && c === "hoa_emails") return h.emails[op.id] ?? null;
      if (op.op === "readItems") {
        const f = op.query?.filter ?? {};
        const parent = JUNCTIONS[c];
        if (parent) {
          return h.owners
            .filter((o) => o.collection === c && o.file === f.directus_files_id?._eq)
            .map((o) => ({ [parent]: { organization: o.org } }));
        }
        const claimed = h.owners.filter((o) => o.collection === c && f[o.field]?._eq === o.file);
        if (claimed.length) return claimed.map((o) => ({ organization: o.org }));
        if (c === "hoa_members") return [{ id: "m-1", first_name: "Dana", email: "dana@example.com" }];
        return [];
      }
      if (op.op === "readFields") return [];
      return {};
    },
  };
}

function stubGlobals() {
  vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
  vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message || e.statusMessage), e));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("readBody", async () => h.body);
  // Oscar manages Lenox's communications, and nothing at Birch.
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, grant: string) => {
    if (org !== ORG_A || grant !== "communications") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test" },
    directus: { url: DIRECTUS, staticToken: "static-token" },
  }));
  vi.stubGlobal("getTypedDirectus", () => fakeDirectus());
  vi.stubGlobal("buildUniqueWebSlug", (s: string) => s.toLowerCase().replace(/\W+/g, "-"));
  vi.stubGlobal("resolveCcBccEmails", async () => []);
  vi.stubGlobal("resolveEmailBranding", () => ({ headerText: null, footerImage: null, homepageUrl: null }));
  vi.stubGlobal("fetch", async (url: string) => {
    h.fetched.push(String(url));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/octet-stream" } });
  });
}

type Handler = (e: H3Event) => Promise<any>;
let routes: { test: Handler; send: Handler; save: Handler; preview: Handler };

beforeAll(async () => {
  stubGlobals();
  // Warm the MJML graph outside any one test's clock.
  routes = {
    test: (await import("#core/server/api/email/test.post")).default as Handler,
    send: (await import("#core/server/api/email/send.post")).default as Handler,
    save: (await import("#core/server/api/email/save.post")).default as Handler,
    preview: (await import("#core/server/api/email/preview.post")).default as Handler,
  };
}, 120_000);

beforeEach(() => {
  h.body = {};
  h.ops = [];
  h.writes = [];
  h.fetched = [];
  h.sent = [];
  h.owners = [];
  h.emails = {};
  h.failFiles = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubGlobals();
});

const asset = (id: string) => `${DIRECTUS}/assets/${id}`;
const img = (id: string) => `<p>See</p><img src="${asset(id)}" alt="x" />`;
const assetFetches = () => h.fetched.filter((u) => u.includes("/assets/"));

describe("POST /api/email/test", () => {
  const base = { organizationId: ORG_A, emailId: "e-1", testEmails: ["me@example.com"], subject: "Dues", content: "<p>Hi</p>", emailType: "notice" };

  it("mails an attachment from the community's own library", async () => {
    h.body = { ...base, attachmentIds: [A_PDF] };
    const res = await routes.test({} as H3Event);
    expect(res.success).toBe(true);
    expect(assetFetches()).toEqual([asset(A_PDF)]);
    expect(h.sent[0].attachments).toEqual([expect.objectContaining({ filename: "budget.pdf", disposition: "attachment" })]);
  });

  it("refuses another community's attachment: 403, nothing read, fetched or mailed", async () => {
    h.body = { ...base, attachmentIds: [A_PDF, B_PDF] };
    await expect(routes.test({} as H3Event)).rejects.toMatchObject({ statusCode: 403, data: { code: "file_outside_org" } });
    expect(assetFetches()).toEqual([]);
    expect(h.sent).toHaveLength(0);
    expect(h.ops.some((o) => o.op === "readFiles" && o.query?.fields?.includes("filename_download"))).toBe(false);
  });

  it("refuses another community's private PDF named inline as /assets/<id>", async () => {
    h.body = { ...base, content: img(B_PDF) };
    await expect(routes.test({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(assetFetches()).toEqual([]);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses another community's governing page image inline — the public policy doesn't serve it", async () => {
    h.body = { ...base, content: img(B_GOV_IMAGE) };
    await expect(routes.test({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(assetFetches()).toEqual([]);
  });

  it("allows an inline image the public policy already serves, from any community", async () => {
    h.body = { ...base, content: img(B_IMAGE) };
    const res = await routes.test({} as H3Event);
    expect(res.success).toBe(true);
    expect(assetFetches()).toEqual([asset(B_IMAGE)]);
  });

  it("refuses an id spelled so Postgres reads it as another community's file (braces, no hyphens, upper case, an object)", async () => {
    for (const id of [`{${B_PDF}}`, B_PDF.replace(/-/g, ""), { id: B_PDF }]) {
      h.body = { ...base, attachmentIds: [id] };
      await expect(routes.test({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    }
    h.body = { ...base, attachmentIds: [B_PDF.toUpperCase()] };
    await expect(routes.test({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(assetFetches()).toEqual([]);
  });
});

describe("POST /api/email/save", () => {
  const base = { organizationId: ORG_A, subject: "Dues", content: "<p>Hi</p>", emailType: "notice" };

  it("stores an attachment from the community's own library", async () => {
    h.body = { ...base, attachmentIds: [A_PDF] };
    await routes.save({} as H3Event);
    const created = h.ops.find((o) => o.op === "createItem" && o.collection === "hoa_emails")!;
    expect(created.data.attachments).toEqual([{ directus_files_id: A_PDF }]);
  });

  it("refuses another community's attachment, footer photo or inline file before any write", async () => {
    for (const body of [
      { ...base, attachmentIds: [B_PDF] },
      { ...base, footerImageId: B_PDF },
      { ...base, content: img(B_PDF), status: "scheduled", scheduledAt: "2026-12-01T10:00:00Z" },
    ]) {
      h.body = body;
      await expect(routes.save({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(h.writes).toEqual([]);
  });

  it("allows a file outside the library that one of the community's records claims", async () => {
    h.owners = [{ collection: "hoa_documents", field: "file", file: A_UNFILED_DOC, org: ORG_A }];
    h.body = { ...base, attachmentIds: [A_UNFILED_DOC] };
    await routes.save({} as H3Event);
    expect(h.writes).toContain("createItem:hoa_emails");
  });

  it("does not count an email's own attachment list as the community's claim", async () => {
    // A pre-check Lenox email attached Birch's PDF; that row must not vouch for it.
    h.owners = [{ collection: "hoa_emails_files", field: "directus_files_id", file: B_PDF, org: ORG_A }];
    h.body = { ...base, attachmentIds: [B_PDF] };
    await expect(routes.save({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.writes).toEqual([]);
  });
});

describe("POST /api/email/send", () => {
  const base = { organizationId: ORG_A, subject: "Dues", content: "<p>Hi</p>", emailType: "notice", recipientIds: ["m-1"], includeBoardFooter: false };

  it("mails an attachment from the community's own library", async () => {
    h.body = { ...base, attachmentIds: [A_PDF] };
    await routes.send({} as H3Event);
    expect(assetFetches()).toEqual([asset(A_PDF)]);
    expect(h.sent[0].attachments).toEqual([expect.objectContaining({ filename: "budget.pdf" })]);
  });

  it("refuses another community's attachment or inline file: nothing stored, fetched or mailed", async () => {
    for (const body of [{ ...base, attachmentIds: [B_PDF] }, { ...base, content: img(B_PDF) }]) {
      h.body = body;
      await expect(routes.send({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(h.writes).toEqual([]);
    expect(assetFetches()).toEqual([]);
    expect(h.sent).toHaveLength(0);
    expect(h.ops.some((o) => o.collection === "hoa_members")).toBe(false);
  });
});

describe("POST /api/email/preview", () => {
  const base = { organizationId: ORG_A, subject: "Dues", content: "<p>Hi</p>", emailType: "notice", includeBoardFooter: false };

  it("describes the community's own attachment", async () => {
    h.body = { ...base, attachmentIds: [A_PDF] };
    const res = await routes.preview({} as H3Event);
    expect(res.attachments).toEqual([expect.objectContaining({ id: A_PDF, filename: "budget.pdf" })]);
  });

  it("refuses to describe another community's file", async () => {
    h.body = { ...base, attachmentIds: [B_PDF] };
    await expect(routes.preview({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops.some((o) => o.op === "readFiles" && o.query?.fields?.includes("filesize"))).toBe(false);
  });
});

describe("the queued sender (loadRenderContext) — an email stored before the check", () => {
  const STORED = "email-stored";
  const load = async () => {
    const { loadRenderContext } = await import("#core/server/utils/email-send-render");
    return loadRenderContext(fakeDirectus(), STORED, { appUrl: "https://app.test", directusUrl: DIRECTUS, staticToken: "static-token" });
  };

  beforeEach(() => {
    h.emails[STORED] = {
      id: STORED,
      organization: ORG_A,
      subject: "Dues",
      content: `${img(B_PDF)}${img(B_IMAGE)}${img(A_PDF)}`,
      email_type: "notice",
      content_mode: "visual",
      include_board_footer: false,
      footer_image: B_GOV_IMAGE,
      attachments: [
        { directus_files_id: { id: A_PDF, filename_download: "budget.pdf", type: "application/pdf" } },
        { directus_files_id: { id: B_PDF, filename_download: "birch-legal.pdf", type: "application/pdf" } },
      ],
    };
    // The stored email's own attachment rows: they vouch for nothing.
    h.owners = [
      { collection: "hoa_emails_files", field: "directus_files_id", file: A_PDF, org: ORG_A },
      { collection: "hoa_emails_files", field: "directus_files_id", file: B_PDF, org: ORG_A },
    ];
  });

  it("drops another community's attachment, inline file and footer photo, logs it, and sends the rest", async () => {
    const ctx = await load();
    expect(ctx.attachments.filter((a) => a.disposition === "attachment").map((a) => a.filename)).toEqual(["budget.pdf"]);
    expect(assetFetches().sort()).toEqual([asset(A_PDF), asset(A_PDF), asset(B_IMAGE)].sort());
    expect(assetFetches()).not.toContain(asset(B_PDF));
    expect(ctx.content).toContain(`src="${asset(B_PDF)}"`); // left as a URL the public policy won't serve
    expect(ctx.branding.footerImage).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/dropped 1 attachment\(s\) and 2 image\(s\)/));
  });

  it("parks the run when the files can't be checked", async () => {
    h.failFiles = true;
    await expect(load()).rejects.toMatchObject({ name: "RunParked" });
    expect(assetFetches()).toEqual([]);
  });
});
