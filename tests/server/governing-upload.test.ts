/**
 * Governing documents: upload and extraction (Session 3A; acceptance criterion 9).
 *
 * The real handlers on a MemoryDirectus with a file store that keeps bytes.
 *
 *  - a file sent in parts arrives byte for byte, and a damaged one is refused;
 *  - an upload creates a draft with per-page images and text, and draft provisions;
 *  - a member finds nothing of it: not in the list, not by id, not in search,
 *    not its page text, not its page images;
 *  - only people who manage governing documents may do any of it;
 *  - reading a scanned page is charged to the wallet and refused when it is empty;
 *  - proposing never touches a document that already has provisions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  session: null as any,
  query: {} as any,
  params: {} as any,
  multipart: [] as any[],
  body: null as any,
  balance: 100,
  llmCalls: [] as any[],
  llmReply: { text: "", stopReason: "end_turn" },
  charges: [] as any[],
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/org-storage", () => ({
  ensureOrgStorage: async (orgId: string) => ({ rootId: `root-${orgId}`, map: { documents: `documents-${orgId}` } }),
}));
vi.mock("#core/server/utils/ai-wallet", () => ({
  getWalletSummary: async () => ({ balanceCredits: h.balance }),
  chargeForCompletion: async (opts: any) => {
    h.charges.push(opts);
    return { credits: 3, balanceCredits: h.balance - 3 };
  },
}));
vi.mock("#core/server/utils/llm/provider", () => ({
  getLlmProvider: () => ({
    completeWithTools: async (params: any) => {
      h.llmCalls.push(params);
      return { ...h.llmReply, toolCalls: [], usage: { input_tokens: 1500, output_tokens: 400 }, rawContent: [] };
    },
  }),
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
  part: (await import("#core/server/api/governing/uploads/parts.post")).default as Handler,
  create: (await import("#core/server/api/governing/documents.post")).default as Handler,
  attachUpload: (await import("#core/server/api/governing/documents/[id]/sources/upload.post")).default as Handler,
  removeSource: (await import("#core/server/api/governing/documents/[id]/sources/[sourceId].delete")).default as Handler,
  storePage: (await import("#core/server/api/governing/sources/[id]/pages.post")).default as Handler,
  pages: (await import("#core/server/api/governing/sources/[id]/pages.get")).default as Handler,
  ocr: (await import("#core/server/api/governing/pages/[id]/ocr.post")).default as Handler,
  propose: (await import("#core/server/api/governing/documents/[id]/propose.post")).default as Handler,
  documents: (await import("#core/server/api/governing/documents.get")).default as Handler,
  document: (await import("#core/server/api/governing/documents/[id].get")).default as Handler,
  search: (await import("#core/server/api/governing/search.get")).default as Handler,
  asset: (await import("#core/server/api/directus/assets/[id].get")).default as Handler,
};
const { UPLOAD_PART_BYTES } = await import("#core/shared/governing/upload");

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const EXISTING_TEXT = "Poxies shall be in writing.";
const PAGE_1_TEXT = "RULES OF THE POOL\n\n1. No glass containrs on the deck.  \n2. Children must be accompanied.\n";
const PAGE_2_SCAN = "3. The pool closes at dusk.\n4. Gests are limited to two.\n";

/** A two-page PDF with no text layer. */
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
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

let db: MemoryDirectus;
let blobs: Map<string, Uint8Array>;
const uuid = () => crypto.randomUUID();

async function request(op: any): Promise<any> {
  const files = db.table("directus_files");
  switch (op.op) {
    case "uploadFiles": {
      const form = op.data as FormData;
      const blob = form.get("file") as File;
      const row = {
        id: uuid(),
        title: form.get("title"),
        description: form.get("description") ?? null,
        folder: form.get("folder") ?? null,
        type: blob.type,
        filesize: blob.size,
        filename_download: blob.name,
        uploaded_on: new Date().toISOString(),
      };
      blobs.set(row.id, new Uint8Array(await blob.arrayBuffer()));
      files.push(row);
      return row;
    }
    case "readAsset": {
      const bytes = blobs.get(op.id);
      if (!bytes) throw new Error("forbidden");
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
      for (const key of op.keys) blobs.delete(key);
      return null;
    case "deleteItems": {
      const table = db.table(op.collection);
      table.splice(0, table.length, ...table.filter((row) => !op.keysOrQuery.includes(row.id)));
      return null;
    }
    case "readFolders":
      return db.all("directus_folders", op.query?.filter);
    case "createItem":
      return db.request({ ...op, data: { id: uuid(), ...op.data } });
    case "createItems":
      return db.request({ ...op, data: op.data.map((d: any) => ({ id: uuid(), ...d })) });
    default:
      return db.request(op);
  }
}

const DOC = { published: "doc-published", other: "doc-other" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = new MemoryDirectus();
  blobs = new Map();
  h.balance = 100;
  h.llmCalls = [];
  h.charges = [];
  h.llmReply = { text: PAGE_2_SCAN, stopReason: "end_turn" };
  h.body = null;
  db.seed("hoa_organizations", [
    { id: ORG, storage_used_bytes: 0, folder: "folder-root" },
    { id: OTHER_ORG, storage_used_bytes: 0, folder: "folder-other" },
  ]);
  db.seed("hoa_governing_documents", [
    { id: DOC.published, organization: ORG, title: "By-Laws", kind: "bylaws", status: "published", sort: 1 },
    { id: DOC.other, organization: OTHER_ORG, title: "Other Declaration", kind: "declaration", status: "published", sort: 1 },
  ]);
  db.seed("hoa_governing_provisions", [
    { id: "prov-1", organization: ORG, document: DOC.published, citation: "By-Law 3.5", heading: "Proxies", text: EXISTING_TEXT, review_state: "reviewed", sort: 1 },
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
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({ request }));
  vi.stubGlobal("setResponseHeader", () => {});
  vi.stubGlobal("sendStream", () => "streamed");
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
const call = (route: Handler, params: Record<string, string> = {}, options: { query?: Record<string, string>; body?: any; multipart?: any[] } = {}) => {
  h.query = { orgId: ORG, ...(options.query ?? {}) };
  h.params = params;
  h.body = options.body ?? null;
  h.multipart = options.multipart ?? [];
  return route(event);
};
const field = (name: string, value: string) => ({ name, data: Buffer.from(value) });

/** Send `bytes` in parts of `size`, as the page does, and return the reference the next call takes. */
async function sendParts(bytes: Uint8Array, size = UPLOAD_PART_BYTES, type = "application/pdf", filename = "pool-rules.pdf") {
  const id = uuid();
  const parts = Math.max(1, Math.ceil(bytes.length / size));
  for (let index = 0; index < parts; index++) {
    const chunk = bytes.subarray(index * size, (index + 1) * size);
    await call(routes.part, {}, { multipart: [field("uploadId", id), field("index", String(index)), { name: "file", data: Buffer.from(chunk), type: "application/octet-stream" }] });
  }
  return { id, parts, sha256: sha256(bytes), filename, type };
}
const createDraft = async (bytes: Uint8Array = PDF, size?: number) =>
  call(routes.create, {}, { body: { title: "Pool Rules", kind: "rules", is_recorded_copy: false, upload: await sendParts(bytes, size) } });
const storePage = (sourceId: string, pageNumber: number, text?: string, image: Uint8Array = JPEG, type = "image/jpeg") =>
  call(routes.storePage, { id: sourceId }, {
    multipart: [field("page_number", String(pageNumber)), { name: "image", data: Buffer.from(image), type, filename: "page.jpg" }, ...(text == null ? [] : [field("text", text)])],
  });

/** The whole flow as a manager: a draft, two pages (one with a text layer, one read from its image), proposals. */
async function uploadedDraft() {
  const draft = await createDraft();
  const first = await storePage(draft.source, 1, PAGE_1_TEXT);
  const second = await storePage(draft.source, 2);
  await call(routes.ocr, { id: second.id });
  const proposed = await call(routes.propose, { id: draft.id });
  return { draft, first, second, proposed };
}

const audit = () => db.table("hoa_governing_audit_log");
const provisions = () => db.table("hoa_governing_provisions");
const pageRows = () => db.table("hoa_governing_pages");
const parts = () => db.table("directus_files").filter((f) => String(f.description ?? "").startsWith("governing-upload:"));

const NOT_MANAGERS: Array<[string, () => void, number]> = [
  ["a member", () => as("u-member"), 403],
  ["a property manager without the documents grant", () => as("u-pm-plain"), 403],
  ["an admin of another community", () => as("u-elsewhere"), 403],
  ["someone signed out", () => as(null), 401],
];

describe("a file sent in parts", () => {
  it("arrives byte for byte as one file, and the parts are gone", async () => {
    // Parts of 100 bytes: several requests for one small PDF.
    const draft = await createDraft(PDF, 100);
    expect(Math.ceil(PDF.length / 100)).toBeGreaterThan(2);
    expect(Buffer.from(blobs.get(draft.file)!).equals(Buffer.from(PDF))).toBe(true);
    expect(parts()).toHaveLength(0);
    expect(db.one("directus_files", draft.file)).toMatchObject({ type: "application/pdf", filename_download: "pool-rules.pdf", filesize: PDF.length, folder: `documents-${ORG}` });
  });

  it("a part sent twice replaces the first", async () => {
    const id = uuid();
    const part = (bytes: Uint8Array) => [field("uploadId", id), field("index", "0"), { name: "file", data: Buffer.from(bytes), type: "application/octet-stream" }];
    await call(routes.part, {}, { multipart: part(new Uint8Array([1, 2, 3])) });
    await call(routes.part, {}, { multipart: part(PDF) });
    expect(parts()).toHaveLength(1);
    const draft = await call(routes.create, {}, { body: { title: "Pool Rules", kind: "rules", upload: { id, parts: 1, sha256: sha256(PDF), filename: "a.pdf", type: "application/pdf" } } });
    expect(Buffer.from(blobs.get(draft.file)!).equals(Buffer.from(PDF))).toBe(true);
  });

  it("a file that does not match its checksum is refused, and nothing is kept", async () => {
    const upload = await sendParts(PDF, 100);
    await expect(call(routes.create, {}, { body: { title: "Pool Rules", kind: "rules", upload: { ...upload, sha256: sha256(JPEG) } } })).rejects.toMatchObject({ statusCode: 422 });
    expect(db.table("directus_files")).toHaveLength(0);
    expect(db.table("hoa_governing_documents")).toHaveLength(2);
    expect(audit()).toHaveLength(0);
  });

  it("a missing part is refused", async () => {
    const upload = await sendParts(PDF, 100);
    await expect(call(routes.create, {}, { body: { title: "Pool Rules", kind: "rules", upload: { ...upload, parts: upload.parts + 1 } } })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.table("hoa_governing_documents")).toHaveLength(2);
  });

  it("another community's parts cannot be claimed", async () => {
    const upload = await sendParts(PDF, 100);
    as("u-elsewhere");
    await expect(call(routes.create, {}, { query: { orgId: OTHER_ORG }, body: { title: "Taken", kind: "rules", upload } })).rejects.toMatchObject({ statusCode: 409 });
    expect(parts()).toHaveLength(upload.parts);
  });

  it("bytes that are not a PDF are not stored as one", async () => {
    const upload = await sendParts(new TextEncoder().encode("just some words"), 100);
    await expect(call(routes.create, {}, { body: { title: "Pool Rules", kind: "rules", upload } })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.table("directus_files")).toHaveLength(0);
  });

  it("attaches to an existing document the same way the one-request route does", async () => {
    const result = await call(routes.attachUpload, { id: DOC.published }, { body: { upload: await sendParts(PDF, 100), is_recorded_copy: true, is_authoritative: true, notes: "From the Clerk" } });
    expect(db.table("hoa_governing_sources")).toEqual([
      expect.objectContaining({ id: result.id, document: DOC.published, file: result.file, is_recorded_copy: true, is_authoritative: true, notes: "From the Clerk", page_count: 2 }),
    ]);
    expect(audit().map((a) => a.action)).toEqual(["source_attach"]);
    expect(provisions()[0].text).toBe(EXISTING_TEXT);
  });
});

describe("an upload becomes a draft (criterion 9)", () => {
  it("creates a draft document with its original, and two audit rows", async () => {
    const draft = await createDraft();
    expect(db.one("hoa_governing_documents", draft.id)).toMatchObject({ organization: ORG, title: "Pool Rules", kind: "rules", status: "draft", sort: 2 });
    expect(db.table("hoa_governing_sources")).toEqual([expect.objectContaining({ id: draft.source, document: draft.id, file: draft.file, page_count: 2, is_authoritative: true, is_recorded_copy: false })]);
    expect(audit().map((a) => a.action)).toEqual(["source_attach", "document_upload"]);
    expect(audit()[1]).toMatchObject({ organization: ORG, document: draft.id, actor_user: "u-admin", after: expect.objectContaining({ status: "draft", page_count: 2 }) });
    expect(provisions()).toHaveLength(1);
  });

  it("stores each page's image, and its text layer exactly as sent", async () => {
    const draft = await createDraft();
    const first = await storePage(draft.source, 1, PAGE_1_TEXT);
    const second = await storePage(draft.source, 2);
    expect(pageRows()).toEqual([
      expect.objectContaining({ id: first.id, organization: ORG, source: draft.source, page_number: 1, text: PAGE_1_TEXT, extraction: "text_layer" }),
      expect.objectContaining({ id: second.id, source: draft.source, page_number: 2, text: null, extraction: null }),
    ]);
    for (const page of pageRows()) {
      expect(db.one("directus_files", page.image)).toMatchObject({ type: "image/jpeg", folder: `documents-${ORG}` });
      expect(Buffer.from(blobs.get(page.image)!).equals(Buffer.from(JPEG))).toBe(true);
    }
    expect(db.one("hoa_organizations", ORG)!.storage_used_bytes).toBe(PDF.length + 2 * JPEG.length);
  });

  it("a page sent again gets the new image and keeps the text it had", async () => {
    const draft = await createDraft();
    const first = await storePage(draft.source, 1, PAGE_1_TEXT);
    const again = await storePage(draft.source, 1, "something else entirely, long enough to count as text", new Uint8Array([0xff, 0xd8, 9, 9]));
    expect(again.id).toBe(first.id);
    expect(pageRows()).toHaveLength(1);
    expect(pageRows()[0]).toMatchObject({ text: PAGE_1_TEXT, extraction: "text_layer", image: again.image });
    expect(db.one("directus_files", first.image)).toBeUndefined();
    expect(db.one("hoa_organizations", ORG)!.storage_used_bytes).toBe(PDF.length + 4);
  });

  it("refuses a page the file does not have, and anything that is not an image", async () => {
    const draft = await createDraft();
    await expect(storePage(draft.source, 3)).rejects.toMatchObject({ statusCode: 400 });
    await expect(storePage(draft.source, 0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(storePage(draft.source, 1, undefined, PDF, "application/pdf")).rejects.toMatchObject({ statusCode: 400 });
    expect(pageRows()).toHaveLength(0);
  });

  it("reads a scanned page from its image, stores the words as given, and charges the wallet", async () => {
    const draft = await createDraft();
    const second = await storePage(draft.source, 2);
    const result = await call(routes.ocr, { id: second.id });
    expect(result).toMatchObject({ extraction: "ocr", changed: true, credits: 3 });
    expect(pageRows()[0]).toMatchObject({ text: PAGE_2_SCAN, extraction: "ocr" });
    expect(h.llmCalls).toHaveLength(1);
    const [image] = h.llmCalls[0].messages[0].content;
    expect(image).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(JPEG).toString("base64") } });
    expect(h.charges).toEqual([expect.objectContaining({ orgId: ORG, userId: "u-admin", feature: "ocr" })]);
  });

  it("does not read a page that already has text unless asked to", async () => {
    const draft = await createDraft();
    const first = await storePage(draft.source, 1, PAGE_1_TEXT);
    expect(await call(routes.ocr, { id: first.id })).toMatchObject({ changed: false, extraction: "text_layer" });
    expect(h.llmCalls).toHaveLength(0);
    expect(await call(routes.ocr, { id: first.id }, { body: { force: true } })).toMatchObject({ changed: true });
    expect(pageRows()[0]).toMatchObject({ text: PAGE_2_SCAN, extraction: "ocr" });
  });

  it("refuses to read with an empty wallet, and keeps nothing of a reading that was cut off", async () => {
    const draft = await createDraft();
    const second = await storePage(draft.source, 2);
    h.balance = 0;
    await expect(call(routes.ocr, { id: second.id })).rejects.toMatchObject({ statusCode: 402 });
    expect(h.llmCalls).toHaveLength(0);

    h.balance = 100;
    h.llmReply = { text: "3. The pool clo", stopReason: "max_tokens" };
    await expect(call(routes.ocr, { id: second.id })).rejects.toMatchObject({ statusCode: 422 });
    expect(pageRows()[0]).toMatchObject({ text: null, extraction: null });
    expect(h.charges).toHaveLength(1);
  });

  it("a blank page is stored as read, with no text", async () => {
    const draft = await createDraft();
    const second = await storePage(draft.source, 2);
    h.llmReply = { text: "[blank page]", stopReason: "end_turn" };
    await call(routes.ocr, { id: second.id });
    expect(pageRows()[0]).toMatchObject({ text: "", extraction: "ocr" });
  });

  it("proposes draft provisions that are exact slices of the page text, with one audit row", async () => {
    const { draft, proposed } = await uploadedDraft();
    const made = provisions().filter((p) => p.document === draft.id).sort((a, b) => a.sort - b.sort);
    expect(proposed).toMatchObject({ provisions: made.length, pages: 2, pages_from_text_layer: 1, pages_read_from_image: 1, pages_without_text: 0 });
    expect(made.length).toBeGreaterThan(3);
    expect(made.every((p) => p.review_state === "ocr_draft" && p.organization === ORG)).toBe(true);
    const ofPage = (n: number) => made.filter((p) => p.source_key.startsWith(`upload:${draft.source}:${n}:`)).map((p) => p.text).join("");
    expect(ofPage(1)).toBe(PAGE_1_TEXT);
    expect(ofPage(2)).toBe(PAGE_2_SCAN);
    expect(made.map((p) => p.original_label)).toEqual([null, "1.", "2.", "3.", "4."]);
    expect(audit().at(-1)).toMatchObject({ action: "provisions_propose", document: draft.id, actor_user: "u-admin", after: expect.objectContaining({ provisions: made.length, review_state: "ocr_draft" }) });
  });

  it("never proposes into a document that already has provisions", async () => {
    const { draft } = await uploadedDraft();
    const before = JSON.stringify(provisions());
    await expect(call(routes.propose, { id: draft.id })).rejects.toMatchObject({ statusCode: 409 });

    const attached = await call(routes.attachUpload, { id: DOC.published }, { body: { upload: await sendParts(PDF, 100) } });
    await storePage(attached.id, 1, "By-Law 3.5 Proxies shall be in writing, corrected by a later upload.");
    await expect(call(routes.propose, { id: DOC.published })).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(provisions())).toBe(before);
    expect(db.one("hoa_governing_provisions", "prov-1")!.text).toBe(EXISTING_TEXT);
  });

  it("has nothing to propose before any page has text", async () => {
    const draft = await createDraft();
    await storePage(draft.source, 1);
    await expect(call(routes.propose, { id: draft.id })).rejects.toMatchObject({ statusCode: 409 });
    expect(provisions()).toHaveLength(1);
  });

  it("removing the original removes its pages and their images", async () => {
    const { draft } = await uploadedDraft();
    await call(routes.removeSource, { id: draft.id, sourceId: draft.source });
    expect(pageRows()).toHaveLength(0);
    expect(db.table("directus_files")).toHaveLength(0);
    expect(db.one("hoa_organizations", ORG)!.storage_used_bytes).toBe(0);
    expect(audit().at(-1)).toMatchObject({ action: "source_delete", before: expect.objectContaining({ pages_removed: 2 }) });
  });
});

describe("a member and an uploaded draft (criteria 7 and 9)", () => {
  it("a manager sees the draft, its pages and its draft provisions; the page text is not in the document answer", async () => {
    const { draft } = await uploadedDraft();
    const view = await call(routes.document, { id: draft.id });
    expect(view.document.status).toBe("draft");
    expect(view.pages.map((p: any) => [p.page_number, p.extraction])).toEqual([[1, "text_layer"], [2, "ocr"]]);
    expect(view.pages.every((p: any) => !("text" in p))).toBe(true);
    expect(view.provisions.length).toBeGreaterThan(3);
    expect((await call(routes.pages, { id: draft.source })).pages.map((p: any) => p.text)).toEqual([PAGE_1_TEXT, PAGE_2_SCAN]);
    expect((await call(routes.search, {}, { query: { q: "glass" } })).total).toBe(1);
  });

  it("a member finds nothing of it anywhere", async () => {
    const { draft, first, second } = await uploadedDraft();
    as("u-member");

    const list = await call(routes.documents);
    expect(list.documents.map((d: any) => d.id)).toEqual([DOC.published]);
    await expect(call(routes.document, { id: draft.id })).rejects.toMatchObject({ statusCode: 404 });
    for (const q of ["glass", "pool", "dusk", "Gests", "containrs"]) {
      expect((await call(routes.search, {}, { query: { q } })).total, q).toBe(0);
    }
    expect((await call(routes.search, {}, { query: { q: "Poxies" } })).total).toBe(1);

    await expect(call(routes.pages, { id: draft.source })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.asset, { id: draft.file })).rejects.toMatchObject({ statusCode: 403 });
    for (const page of [first, second]) {
      await expect(call(routes.asset, { id: page.image })).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("once the document is published a member may open its page images, but still not its unreviewed text", async () => {
    const { draft, first } = await uploadedDraft();
    db.one("hoa_governing_documents", draft.id)!.status = "published";
    as("u-member");
    await expect(call(routes.asset, { id: first.image })).resolves.toBe("streamed");
    const view = await call(routes.document, { id: draft.id });
    expect(view.provisions).toHaveLength(0);
    expect(view.pages).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain("glass");
    expect((await call(routes.search, {}, { query: { q: "glass" } })).total).toBe(0);
    await expect(call(routes.pages, { id: draft.source })).rejects.toMatchObject({ statusCode: 403 });
  });

  for (const [who, become, status] of NOT_MANAGERS) {
    it(`${who} cannot upload, store a page, read one or propose (${status}), and nothing is written`, async () => {
      const { draft, second } = await uploadedDraft();
      const upload = await sendParts(PDF, 100);
      const snapshot = () => JSON.stringify([db.table("directus_files"), db.table("hoa_governing_documents"), db.table("hoa_governing_sources"), pageRows(), provisions(), audit()]);
      const before = snapshot();
      h.llmCalls = [];
      become();

      const part = [field("uploadId", uuid()), field("index", "0"), { name: "file", data: Buffer.from(PDF), type: "application/octet-stream" }];
      await expect(call(routes.part, {}, { multipart: part })).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.create, {}, { body: { title: "Mine", kind: "rules", upload } })).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.attachUpload, { id: DOC.published }, { body: { upload } })).rejects.toMatchObject({ statusCode: status });
      await expect(storePage(draft.source, 1, "replaced")).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.pages, { id: draft.source })).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.ocr, { id: second.id }, { body: { force: true } })).rejects.toMatchObject({ statusCode: status });
      await expect(call(routes.propose, { id: draft.id })).rejects.toMatchObject({ statusCode: status });

      expect(snapshot()).toBe(before);
      expect(h.llmCalls).toHaveLength(0);
    });
  }
});
