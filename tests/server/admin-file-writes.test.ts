/**
 * File fields the HOA Admin policy may not write through Directus
 * (core/shared/roles/admin-file-fields.ts): a document's file, a meeting's
 * notice and recording, an amenity's image. Directus links any file id there,
 * and a row naming a file makes the file its community's (file-owner.ts), so
 * through the API an admin could open another community's file.
 *
 *   POST /api/directus/items   holds those fields back from the caller's own
 *                              write, checks them, sets them with the app's token
 *
 * The caller's client here refuses the held fields and other communities' rows,
 * as the narrowed rules do. The admin persona is an admin of ORG only.
 * `filesOutsideOrg` passes ID.fileOk only (the fixture).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, fakeDirectus, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { ADMIN_FILE_FIELDS, adminWritableFields, namedFileFields } from "#core/shared/roles/admin-file-fields";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const F = {
  myUpload: uuid(901),
  myFiled: uuid(902),
  theirUpload: uuid(903),
  colleagueUpload: uuid(904),
  doc: uuid(911),
  docOther: uuid(912),
  meeting: uuid(921),
  amenity: uuid(931),
};

function db(): Db {
  const base = seed();
  return {
    ...base,
    directus_files: [
      ...base.directus_files!,
      { id: F.myUpload, uploaded_by: ID.userAdmin, folder: null, type: "application/pdf" },
      { id: F.myFiled, uploaded_by: ID.userAdmin, folder: uuid(950), type: "application/pdf" },
      { id: F.theirUpload, uploaded_by: ID.userBob, folder: null, type: "application/pdf" },
      { id: F.colleagueUpload, uploaded_by: uuid(8), folder: null, type: "application/pdf" },
    ],
    hoa_documents: [
      { id: F.doc, organization: ORG, title: "Bylaws", file: F.colleagueUpload, status: "published" },
      { id: F.docOther, organization: OTHER, title: "Their budget", file: ID.fileElsewhere, status: "published" },
    ],
    hoa_meetings: [{ id: F.meeting, organization: ORG, title: "Annual meeting", notice_file: null, recording_file: null }],
    hoa_amenities: [{ id: F.amenity, organization: ORG, title: "Pool", image: null }],
  };
}

const state: { who: Who; db: Db; failFileWrite?: boolean } = { who: PERSONAS.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let items: (e: any) => Promise<any>;
let userCalls: any[] = [];

/** The caller's own Directus token, under the narrowed HOA Admin rules. */
function userDirectus() {
  const inner = fakeDirectus(state);
  return {
    request: async (op: any) => {
      userCalls.push(op);
      if (op.op === "createItem" || op.op === "updateItem") {
        const held = (ADMIN_FILE_FIELDS[op.collection] ?? []).filter((f) => Object.prototype.hasOwnProperty.call(op.data ?? {}, f));
        if (held.length) throw Object.assign(new Error(`You don't have permission to access field "${held[0]}"`), { statusCode: 403 });
        const org = op.op === "createItem" ? op.data?.organization : state.db[op.collection]?.find((r) => r.id === op.id)?.organization;
        if (!state.who.admin || org !== ORG) throw Object.assign(new Error("You don't have permission to access this."), { statusCode: 403 });
      }
      return inner.request(op);
    },
  };
}

const call = (body: any) => items(ev({ body }));
const as = (who: Who) => (state.who = who);
const appWrites = () => fake.calls.filter((c) => !c.op.startsWith("read"));
const docs = () => state.db.hoa_documents!;
const NEW_DOC = { title: "Rules and regulations", organization: ORG, status: "draft" };
const create = (collection: string, data: any) => call({ collection, operation: "create", data });
const update = (collection: string, id: any, data: any) => call({ collection, operation: "update", id, data });

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, org: string) => ({ isAdmin: !!state.who.admin && org === ORG }));
  vi.stubGlobal("getUserDirectus", async () => userDirectus());
  vi.stubGlobal("getPublicDirectus", () => userDirectus());
  vi.stubGlobal("isRagConfigured", () => false);
  // The app's token, which can be made to fail on the second step of a create.
  const stubbed = (globalThis as any).getTypedDirectus;
  vi.stubGlobal("getTypedDirectus", () => {
    const c = stubbed();
    return {
      calls: c.calls,
      request: async (op: any) => {
        if (state.failFileWrite && op.op === "updateItem") {
          c.calls.push(op);
          throw new Error("Directus is down");
        }
        return c.request(op);
      },
    };
  });
  items = (await import("#core/server/api/directus/items.post")).default;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
  state.db = db();
  state.failFileWrite = false;
  as(PERSONAS.admin);
  fake.reset();
  userCalls = [];
});

describe("a new document's file", () => {
  it("is set with the app's token when it is in the community's library, and never sent on the caller's own token", async () => {
    const made = await create("hoa_documents", { ...NEW_DOC, file: ID.fileOk });
    expect(made).toMatchObject({ id: expect.any(String), file: ID.fileOk });
    expect(docs().find((d) => d.id === made.id)).toMatchObject({ organization: ORG, title: NEW_DOC.title, file: ID.fileOk });
    const userCreate = userCalls.find((c) => c.op === "createItem");
    expect(userCreate.data).not.toHaveProperty("file");
    expect(appWrites()).toEqual([expect.objectContaining({ op: "updateItem", collection: "hoa_documents", id: made.id, data: { file: ID.fileOk } })]);
  });

  it("may be one the admin uploaded and filed nowhere", async () => {
    const made = await create("hoa_documents", { ...NEW_DOC, file: F.myUpload });
    expect(docs().find((d) => d.id === made.id)).toMatchObject({ file: F.myUpload });
  });

  it("refuses another community's file, a file filed outside the library, and someone else's loose upload, writing nothing", async () => {
    for (const file of [ID.fileElsewhere, F.myFiled, F.theirUpload]) {
      await expect(create("hoa_documents", { ...NEW_DOC, file })).rejects.toMatchObject({
        statusCode: 403,
        message: "That file isn't one of this community's files.",
      });
    }
    expect(docs()).toHaveLength(2);
    expect(userCalls.filter((c) => c.op !== "readItems" && c.op !== "readItem")).toHaveLength(0);
    expect(appWrites()).toHaveLength(0);
  });

  it("refuses a document in another community, a resident, and no community at all", async () => {
    await expect(create("hoa_documents", { ...NEW_DOC, organization: OTHER, file: ID.fileElsewhere })).rejects.toMatchObject({ statusCode: 403 });
    for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager]) {
      as(who);
      await expect(create("hoa_documents", { ...NEW_DOC, file: ID.fileOk })).rejects.toMatchObject({ statusCode: 403 });
    }
    as(PERSONAS.admin);
    await expect(create("hoa_documents", { title: "x", file: ID.fileOk })).rejects.toMatchObject({ statusCode: 400 });
    expect(docs()).toHaveLength(2);
    expect(appWrites()).toHaveLength(0);
  });

  it("takes a file only by its id, one row at a time", async () => {
    await expect(create("hoa_documents", { ...NEW_DOC, file: { id: ID.fileElsewhere } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(create("hoa_documents", { ...NEW_DOC, file: { storage: "local", filename_download: "x.pdf" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(create("hoa_documents", [{ ...NEW_DOC, file: ID.fileOk }])).rejects.toMatchObject({ statusCode: 400 });
    expect(docs()).toHaveLength(2);
  });

  it("takes the new document away again when its file cannot be set", async () => {
    state.failFileWrite = true;
    await expect(create("hoa_documents", { ...NEW_DOC, file: ID.fileOk })).rejects.toBeTruthy();
    expect(docs()).toHaveLength(2);
  });
});

describe("writes that name no file", () => {
  it("go through on the caller's own token, as before", async () => {
    const made = await create("hoa_documents", NEW_DOC);
    expect(docs().find((d) => d.id === made.id)).toMatchObject({ title: NEW_DOC.title });
    await update("hoa_documents", F.doc, { title: "Bylaws (2026)" });
    expect(docs().find((d) => d.id === F.doc)).toMatchObject({ title: "Bylaws (2026)", file: F.colleagueUpload });
    expect(appWrites()).toHaveLength(0);
  });
});

describe("changing a file on a row", () => {
  it("sets a meeting's notice or an amenity's image from the community's files, or clears it", async () => {
    await update("hoa_meetings", F.meeting, { notice_file: ID.fileOk, title: "Annual meeting 2026" });
    expect(state.db.hoa_meetings![0]).toMatchObject({ notice_file: ID.fileOk, title: "Annual meeting 2026" });
    expect(userCalls.find((c) => c.op === "updateItem").data).toEqual({ title: "Annual meeting 2026" });
    await update("hoa_meetings", F.meeting, { notice_file: null });
    expect(state.db.hoa_meetings![0]).toMatchObject({ notice_file: null });
    await update("hoa_amenities", F.amenity, { image: F.myUpload });
    expect(state.db.hoa_amenities![0]).toMatchObject({ image: F.myUpload });
  });

  it("keeps the file a row already has, whoever uploaded it", async () => {
    await update("hoa_documents", F.doc, { file: F.colleagueUpload, title: "Bylaws, amended" });
    expect(docs().find((d) => d.id === F.doc)).toMatchObject({ file: F.colleagueUpload, title: "Bylaws, amended" });
  });

  it("refuses another community's file, someone else's upload, another community's row and a missing one", async () => {
    for (const notice_file of [ID.fileElsewhere, F.theirUpload]) {
      await expect(update("hoa_meetings", F.meeting, { notice_file })).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(update("hoa_documents", F.docOther, { file: ID.fileOk })).rejects.toMatchObject({ statusCode: 403 });
    await expect(update("hoa_documents", uuid(999), { file: ID.fileOk })).rejects.toMatchObject({ statusCode: 404 });
    await expect(update("hoa_documents", [F.doc], { file: ID.fileOk })).rejects.toMatchObject({ statusCode: 400 });
    expect(state.db.hoa_meetings![0]).toMatchObject({ notice_file: null });
    expect(appWrites()).toHaveLength(0);
  });
});

describe("the field lists", () => {
  it("adminWritableFields: every live field but the file fields, sorted", () => {
    expect(adminWritableFields("hoa_meetings", ["title", "notice_file", "id", "recording_file", "attachments", "title"])).toEqual(["attachments", "id", "title"]);
    expect(adminWritableFields("hoa_documents", ["file", "folder", "title"])).toEqual(["folder", "title"]);
    expect(adminWritableFields("hoa_announcements", ["b", "a"])).toEqual(["a", "b"]);
  });

  it("namedFileFields: a held field named in a write, null included", () => {
    expect(namedFileFields("hoa_documents", { title: "x", file: null })).toEqual(["file"]);
    expect(namedFileFields("hoa_documents", { title: "x" })).toEqual([]);
    expect(namedFileFields("hoa_amenities", { image: "abc" })).toEqual(["image"]);
    expect(namedFileFields("hoa_announcements", { image: "abc" })).toEqual([]);
    expect(namedFileFields("hoa_documents", [{ file: "abc" }])).toEqual([]);
  });
});
