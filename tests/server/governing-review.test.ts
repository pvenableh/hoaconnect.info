/**
 * Governing documents: review, the audited text writes, the publish gate and
 * deleting a draft (docs/prompts/governing-docs.md, Session 3B; spec §7 and
 * acceptance criterion 8).
 *
 * The real handlers and guards on a MemoryDirectus. Proves:
 *  - only managers reach any of these routes;
 *  - every write that changes a provision's text (edit, split, merge) writes
 *    an audit row holding the text before and after, and stores text exactly
 *    as given: a split's pieces joined are the original, a merge is the exact
 *    concatenation;
 *  - review states move as decided, and [illegible] blocks "reviewed";
 *  - a document publishes only when every provision is reviewed, and a member
 *    sees nothing of it until then;
 *  - a draft can be deleted with everything under it; a published one cannot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({ session: null as any, query: {} as any, params: {} as any, body: {} as any, failAudit: false }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  review: (await import("#core/server/api/governing/documents/[id]/review.get")).default as Handler,
  edit: (await import("#core/server/api/governing/provisions/[id].patch")).default as Handler,
  state: (await import("#core/server/api/governing/provisions/[id]/review-state.post")).default as Handler,
  split: (await import("#core/server/api/governing/provisions/[id]/split.post")).default as Handler,
  merge: (await import("#core/server/api/governing/provisions/[id]/merge.post")).default as Handler,
  reorder: (await import("#core/server/api/governing/documents/[id]/reorder.post")).default as Handler,
  publish: (await import("#core/server/api/governing/documents/[id]/publish.post")).default as Handler,
  remove: (await import("#core/server/api/governing/documents/[id].delete")).default as Handler,
  documents: (await import("#core/server/api/governing/documents.get")).default as Handler,
  document: (await import("#core/server/api/governing/documents/[id].get")).default as Handler,
  search: (await import("#core/server/api/governing/search.get")).default as Handler,
};

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const PROVISIONS = "hoa_governing_provisions";

// Text with everything a "helpful" write path would damage: a typo, words run
// together, doubled and trailing spaces, a trailing newline.
const A = "ARTICLE I\n  Poxies shall be in writing,  filed with theCounty. \n";
const B = "(a) quorum is a majority\n";
const C = "Signed [illegible] President [signature] [seal]\n";
const PUBLISHED = "Poxies shall be in writing.";

let db: MemoryDirectus;
let writes: any[];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = new MemoryDirectus();
  writes = [];
  h.failAudit = false;
  db.seed("hoa_organizations", [{ id: ORG, storage_used_bytes: 1000 }]);
  db.seed("hoa_governing_documents", [
    { id: "draft", organization: ORG, title: "Rules Upload", kind: "rules", status: "draft", sort: 2 },
    { id: "pub", organization: ORG, title: "By-Laws", kind: "bylaws", status: "published", sort: 1 },
    { id: "other", organization: OTHER_ORG, title: "Other", kind: "rules", status: "draft", sort: 1 },
  ]);
  const draft = (id: string, sort: number, text: string, page: number, n: number) => ({
    id, organization: ORG, document: "draft", source_key: `upload:src:${page}:${n}`, sort, citation: null, heading: null,
    original_label: null, text, review_state: "ocr_draft", reviewed_by: null, reviewed_at: null, block_type: "text",
  });
  db.seed(PROVISIONS, [
    draft("a", 1, A, 1, 1),
    draft("b", 2, B, 1, 2),
    draft("c", 3, C, 2, 1),
    { id: "p", organization: ORG, document: "pub", source_key: "bylaws:3.5", sort: 1, citation: "By-Law 3.5", heading: "Proxies", text: PUBLISHED, review_state: "verified", reviewed_by: "u-old", reviewed_at: "2026-01-01T00:00:00Z" },
    { id: "x", organization: OTHER_ORG, document: "other", sort: 1, text: "Elsewhere.", review_state: "ocr_draft" },
  ]);
  db.seed("hoa_governing_sources", [{ id: "src", organization: ORG, document: "draft", file: "file-src", is_authoritative: true, page_count: 2 }]);
  db.seed("hoa_governing_pages", [
    { id: "pg1", organization: ORG, source: "src", page_number: 1, image: "img-1", text: A + B, extraction: "ocr" },
    { id: "pg2", organization: ORG, source: "src", page_number: 2, image: "img-2", text: C, extraction: "ocr" },
  ]);
  db.seed("directus_files", [
    { id: "file-src", filename_download: "rules.pdf", type: "application/pdf", filesize: 500 },
    { id: "img-1", filename_download: "page-1.jpg", type: "image/jpeg", filesize: 100 },
    { id: "img-2", filename_download: "page-2.jpg", type: "image/jpeg", filesize: 100 },
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

  const files = () => db.table("directus_files");
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (/^(create|update|delete)/.test(op.op)) writes.push(op);
      if (op.op === "readFiles") return db.all("directus_files", op.query?.filter);
      if (op.op === "deleteFiles") return void files().splice(0, files().length, ...files().filter((f) => !op.keys.includes(f.id)));
      if (op.op === "deleteItems") {
        const table = db.table(op.collection);
        return void table.splice(0, table.length, ...table.filter((r) => !op.keysOrQuery.includes(r.id)));
      }
      if (op.op === "createItem") {
        if (h.failAudit && op.collection === "hoa_governing_audit_log") throw new Error("audit log unavailable");
        return db.request({ ...op, data: { id: crypto.randomUUID(), ...op.data } });
      }
      return db.request(op);
    },
  }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      directusRoleAppAdmin: ROLE.appAdmin,
      directusRoleHoaAdmin: ROLE.hoaAdmin,
      directusRolePropertyManager: ROLE.pm,
      directusRoleMember: ROLE.member,
    },
  }));
});

const as = (userId: string | null, role = ROLE.member) => {
  h.session = userId ? { user: { id: userId, role, first_name: "Pat", last_name: "Admin", email: `${userId}@example.test` } } : null;
};
const call = (route: Handler, id: string, body: unknown = {}, query: Record<string, string> = {}) => {
  h.query = { orgId: ORG, ...query };
  h.params = { id };
  h.body = body;
  return route(event);
};
const audit = () => db.table("hoa_governing_audit_log");
const prov = (id: string) => db.all(PROVISIONS, { id })[0]!;
const draftTexts = () =>
  db.all(PROVISIONS, { document: "draft" }).sort((x: any, y: any) => x.sort - y.sort).map((p: any) => p.text as string);

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

describe("who may review", () => {
  it.each(NOT_MANAGERS)("%s is refused on every route, and nothing is written", async (_n, signIn, code) => {
    signIn();
    const refused = { statusCode: code };
    await expect(call(routes.review, "draft")).rejects.toMatchObject(refused);
    await expect(call(routes.edit, "a", { text: "changed" })).rejects.toMatchObject(refused);
    await expect(call(routes.state, "a", { state: "reviewed" })).rejects.toMatchObject(refused);
    await expect(call(routes.split, "a", { at: 3 })).rejects.toMatchObject(refused);
    await expect(call(routes.merge, "a")).rejects.toMatchObject(refused);
    await expect(call(routes.reorder, "draft", { ids: ["c", "b", "a"] })).rejects.toMatchObject(refused);
    await expect(call(routes.publish, "draft")).rejects.toMatchObject(refused);
    await expect(call(routes.remove, "draft")).rejects.toMatchObject(refused);
    expect(writes).toHaveLength(0);
    expect(prov("a").text).toBe(A);
  });

  it("a manager of one community cannot reach another's provision or document", async () => {
    as("u-admin");
    await expect(call(routes.edit, "x", { text: "changed" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(routes.publish, "other")).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(routes.remove, "other")).rejects.toMatchObject({ statusCode: 404 });
    expect(writes).toHaveLength(0);
  });

  it("the review answer gives each provision its page, and each page its image and draft text", async () => {
    as("u-admin");
    const review = await call(routes.review, "draft");
    expect(review.provisions.map((p: any) => [p.id, p.page])).toEqual([
      ["a", { source: "src", page_number: 1 }],
      ["b", { source: "src", page_number: 1 }],
      ["c", { source: "src", page_number: 2 }],
    ]);
    expect(review.provisions[0].text).toBe(A);
    expect(review.provisions[2].markers).toEqual({ "[illegible]": 1, "[signature]": 1, "[seal]": 1, "[drawing]": 0 });
    expect(review.pages).toEqual([
      { id: "pg1", source: "src", page_number: 1, image: "img-1", text: A + B, extraction: "ocr" },
      { id: "pg2", source: "src", page_number: 2, image: "img-2", text: C, extraction: "ocr" },
    ]);
    expect(review.blockers).toEqual({ provisions: 3, unreviewed: 3, illegible: 1 });
    expect(review.can_publish).toBe(false);
  });
});

describe("the audited edit (criterion 8)", () => {
  it.each(MANAGERS)("%s may edit text; it is stored exactly as sent, with one audit row of before and after", async (_n, signIn) => {
    signIn();
    const next = "ARTICLE I\n  Poxies shall be in writing,  filed with  theCounty.   \n\n";
    expect(await call(routes.edit, "a", { text: next })).toMatchObject({ changed: true, review_state: "ocr_draft" });
    expect(prov("a").text).toBe(next);
    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({
      action: "text_edit",
      organization: ORG,
      document: "draft",
      provision: "a",
      actor_user: h.session.user.id,
      actor_name: "Pat Admin",
      before: { text: A },
      after: { text: next },
    });
    expect(audit()[0]!.occurred_at).toBeTruthy();
  });

  it("editing the text of a reviewed draft provision sets it back to ocr_draft", async () => {
    as("u-admin");
    await call(routes.state, "a", { state: "reviewed" });
    expect(await call(routes.edit, "a", { text: A + "more" })).toMatchObject({ review_state: "ocr_draft" });
    expect(prov("a")).toMatchObject({ review_state: "ocr_draft", reviewed_by: null, reviewed_at: null });
    expect(audit().at(-1)).toMatchObject({ action: "text_edit", before: { review_state: "reviewed" }, after: { review_state: "ocr_draft" } });
  });

  it("citation, heading and label are audited too, and leave the text and the review state alone", async () => {
    as("u-admin");
    await call(routes.state, "a", { state: "reviewed" });
    await call(routes.edit, "a", { citation: "Rule 1", heading: "Proxies", original_label: "ARTICLE I" });
    expect(prov("a")).toMatchObject({ citation: "Rule 1", heading: "Proxies", original_label: "ARTICLE I", text: A, review_state: "reviewed" });
    expect(audit().at(-1)).toMatchObject({ action: "provision_edit", before: { citation: null }, after: { citation: "Rule 1", heading: "Proxies" } });
    expect(audit().at(-1)!.after).not.toHaveProperty("text");
  });

  it("sending what is already there changes nothing and writes no audit row", async () => {
    as("u-admin");
    expect(await call(routes.edit, "a", { text: A })).toMatchObject({ changed: false });
    expect(writes).toHaveLength(0);
  });

  it("refuses empty text and text that is not a string", async () => {
    as("u-admin");
    await expect(call(routes.edit, "a", { text: "" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(routes.edit, "a", { text: 5 })).rejects.toMatchObject({ statusCode: 400 });
    expect(writes).toHaveLength(0);
  });

  it("a published provision needs a reason; with one it is edited, stays visible to members, and the reason is recorded", async () => {
    as("u-admin");
    await expect(call(routes.edit, "p", { text: "Proxies shall be in writing." })).rejects.toMatchObject({ statusCode: 400 });
    expect(prov("p").text).toBe(PUBLISHED);
    expect(writes).toHaveLength(0);

    await call(routes.edit, "p", { text: "Poxies shall be in writing .", reason: "  Matches the recorded page  " });
    expect(prov("p")).toMatchObject({ text: "Poxies shall be in writing .", review_state: "reviewed", reviewed_by: "u-admin" });
    expect(audit()[0]).toMatchObject({ action: "text_edit", reason: "Matches the recorded page", before: { text: PUBLISHED, review_state: "verified" } });

    as("u-member");
    const seen = await call(routes.document, "pub");
    expect(seen.provisions.map((p: any) => p.text)).toEqual(["Poxies shall be in writing ."]);
  });

  it("when the audit row cannot be written the text is put back and the edit fails", async () => {
    as("u-admin");
    h.failAudit = true;
    await expect(call(routes.edit, "a", { text: "changed" })).rejects.toThrow("audit log unavailable");
    expect(prov("a")).toMatchObject({ text: A, review_state: "ocr_draft" });
    expect(audit()).toHaveLength(0);
  });
});

describe("review states", () => {
  it("the same manager marks reviewed, then verified, then reopens; an audit row each time", async () => {
    as("u-board");
    expect(await call(routes.state, "a", { state: "reviewed" })).toMatchObject({ review_state: "reviewed", changed: true });
    expect(prov("a")).toMatchObject({ review_state: "reviewed", reviewed_by: "u-board" });
    await call(routes.state, "a", { state: "verified" });
    await call(routes.state, "a", { state: "ocr_draft" });
    expect(prov("a")).toMatchObject({ review_state: "ocr_draft", reviewed_by: null, reviewed_at: null, text: A });
    expect(audit().map((r: any) => [r.action, r.before.review_state, r.after.review_state])).toEqual([
      ["review_state", "ocr_draft", "reviewed"],
      ["review_state", "reviewed", "verified"],
      ["review_state", "verified", "ocr_draft"],
    ]);
  });

  it("refuses a skipped step, an unknown state, and reopening a published provision", async () => {
    as("u-admin");
    await expect(call(routes.state, "a", { state: "verified" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(routes.state, "a", { state: "approved" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(routes.state, "p", { state: "ocr_draft" })).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toHaveLength(0);
  });

  it("[illegible] blocks reviewed until it is edited away; [signature] and [seal] do not", async () => {
    as("u-admin");
    await expect(call(routes.state, "c", { state: "reviewed" })).rejects.toMatchObject({ statusCode: 409 });
    expect(prov("c").review_state).toBe("ocr_draft");
    await call(routes.edit, "c", { text: "Signed J. Smith President [signature] [seal]\n" });
    expect(await call(routes.state, "c", { state: "reviewed" })).toMatchObject({ review_state: "reviewed" });
  });
});

describe("split, merge and reorder", () => {
  it("a split's pieces joined are the original text exactly, and the audit row holds both sides", async () => {
    as("u-admin");
    const at = A.indexOf("  Poxies");
    const { created } = await call(routes.split, "a", { at });
    expect(prov("a").text + prov(created).text).toBe(A);
    expect(prov(created)).toMatchObject({ document: "draft", organization: ORG, review_state: "ocr_draft", text: A.slice(at) });
    expect(draftTexts()).toEqual([A.slice(0, at), A.slice(at), B, C]);
    expect(draftTexts().join("")).toBe(A + B + C);

    const review = await call(routes.review, "draft");
    expect(review.provisions[1]).toMatchObject({ id: created, page: { source: "src", page_number: 1 } });

    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({
      action: "provision_split",
      provision: "a",
      before: { id: "a", text: A },
      after: { at, pieces: [{ id: "a", text: A.slice(0, at) }, { id: created, text: A.slice(at) }] },
    });
  });

  it("a split of a reviewed provision leaves both pieces unreviewed", async () => {
    as("u-admin");
    await call(routes.state, "a", { state: "reviewed" });
    const { created } = await call(routes.split, "a", { at: 9 });
    expect(prov("a").review_state).toBe("ocr_draft");
    expect(prov(created).review_state).toBe("ocr_draft");
  });

  it("refuses a cut at either end, a cut that is not a whole number, and a published provision", async () => {
    as("u-admin");
    for (const at of [0, A.length, -1, 2.5, A.length + 4]) {
      await expect(call(routes.split, "a", { at })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(call(routes.split, "a", { at: "3" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(routes.split, "p", { at: 3 })).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toHaveLength(0);
  });

  it("a merge is the exact concatenation, removes the second piece, and the audit row holds both texts", async () => {
    as("u-admin");
    expect(await call(routes.merge, "a")).toMatchObject({ id: "a", removed: "b" });
    expect(prov("a")).toMatchObject({ text: A + B, review_state: "ocr_draft" });
    expect(db.all(PROVISIONS, { id: "b" })).toHaveLength(0);
    expect(draftTexts()).toEqual([A + B, C]);
    expect(audit()[0]).toMatchObject({
      action: "provision_merge",
      provision: "a",
      before: { pieces: [{ id: "a", text: A }, { id: "b", text: B }] },
      after: { id: "a", text: A + B },
    });
  });

  it("split then merge gives back the text it started with", async () => {
    as("u-admin");
    await call(routes.split, "a", { at: 12 });
    await call(routes.merge, "a");
    expect(prov("a").text).toBe(A);
    expect(draftTexts()).toEqual([A, B, C]);
  });

  it("refuses to merge the last provision, or one in a published document", async () => {
    as("u-admin");
    await expect(call(routes.merge, "c")).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(routes.merge, "p")).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toHaveLength(0);
  });

  it("a reorder writes sort only and records the order before and after", async () => {
    as("u-admin");
    expect(await call(routes.reorder, "draft", { ids: ["c", "a", "b"] })).toEqual({ changed: true });
    expect(draftTexts()).toEqual([C, A, B]);
    const provisionWrites = writes.filter((w) => w.collection === PROVISIONS);
    expect(provisionWrites.length).toBeGreaterThan(0);
    for (const w of provisionWrites) expect(Object.keys(w.data)).toEqual(["sort"]);
    expect(audit()[0]).toMatchObject({ action: "provisions_reorder", document: "draft", before: { order: ["a", "b", "c"] }, after: { order: ["c", "a", "b"] } });
  });

  it("refuses a reorder that drops, repeats or adds a provision, or touches a published document", async () => {
    as("u-admin");
    for (const ids of [["a", "b"], ["a", "b", "b"], ["a", "b", "p"], ["a", "b", "c", "p"]]) {
      await expect(call(routes.reorder, "draft", { ids })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(call(routes.reorder, "pub", { ids: ["p"] })).rejects.toMatchObject({ statusCode: 409 });
    expect(await call(routes.reorder, "draft", { ids: ["a", "b", "c"] })).toEqual({ changed: false });
    expect(writes).toHaveLength(0);
  });

  it("every write that changed a provision's text left an audit row holding that text", async () => {
    as("u-admin");
    await call(routes.edit, "a", { text: A + "x" });
    await call(routes.split, "a", { at: 4 });
    await call(routes.merge, "a");
    await call(routes.merge, "a");
    const textWrites = writes.filter((w) => w.collection === PROVISIONS && w.data && "text" in w.data);
    const audited = JSON.stringify(audit().map((r: any) => r.after));
    expect(textWrites.length).toBeGreaterThanOrEqual(5);
    for (const w of textWrites) expect(audited).toContain(JSON.stringify(w.data.text));
    expect(audit().map((r: any) => r.action)).toEqual(["text_edit", "provision_split", "provision_merge", "provision_merge"]);
  });
});

describe("the publish gate", () => {
  const memberSees = async () => {
    as("u-member");
    const list = await call(routes.documents, "");
    const hits = await call(routes.search, "", {}, { q: "quorum" });
    return { documents: list.documents.map((d: any) => d.id), hits: hits.total };
  };

  it("refuses while a provision is unreviewed, and a member sees nothing of the draft", async () => {
    as("u-admin");
    await call(routes.state, "a", { state: "reviewed" });
    await call(routes.state, "b", { state: "reviewed" });
    await expect(call(routes.publish, "draft")).rejects.toMatchObject({ statusCode: 409, data: { provisions: 3, unreviewed: 1, illegible: 1 } });
    expect(db.one("hoa_governing_documents", "draft")!.status).toBe("draft");
    expect(audit().filter((r: any) => r.action === "publish")).toHaveLength(0);

    expect(await memberSees()).toEqual({ documents: ["pub"], hits: 0 });
    as("u-member");
    await expect(call(routes.document, "draft")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("publishes once every provision is reviewed, writes an audit row, and the member then sees it", async () => {
    as("u-admin");
    await call(routes.edit, "c", { text: "Signed J. Smith President [signature] [seal]\n" });
    for (const id of ["a", "b", "c"]) await call(routes.state, id, { state: "reviewed" });
    await call(routes.state, "a", { state: "verified" });
    expect((await call(routes.review, "draft")).can_publish).toBe(true);

    expect(await call(routes.publish, "draft")).toEqual({ id: "draft", status: "published", provisions: 3 });
    expect(audit().at(-1)).toMatchObject({
      action: "publish",
      document: "draft",
      actor_user: "u-admin",
      before: { status: "draft" },
      after: { status: "published", provisions: 3, reviewed: 2, verified: 1 },
    });
    expect(await memberSees()).toEqual({ documents: ["pub", "draft"], hits: 1 });

    as("u-admin");
    await expect(call(routes.publish, "draft")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses a document with no provisions", async () => {
    as("u-admin");
    db.seed("hoa_governing_documents", [{ id: "empty", organization: ORG, title: "Empty", kind: "rules", status: "draft", sort: 3 }]);
    await expect(call(routes.publish, "empty")).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("deleting a draft", () => {
  it("removes the provisions, the original, its pages and their files, then the document, with an audit row", async () => {
    as("u-admin");
    expect(await call(routes.remove, "draft")).toEqual({ ok: true, provisions: 3, sources: 1 });
    expect(db.all(PROVISIONS, { document: "draft" })).toHaveLength(0);
    expect(db.table("hoa_governing_sources")).toHaveLength(0);
    expect(db.table("hoa_governing_pages")).toHaveLength(0);
    expect(db.table("directus_files")).toHaveLength(0);
    expect(db.one("hoa_governing_documents", "draft")).toBeFalsy();
    expect(prov("p").text).toBe(PUBLISHED);

    const row = audit().at(-1)!;
    expect(row).toMatchObject({
      action: "document_delete",
      organization: ORG,
      actor_user: "u-admin",
      before: { id: "draft", title: "Rules Upload", status: "draft", provisions: 3, sources: 1 },
    });
    expect(row.document).toBeUndefined();
  });

  it("refuses a published document", async () => {
    as("u-admin");
    await expect(call(routes.remove, "pub")).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toHaveLength(0);
    expect(prov("p").text).toBe(PUBLISHED);
  });
});
