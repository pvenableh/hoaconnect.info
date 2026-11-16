/**
 * An expense's receipt: its upload, and who opens it.
 *
 *   POST /api/org/expenses/receipt   an admin, or a manager with the projects grant
 *   mayOpenExpenseReceipt            whoever reads the books (admins, board seats)
 *
 * The expense form uploaded through /api/directus/files/upload with the
 * admin's own token; Directus answers a file in no folder with no data, so a
 * PDF receipt came back with no id and the expense was saved without it. The
 * asset proxy would also have served a saved receipt to every member.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const F = { saved: uuid(701), elsewhere: uuid(702), loose: uuid(703) };
const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: {} };
let fake: ReturnType<typeof stubGlobals>;
let upload: (e: any) => Promise<any>;
let mayOpenExpenseReceipt: typeof import("#core/server/utils/expense-receipts").mayOpenExpenseReceipt;

function db(): Db {
  const base = seed();
  return {
    ...base,
    directus_files: [
      ...base.directus_files!,
      { id: F.saved, folder: null, type: "application/pdf", uploaded_by: ID.userAdmin },
      { id: F.elsewhere, folder: null, type: "application/pdf", uploaded_by: uuid(9) },
      { id: F.loose, folder: null, type: "application/pdf", uploaded_by: ID.userAdmin },
    ],
    payment_expenses: [
      { id: uuid(711), organization: ORG, title: "Pest control", receipt: F.saved },
      { id: uuid(712), organization: OTHER, title: "Theirs", receipt: F.elsewhere },
    ],
  };
}

const PDF = Buffer.from("%PDF-1.7\n%%EOF\n");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const part = (data: Buffer, filename: string) => ({ name: "file", filename, type: "application/octet-stream", data });
const body = (file?: ReturnType<typeof part>) => ({ __multipart: [{ name: "orgId", data: Buffer.from(ORG) }, ...(file ? [file] : [])] }) as any;
const files = () => state.db.directus_files!;
const isAdmin = () => !!state.who.admin;

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("readMultipartFormData", async (e: any) => e.__multipart);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: state.who.userId }));
  vi.stubGlobal("requireAdminOrManagerGrant", async () => {
    if (isAdmin()) return { via: "admin" };
    if (state.who.grants?.projects) return { via: "manager" };
    throw Object.assign(new Error("Admin or property-manager access required"), { statusCode: 403 });
  });
  vi.stubGlobal("enforceStorageLimit", async () => undefined);
  // The books: admins, and every board seat through money:read.
  vi.stubGlobal("canReadMoney", async (_e: unknown, orgId: string) => orgId === ORG && (isAdmin() || !!state.who.office));
  upload = (await import("#core/server/api/org/expenses/receipt.post")).default;
  ({ mayOpenExpenseReceipt } = await import("#core/server/utils/expense-receipts"));
});

beforeEach(() => {
  state.db = db();
  state.who = PERSONAS.admin;
  fake.reset();
});

describe("uploading a receipt", () => {
  it("files a PDF in the community's Records › Expense receipts folder as the admin's, and returns its id", async () => {
    const res = await upload(body(part(PDF, "Acme invoice 114.pdf")));
    expect(res).toEqual({ id: expect.any(String), filename: "Acme invoice 114.pdf", type: "application/pdf" });
    expect(files().find((f) => f.id === res.id)).toMatchObject({
      folder: `receipts-${ORG}`,
      description: "record-expense-receipt",
      type: "application/pdf",
      uploaded_by: ID.userAdmin,
    });
  });

  it("takes a photo of a receipt, by its bytes rather than its name", async () => {
    const res = await upload(body(part(JPEG, "IMG_2041")));
    expect(res).toMatchObject({ filename: "IMG_2041.jpg", type: "image/jpeg" });
  });

  it("lets a manager with the projects grant upload, as they may enter an expense", async () => {
    state.who = PERSONAS.manager;
    await expect(upload(body(part(PDF, "bill.pdf")))).resolves.toMatchObject({ type: "application/pdf" });
  });

  it("refuses a resident", async () => {
    state.who = PERSONAS.owner;
    await expect(upload(body(part(PDF, "bill.pdf")))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses another kind of file, one over 4 MB, and none", async () => {
    await expect(upload(body(part(GIF, "receipt.pdf")))).rejects.toMatchObject({
      statusCode: 400,
      message: "A receipt has to be a PDF or a photo (JPEG, PNG or WebP).",
    });
    await expect(upload(body(part(Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]), "big.pdf")))).rejects.toMatchObject({ statusCode: 413 });
    await expect(upload(body())).rejects.toMatchObject({ statusCode: 400, message: "Attach the receipt." });
  });
});

describe("who opens a saved receipt", () => {
  it("is the community's admins and board seats, not every member", async () => {
    expect(await mayOpenExpenseReceipt({} as any, F.saved)).toBe(true);
    state.who = PERSONAS.board;
    expect(await mayOpenExpenseReceipt({} as any, F.saved)).toBe(true);
    state.who = PERSONAS.owner;
    expect(await mayOpenExpenseReceipt({} as any, F.saved)).toBe(false);
  });

  it("is not this community's admin for another community's receipt", async () => {
    expect(await mayOpenExpenseReceipt({} as any, F.elsewhere)).toBe(false);
  });

  it("has nothing to say about a file no expense names", async () => {
    expect(await mayOpenExpenseReceipt({} as any, F.loose)).toBeNull();
  });
});
