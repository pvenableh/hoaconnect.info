/**
 * An expense's receipt: storing it, which file an expense may name, and who
 * may open it.
 *
 * Who may open it: whoever may read that community's books (canReadMoney:
 * its admins and every board seat), the same people the expense list is for.
 * Not every member, which is what the asset proxy's rule for a community's
 * files would give (file-owner.ts): a receipt is a vendor's bill.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { storeUnfiledUpload, type UploadPart } from "./private-uploads";
import { assertDocumentInOrg } from "./unit-record-writes";

/** One receipt per request, under the host's 4.5 MB body limit. */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Store a receipt: a PDF or a photo (JPEG, PNG, WebP), 4 MB at most, in no
 * folder, as the sender's (private-uploads.ts says why). A photo stays
 * readable by its id through the public file rule, as every image is; a PDF
 * opens only through the asset proxy.
 */
export async function storeExpenseReceipt(orgId: string, userId: string, part: UploadPart | undefined) {
  return storeUnfiledUpload(orgId, userId, part, {
    accept: ["pdf", "jpeg", "png", "webp"],
    maxBytes: RECEIPT_MAX_BYTES,
    missing: "Attach the receipt.",
    wrongKind: "A receipt has to be a PDF or a photo (JPEG, PNG or WebP).",
    tooBig: "That file is over 4 MB. Save a smaller copy and try again.",
    fallbackName: "receipt",
  });
}

/**
 * Throw 403 unless an expense may name this file as its receipt: one of the
 * community's files (its library, or claimed by one of its records, such as
 * this expense), or one the caller uploaded and filed nowhere, which is where
 * storeExpenseReceipt puts a new one. Another community's file is neither, and
 * someone else's loose upload is not the caller's to claim. Saved, the
 * receipt opens to whoever reads the books (mayOpenExpenseReceipt), so this
 * is what keeps one community's file from opening to another's admin.
 */
export async function assertReceiptInOrg(orgId: string, fileId: string | null | undefined, userId: string): Promise<void> {
  await assertDocumentInOrg(orgId, fileId, userId, "That receipt isn't one of this community's files.");
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/** True or false when an expense names this file as its receipt; null when none does. */
export async function mayOpenExpenseReceipt(event: H3Event, fileId: string): Promise<boolean | null> {
  let expenses: Array<{ organization?: unknown }> = [];
  try {
    expenses = (await getTypedDirectus().request(
      readItems("payment_expenses", { filter: { receipt: { _eq: fileId } }, fields: ["organization"], limit: -1 } as never)
    )) as unknown as typeof expenses;
  } catch {
    expenses = [];
  }
  if (!expenses.length) return null;
  for (const orgId of new Set(expenses.map((e) => idOf(e.organization)).filter((v): v is string => !!v))) {
    if (await canReadMoney(event, orgId)) return true;
  }
  return false;
}
