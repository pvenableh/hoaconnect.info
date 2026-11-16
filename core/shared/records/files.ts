/**
 * A record's file: an expense's receipt, a lease's signed copy. It is filed in
 * its community's library, in the Records folder (Expense receipts, Leases;
 * STORAGE_TREE in core/server/utils/org-storage.ts), so each community's files
 * sit together, but it is not a library document: who opens it is the
 * record's rule (expense-receipts.ts, lease-documents.ts), not the library's.
 *
 * The `record-` mark in its description keeps it so, as `governing-` and
 * `support-` do for theirs (scripts/lib/public-files.ts, member-files.ts): the
 * public file rule leaves it out even when it is a photo, members cannot edit,
 * replace or delete it through Directus, the asset proxy does not serve it as
 * an ordinary image, and the library shows the Records folder to admins only.
 * It changes through its record, not the file routes.
 *
 * Pure: no Directus.
 */
export const RECORD_FILE_PREFIX = "record-";

export const RECORD_FILE_MARKS = {
  receipt: "record-expense-receipt",
  lease: "record-lease",
} as const;

export type RecordFileKind = keyof typeof RECORD_FILE_MARKS;

/** The Records subfolder (STORAGE_TREE key) each kind is filed in. */
export const RECORD_FOLDER_KEYS: Record<RecordFileKind, "records/receipts" | "records/leases"> = {
  receipt: "records/receipts",
  lease: "records/leases",
};

/** Why the file routes refuse to change or delete one. */
export const RECORD_FILE_ELSEWHERE = "This file belongs to an expense or a lease. Change it there.";

/** True when a file's description marks it as a record's file. */
export function isRecordFileMarker(description: unknown): boolean {
  return typeof description === "string" && description.startsWith(RECORD_FILE_PREFIX);
}
