/**
 * The signed lease's upload, for the admin's lease form on the unit page and
 * for an owner's lease report.
 *
 *   POST /api/hoa/units/lease-document           an admin of the community
 *   POST /api/org/change-requests/lease-document an owner of a unit here
 *
 * Both store one PDF with the app's token in no folder, with `uploaded_by` the
 * person who sent it. The admin form used /api/directus/files/upload, which
 * uploads with the admin's own token: Directus answers a file in no folder
 * with no data, so the form never learned the id and saved the lease with no
 * document. The id this route returns is one the records route accepts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, PERSONAS, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const U4B = uuid(401);
const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: {} };
let fake: ReturnType<typeof stubGlobals>;
let adminUpload: (e: any) => Promise<any>;
let ownerUpload: (e: any) => Promise<any>;
let assertDocumentInOrg: typeof import("#core/server/utils/unit-record-writes").assertDocumentInOrg;
let assertOwnLeaseUpload: typeof import("#core/server/utils/unit-record-writes").assertOwnLeaseUpload;
const storage = { charged: [] as number[] };

function db(): Db {
  const base = seed();
  return {
    ...base,
    hoa_members: base.hoa_members!.map((m) => (m.id === ID.memberBob ? { ...m, member_type: "owner" } : m)),
    hoa_units: [{ id: U4B, organization: ORG, unit_number: "4B" }],
    hoa_member_units: [{ id: uuid(402), member_id: ID.memberBob, unit_id: U4B, status: "published", is_primary_unit: true, member_type: "owner" }],
  };
}

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const part = (data: Buffer, filename = "Signed lease 4B.pdf") => ({ name: "file", filename, type: "application/pdf", data });
const body = (file?: ReturnType<typeof part>, orgId = ORG) =>
  ({ __multipart: [{ name: "orgId", data: Buffer.from(orgId) }, ...(file ? [file] : [])] }) as any;
const files = () => state.db.directus_files!;

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("readMultipartFormData", async (e: any) => e.__multipart);
  vi.stubGlobal("requireAuthenticatedUser", async () => {
    if (!state.who.userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return { userId: state.who.userId };
  });
  vi.stubGlobal("requireMembership", async () => {
    if (!state.who.memberId) throw Object.assign(new Error("Not a member"), { statusCode: 403 });
    return { memberId: state.who.memberId };
  });
  vi.stubGlobal("enforceStorageLimit", async (_org: string, bytes: number) => void storage.charged.push(bytes));
  adminUpload = (await import("#core/server/api/hoa/units/lease-document.post")).default;
  ownerUpload = (await import("#core/server/api/org/change-requests/lease-document.post")).default;
  ({ assertDocumentInOrg, assertOwnLeaseUpload } = await import("#core/server/utils/unit-record-writes"));
});

beforeEach(() => {
  state.db = db();
  state.who = PERSONAS.admin;
  storage.charged = [];
  fake.reset();
});

describe("an admin uploads the signed lease on the unit page", () => {
  it("stores the PDF in no folder as the admin's, and returns its id", async () => {
    const res = await adminUpload(body(part(PDF)));
    expect(res).toEqual({ id: expect.any(String), filename: "Signed lease 4B.pdf" });
    expect(files().find((f) => f.id === res.id)).toMatchObject({
      folder: null,
      type: "application/pdf",
      title: "Signed lease 4B",
      uploaded_by: ID.userAdmin,
    });
    expect(storage.charged).toEqual([PDF.length]);
  });

  it("returns an id the records route takes as the lease's document", async () => {
    const res = await adminUpload(body(part(PDF)));
    await expect(assertDocumentInOrg(ORG, res.id, ID.userAdmin)).resolves.toBeUndefined();
    // Another admin's upload is not theirs to attach.
    await expect(assertDocumentInOrg(ORG, res.id, ID.userBob)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses someone who isn't an admin here", async () => {
    state.who = PERSONAS.owner;
    await expect(adminUpload(body(part(PDF)))).rejects.toMatchObject({ statusCode: 403 });
    expect(files().filter((f) => f.type === "application/pdf" && f.id !== ID.fileOk)).toHaveLength(0);
  });

  it("refuses a file that isn't a PDF, whatever it is called", async () => {
    await expect(adminUpload(body(part(Buffer.from("\xff\xd8\xff\xe0 JFIF"), "lease.pdf")))).rejects.toMatchObject({
      statusCode: 400,
      message: "The signed lease has to be a PDF.",
    });
  });

  it("refuses a PDF over 4 MB, and a request with no file", async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]);
    await expect(adminUpload(body(part(big)))).rejects.toMatchObject({ statusCode: 413 });
    await expect(adminUpload(body())).rejects.toMatchObject({ statusCode: 400, message: "Attach the signed lease." });
    expect(storage.charged).toEqual([]);
  });
});

describe("an owner uploads the signed lease for a lease report", () => {
  it("stores it the same way, as the owner's", async () => {
    state.who = PERSONAS.owner;
    const res = await ownerUpload(body(part(PDF)));
    expect(files().find((f) => f.id === res.id)).toMatchObject({ folder: null, uploaded_by: ID.userBob });
    await expect(assertOwnLeaseUpload(res.id, ID.userBob)).resolves.toEqual({ filename: "Signed lease 4B.pdf" });
  });

  it("refuses a member who owns no unit here", async () => {
    state.who = PERSONAS.board; // Ann has no unit
    await expect(ownerUpload(body(part(PDF)))).rejects.toMatchObject({ statusCode: 403 });
  });
});
