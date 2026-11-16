/**
 * Store a file that belongs to one record and is not a library document: a
 * lease's signed copy, an expense's receipt. Uploaded with the app's token into
 * the community's Records folder for its kind (Leases, Expense receipts), with
 * the `record-` mark and `uploaded_by` set to the person who sent it
 * (core/shared/records/files.ts).
 *
 * Why the app's token: no community policy may place a file in a folder
 * (PLACEMENT_FIELDS), and members and HOA Admins may read only the files at
 * their library's root, so their own upload came back with no id and the
 * record was saved with no file, quietly. Why Records and the mark: the file is
 * filed with its community, but the library shows the Records folder to admins
 * only, members cannot change a marked file, and the asset proxy asks the
 * record's rule (lease-documents.ts, expense-receipts.ts). Until a record names
 * it, the proxy serves it to no one.
 *
 * Until `pnpm scope:public-files` is run with the `record-` prefix, an image is
 * still served publicly by its id, so a caller that must keep a file private
 * accepts PDF only.
 */
import { updateFile, uploadFiles } from "@directus/sdk";
import { RECORD_FILE_MARKS, RECORD_FOLDER_KEYS, type RecordFileKind } from "#core/shared/records/files";

/** One part of a multipart body (h3's readMultipartFormData). */
export interface UploadPart {
  name?: string;
  filename?: string;
  type?: string;
  data: Buffer;
}

export type UploadKind = "pdf" | "jpeg" | "png" | "webp";

export const UPLOAD_MIME: Record<UploadKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXTENSION: Record<UploadKind, RegExp> = {
  pdf: /\.pdf$/i,
  jpeg: /\.jpe?g$/i,
  png: /\.png$/i,
  webp: /\.webp$/i,
};

/** What the bytes are, by their first bytes; never by the name or the type the browser sent. */
export function uploadKindOf(bytes: Uint8Array): UploadKind | null {
  const head = (n: number) => Buffer.from(bytes.subarray(0, n));
  if (bytes.length > 4 && head(5).toString("latin1") === "%PDF-") return "pdf";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 8 && head(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length > 12 && head(4).toString("latin1") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") return "webp";
  return null;
}

export interface RecordUploadRules {
  /** Which record the file is for: its Records folder and its mark. */
  record: RecordFileKind;
  accept: readonly UploadKind[];
  maxBytes: number;
  /** "Attach the signed lease." */
  missing: string;
  /** "The signed lease has to be a PDF." */
  wrongKind: string;
  /** "That PDF is over 4 MB. Save a smaller copy and try again." */
  tooBig: string;
  /** The name to use when the browser sent none, without an extension: "lease". */
  fallbackName: string;
}

export async function storeRecordUpload(
  orgId: string,
  userId: string,
  part: UploadPart | undefined,
  rules: RecordUploadRules
): Promise<{ id: string; filename: string; type: string }> {
  if (!part?.data?.length) throw createError({ statusCode: 400, message: rules.missing });
  if (part.data.length > rules.maxBytes) throw createError({ statusCode: 413, message: rules.tooBig });
  const kind = uploadKindOf(part.data);
  if (!kind || !rules.accept.includes(kind)) throw createError({ statusCode: 400, message: rules.wrongKind });
  await enforceStorageLimit(orgId, part.data.length);

  const type = UPLOAD_MIME[kind];
  let filename = (part.filename || `${rules.fallbackName}.${kind === "jpeg" ? "jpg" : kind}`).replace(/[\\/]/g, "_").slice(0, 200);
  if (!EXTENSION[kind].test(filename)) filename = `${filename}.${kind === "jpeg" ? "jpg" : kind}`;
  // Directus reads only the fields before the file, so they go first.
  const storage = await ensureOrgStorage(orgId);
  const form = new FormData();
  form.append("title", filename.replace(/\.[a-z0-9]+$/i, ""));
  form.append("description", RECORD_FILE_MARKS[rules.record]);
  form.append("folder", storage.map[RECORD_FOLDER_KEYS[rules.record]] || storage.rootId);
  form.append("file", new File([new Uint8Array(part.data)], filename, { type }), filename);

  const directus = getTypedDirectus();
  const uploaded = (await directus.request(uploadFiles(form))) as unknown as { id?: string } | null;
  if (!uploaded?.id) throw createError({ statusCode: 502, message: "Couldn't store the file. Try again." });
  // Directus stamps the app's account on create; the person who sent it uploaded it.
  await directus.request(updateFile(uploaded.id, { uploaded_by: userId } as never));
  return { id: uploaded.id, filename, type };
}
