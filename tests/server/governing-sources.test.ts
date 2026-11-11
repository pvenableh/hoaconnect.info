/**
 * Governing documents: original files (Session 1D).
 *
 * The real attach and delete handlers, the read routes and the asset proxy on a
 * MemoryDirectus with a file store.
 *
 *  - only people who manage governing documents may attach or delete (403 otherwise);
 *  - attach and delete each write one audit row, and neither touches a provision;
 *  - a member gets the originals of published documents only, from every route;
 *  - a member is refused the file of a draft by the asset proxy, by file id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { GOVERNING_FILE_MARKER } from "#core/shared/governing/files";
import { isPublicFile } from "../../scripts/lib/public-files";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({ session: null as any, query: {} as any, params: {} as any, multipart: [] as any[], streamed: 0 }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
// The folder layout is org-storage's business; here it only has to name a folder.
vi.mock("#core/server/utils/org-storage", () => ({
  ensureOrgStorage: async (orgId: string) => ({ rootId: `root-${orgId}`, map: { documents: `documents-${orgId}` } }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message ?? e.statusMessage), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
const fileOwner = await import("#core/server/utils/file-owner");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);
vi.stubGlobal("fileOwnerOrgIds", fileOwner.fileOwnerOrgIds);
vi.stubGlobal("isDataExportArchive", fileOwner.isDataExportArchive);

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  attach: (await import("#core/server/api/governing/documents/[id]/sources.post")).default as Handler,
  remove: (await import("#core/server/api/governing/documents/[id]/sources/[sourceId].delete")).default as Handler,
  documents: (await import("#core/server/api/governing/documents.get")).default as Handler,
  document: (await import("#core/server/api/governing/documents/[id].get")).default as Handler,
  provision: (await import("#core/server/api/governing/provisions/[id].get")).default as Handler,
  search: (await import("#core/server/api/governing/search.get")).default as Handler,
  overview: (await import("#core/server/api/governing/overview.get")).default as Handler,
  asset: (await import("#core/server/api/directus/assets/[id].get")).default as Handler,
};
const { pdfPageCount } = await import("#core/server/utils/governing-sources");

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const TEXT = "Poxies shall be in writing.";

/** A two-page PDF, small enough to read here. */
function twoPagePdf(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) body += `${String(at).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
const PDF = twoPagePdf();

let db: MemoryDirectus;
const uuid = () => crypto.randomUUID();

async function request(op: any): Promise<any> {
  const files = db.table("directus_files");
  switch (op.op) {
    case "uploadFiles": {
      const form = op.data as FormData;
      const blob = form.get("file") as File;
      const row = { id: uuid(), title: form.get("title"), description: form.get("description") ?? null, folder: form.get("folder") ?? null, type: blob.type, filesize: blob.size, filename_download: blob.name };
      files.push(row);
      return row;
    }
    case "readFiles":
      return db.all("directus_files", op.query?.filter);
    case "readFile": {
      const row = db.one("directus_files", op.id);
      if (!row) throw new Error("forbidden");
      return row;
    }
    case "deleteFiles":
      files.splice(0, files.length, ...files.filter((row) => !op.keys.includes(row.id)));
      return null;
    case "readFolders":
      return db.all("directus_folders", op.query?.filter);
    case "createItem":
      // Directus makes the uuid; the asset proxy only takes uuids.
      return db.request({ ...op, data: { id: uuid(), ...op.data } });
    default:
      return db.request(op);
  }
}

const DOC = { published: "doc-published", draft: "doc-draft", other: "doc-other" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = new MemoryDirectus();
  h.streamed = 0;
  db.seed("hoa_organizations", [
    { id: ORG, storage_used_bytes: 0, folder: "folder-root" },
    { id: OTHER_ORG, storage_used_bytes: 0, folder: "folder-other" },
  ]);
  db.seed("hoa_governing_documents", [
    { id: DOC.published, organization: ORG, title: "By-Laws", kind: "bylaws", status: "published", sort: 1 },
    { id: DOC.draft, organization: ORG, title: "Rules Upload", kind: "rules", status: "draft", sort: 2 },
    { id: DOC.other, organization: OTHER_ORG, title: "Other Declaration", kind: "declaration", status: "published", sort: 1 },
  ]);
  db.seed("hoa_governing_provisions", [
    { id: "prov-1", organization: ORG, document: DOC.published, citation: "By-Law 3.5", heading: "Proxies", text: TEXT, review_state: "reviewed", sort: 1 },
  ]);
  db.seed("hoa_members", [
    { id: "m-admin", user: "u-admin", organization: ORG, role: ROLE.hoaAdmin, status: "active" },
    { id: "m-board", user: "u-board", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-pm-docs", user: "u-pm-docs", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { documents: true } },
    { id: "m-pm-plain", user: "u-pm-plain", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { violations: true } },
    { id: "m-member", user: "u-member", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-elsewhere", user: "u-elsewhere", organization: OTHER_ORG, role: ROLE.hoaAdmin, status: "active" },
  ]);
  db.seed("hoa_board_members", [{ hoa_member: "m-board", status: "published", title: "director", term_start: null, term_end: null, sort: 1 }]);

  as("u-admin");
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("requireUserSession", async () => {
    if (!h.session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return h.session;
  });
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("readMultipartFormData", async () => h.multipart);
  vi.stubGlobal("getTypedDirectus", () => ({ request }));
  vi.stubGlobal("setResponseHeader", () => {});
  vi.stubGlobal("sendStream", () => {
    h.streamed += 1;
    return "streamed";
  });
  vi.stubGlobal("fetch", async () => new Response(PDF, { headers: { "content-type": "application/pdf" } }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    directus: { url: "http://directus.test", staticToken: "t" },
    public: {
      directusRoleAppAdmin: ROLE.appAdmin,
      directusRoleHoaAdmin: ROLE.hoaAdmin,
      directusRolePropertyManager: ROLE.pm,
      directusRoleMember: ROLE.member,
    },
  }));
});

const as = (userId: string | null, role = ROLE.member) => {
  h.session = userId ? { user: { id: userId, role, firstName: "Pat", lastName: "Lee", email: `${userId}@example.test` } } : null;
};
const call = (route: Handler, params: Record<string, string> = {}, query: Record<string, string> = {}) => {
  h.query = { orgId: ORG, ...query };
  h.params = params;
  return route(event);
};
const part = (name: string, value: string) => ({ name, data: Buffer.from(value) });
const filePart = (bytes: Uint8Array = PDF, type = "application/pdf", filename = "bylaws-recorded.pdf") => ({ name: "file", data: Buffer.from(bytes), type, filename });

async function attach(documentId: string, parts: any[] = [filePart(), part("is_recorded_copy", "true"), part("is_authoritative", "true"), part("notes", "From the Clerk")]) {
  h.multipart = parts;
  return call(routes.attach, { id: documentId });
}
const audit = () => db.table("hoa_governing_audit_log");
const sources = () => db.table("hoa_governing_sources");

const MANAGERS: Array<[string, () => void]> = [
  ["an HOA Admin", () => as("u-admin")],
  ["a current board member", () => as("u-board")],
  ["a property manager with the documents grant", () => as("u-pm-docs")],
  ["an App Admin", () => as("u-staff", ROLE.appAdmin)],
];
const NOT_MANAGERS: Array<[string, () => void, number]> = [
  ["a member", () => as("u-member"), 403],
  ["a property manager without the documents grant", () => as("u-pm-plain"), 403],
  ["an admin of another community", () => as("u-elsewhere"), 403],
  ["someone signed out", () => as(null), 401],
];

describe("original documents — attach", () => {
  it("reads the page count of a PDF, and gives none for anything else or for bytes it cannot read", async () => {
    expect(await pdfPageCount(PDF, "application/pdf")).toBe(2);
    expect(await pdfPageCount(PDF, "image/png")).toBeNull();
    expect(await pdfPageCount(new TextEncoder().encode("not a pdf"), "application/pdf")).toBeNull();
  });

  for (const [who, become] of MANAGERS) {
    it(`${who} attaches a file: a file, a source row and one audit row`, async () => {
      become();
      const result = await attach(DOC.published);
      expect(result.page_count).toBe(2);

      const [file] = db.table("directus_files");
      expect(file).toMatchObject({ id: result.file, type: "application/pdf", filename_download: "bylaws-recorded.pdf", filesize: PDF.length, folder: `documents-${ORG}`, description: GOVERNING_FILE_MARKER });
      expect(sources()).toEqual([
        expect.objectContaining({ id: result.id, organization: ORG, document: DOC.published, file: result.file, is_recorded_copy: true, is_authoritative: true, notes: "From the Clerk", page_count: 2 }),
      ]);
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({
        action: "source_attach",
        organization: ORG,
        document: DOC.published,
        actor_user: h.session.user.id,
        actor_name: "Pat Lee",
        after: expect.objectContaining({ source: result.id, file: result.file, filename: "bylaws-recorded.pdf", page_count: 2 }),
      });
      expect(db.one("hoa_organizations", ORG)!.storage_used_bytes).toBe(PDF.length);
    });
  }

  for (const [who, become, status] of NOT_MANAGERS) {
    it(`${who} cannot attach or delete (${status}), and nothing is written`, async () => {
      const made = await attach(DOC.published);
      become();
      db.ops.length = 0;
      await expect(attach(DOC.published)).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.remove, { id: DOC.published, sourceId: made.id })).rejects.toMatchObject({ statusCode: status });
      expect(sources()).toHaveLength(1);
      expect(db.table("directus_files")).toHaveLength(1);
      expect(audit()).toHaveLength(1);
    });
  }

  it("takes an image, with no page count; flags default to false", async () => {
    const result = await attach(DOC.published, [filePart(new Uint8Array([1, 2, 3]), "image/png", "page-1.png")]);
    expect(result.page_count).toBeNull();
    // Marked, so Directus's public image read leaves it out (scripts/lib/public-files.ts).
    expect(isPublicFile(db.one("directus_files", result.file)!)).toBe(false);
    expect(sources()[0]).toMatchObject({ is_recorded_copy: false, is_authoritative: false, notes: null, page_count: null });
  });

  it("refuses a file that is neither a PDF nor an image, an empty request, and a document of another community", async () => {
    await expect(attach(DOC.published, [filePart(new Uint8Array([1]), "application/zip", "a.zip")])).rejects.toMatchObject({ statusCode: 400 });
    await expect(attach(DOC.published, [])).rejects.toMatchObject({ statusCode: 400 });
    await expect(attach(DOC.other)).rejects.toMatchObject({ statusCode: 404 });
    await expect(attach("no-such-document")).rejects.toMatchObject({ statusCode: 404 });
    expect(sources()).toEqual([]);
    expect(db.table("directus_files")).toEqual([]);
    expect(audit()).toEqual([]);
  });

  it("a manager may attach to a draft", async () => {
    await attach(DOC.draft);
    expect(sources()[0]).toMatchObject({ document: DOC.draft });
  });
});

describe("original documents — delete", () => {
  it("removes the row and the file and writes one audit row with what was there", async () => {
    const made = await attach(DOC.published);
    await call(routes.remove, { id: DOC.published, sourceId: made.id });
    expect(sources()).toEqual([]);
    expect(db.table("directus_files")).toEqual([]);
    expect(audit().map((a) => a.action)).toEqual(["source_attach", "source_delete"]);
    expect(audit()[1]).toMatchObject({
      organization: ORG,
      document: DOC.published,
      actor_user: "u-admin",
      before: expect.objectContaining({ source: made.id, file: made.file, filename: "bylaws-recorded.pdf", is_recorded_copy: true }),
    });
    expect(db.one("hoa_organizations", ORG)!.storage_used_bytes).toBe(0);
  });

  it("is a 404 for a source named under the wrong document, and nothing is removed", async () => {
    const made = await attach(DOC.published);
    await expect(call(routes.remove, { id: DOC.draft, sourceId: made.id })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(routes.remove, { id: DOC.published, sourceId: "nope" })).rejects.toMatchObject({ statusCode: 404 });
    expect(sources()).toHaveLength(1);
    expect(audit()).toHaveLength(1);
  });
});

describe("original documents — provision text is never touched", () => {
  it("attach and delete issue no write to the provisions collection, and the text is unchanged", async () => {
    db.ops.length = 0;
    const made = await attach(DOC.published);
    await call(routes.remove, { id: DOC.published, sourceId: made.id });
    expect(db.ops.filter((op) => op.collection === "hoa_governing_provisions")).toEqual([]);
    expect(db.one("hoa_governing_provisions", "prov-1")!.text).toBe(TEXT);
  });
});

describe("original documents — what a member gets", () => {
  let published: { id: string; file: string };
  let draft: { id: string; file: string };
  beforeEach(async () => {
    as("u-admin");
    published = await attach(DOC.published);
    draft = await attach(DOC.draft, [filePart(PDF, "application/pdf", "rules-upload.pdf")]);
  });

  for (const [who, become] of [NOT_MANAGERS[0]!, NOT_MANAGERS[1]!] as Array<[string, () => void, number]>) {
    it(`${who}: the published document's original from the document and provision routes; the draft's from no route`, async () => {
      become();
      const document = await call(routes.document, { id: DOC.published });
      const provision = await call(routes.provision, { id: "prov-1" });
      for (const answer of [document, provision]) {
        expect(answer.sources).toEqual([
          expect.objectContaining({ id: published.id, file: published.file, filename: "bylaws-recorded.pdf", type: "application/pdf", page_count: 2, is_recorded_copy: true, is_authoritative: true, notes: "From the Clerk" }),
        ]);
      }
      const answers = [
        await call(routes.documents),
        document,
        provision,
        await call(routes.overview),
        await call(routes.search, {}, { q: "poxies" }),
        await call(routes.search, {}, { q: "rules" }),
      ];
      for (const answer of answers) {
        const body = JSON.stringify(answer);
        expect(body).not.toContain(draft.id);
        expect(body).not.toContain(draft.file);
        expect(body).not.toContain("rules-upload.pdf");
      }
      await expect(call(routes.document, { id: DOC.draft })).rejects.toMatchObject({ statusCode: 404 });
    });

    it(`${who}: opens the published original through the asset proxy, and is refused the draft's by file id`, async () => {
      become();
      await expect(call(routes.asset, { id: published.file })).resolves.toBe("streamed");
      await expect(call(routes.asset, { id: draft.file })).rejects.toMatchObject({ statusCode: 403 });
      expect(h.streamed).toBe(1);
    });
  }

  it("a member is refused a draft's original even when it is an image, which the proxy otherwise serves to any session", async () => {
    as("u-admin");
    const scan = await attach(DOC.draft, [filePart(new Uint8Array([1, 2, 3]), "image/png", "page-1.png")]);
    as("u-member");
    await expect(call(routes.asset, { id: scan.file })).rejects.toMatchObject({ statusCode: 403 });
  });

  for (const [who, become] of MANAGERS) {
    it(`${who} sees and opens the draft's original`, async () => {
      become();
      expect((await call(routes.document, { id: DOC.draft })).sources.map((s: any) => s.id)).toEqual([draft.id]);
      await expect(call(routes.asset, { id: draft.file })).resolves.toBe("streamed");
    });
  }

  it("someone from another community is refused both files; someone signed out gets a 401", async () => {
    as("u-elsewhere");
    await expect(call(routes.asset, { id: published.file })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.asset, { id: draft.file })).rejects.toMatchObject({ statusCode: 403 });
    as(null);
    await expect(call(routes.asset, { id: published.file })).rejects.toMatchObject({ statusCode: 401 });
    expect(h.streamed).toBe(0);
  });

  it("once the draft is published, its original reaches the member", async () => {
    Object.assign(db.one("hoa_governing_documents", DOC.draft)!, { status: "published" });
    as("u-member");
    expect((await call(routes.document, { id: DOC.draft })).sources.map((s: any) => s.id)).toEqual([draft.id]);
    await expect(call(routes.asset, { id: draft.file })).resolves.toBe("streamed");
  });
});
