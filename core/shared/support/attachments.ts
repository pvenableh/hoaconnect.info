// Support attachments (operator console Session F): what may be attached to a
// platform support message, shared by the picker and the server.
//
// Peter's calls, 2026-11-10: images, PDF, plain text and Office documents; 5 per
// message; anyone who may post may attach (staff on internal notes too, whose
// files stay staff-only). The size cap is 4 MB, not the 10 MB first chosen:
// Vercel refuses a function request or response body over 4.5 MB, and both the
// upload and the download pass through one. Photos over the cap are scaled down
// in the browser before they're sent (SHRINK_* below).

export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 5;
/** A pending upload can be attached for this long; after that, upload it again. */
export const ATTACHMENT_CLAIM_HOURS = 24;

/** The browser scales a photo over the cap to this longest side, then tries again smaller. */
export const SHRINK_STEPS: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: 2560, quality: 0.85 },
  { maxEdge: 1920, quality: 0.75 },
  { maxEdge: 1600, quality: 0.7 },
];

type Kind = "image" | "pdf" | "text" | "office";
const TYPES: Readonly<Record<string, { type: string; kind: Kind }>> = {
  png: { type: "image/png", kind: "image" },
  jpg: { type: "image/jpeg", kind: "image" },
  jpeg: { type: "image/jpeg", kind: "image" },
  gif: { type: "image/gif", kind: "image" },
  webp: { type: "image/webp", kind: "image" },
  heic: { type: "image/heic", kind: "image" },
  heif: { type: "image/heif", kind: "image" },
  pdf: { type: "application/pdf", kind: "pdf" },
  txt: { type: "text/plain", kind: "text" },
  log: { type: "text/plain", kind: "text" },
  csv: { type: "text/csv", kind: "text" },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "office" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "office" },
};

/** For `<input accept>`. */
export const ATTACHMENT_ACCEPT = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(",");

/** Shown inline (as an image) rather than downloaded. Raster images only: nothing that can run. */
export const INLINE_ATTACHMENT_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** The browser can redraw these smaller on a canvas. */
export const SHRINKABLE_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface SupportAttachment {
  /** directus_files id */
  id: string;
  name: string;
  type: string;
  size: number;
}

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name.trim())?.[1] ?? "").toLowerCase();

/** The canonical type for a file name, by its extension; null if it isn't allowed. */
export function attachmentType(name: string): { type: string; kind: Kind } | null {
  return TYPES[extOf(name)] ?? null;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Do the first bytes look like the type the name claims? A light check, so a
 * page renamed to .png isn't stored as an image. Text must not contain NULs.
 */
export function bytesMatchType(name: string, bytes: Uint8Array): boolean {
  const ext = extOf(name);
  switch (ext) {
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(bytes, ascii("GIF8"));
    case "webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8);
    case "heic":
    case "heif":
      return startsWith(bytes, ascii("ftyp"), 4);
    case "pdf":
      return startsWith(bytes, ascii("%PDF"));
    case "docx":
    case "xlsx":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "txt":
    case "log":
    case "csv":
      return !bytes.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}

/** Why this file can't be attached, in words for the person, or null. */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  if (!attachmentType(file.name)) return `${file.name}: only images, PDFs, text files and Word or Excel documents can be attached.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `${file.name} is over 4 MB. Send a smaller file.`;
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The line an email carries instead of the files: they stay in the app. */
export function attachmentsNote(count: number): string {
  if (!count) return "";
  return count === 1 ? "1 attachment: open the request to see it." : `${count} attachments: open the request to see them.`;
}

/** A file's marker in directus_files.description while it waits to be attached, and after. */
export const PENDING_MARKER_PREFIX = "support-upload:";
export const pendingMarker = (userId: string) => `${PENDING_MARKER_PREFIX}${userId}`;
export const attachedMarker = (messageId: string) => `support-message:${messageId}`;
/** An upload no message claimed is deleted after this many days (the daily sweep). */
export const UNATTACHED_SWEEP_DAYS = 7;
export const isSupportFileMarker = (description: unknown) => typeof description === "string" && description.startsWith("support-");

/** `Content-Disposition` with a plain-ASCII fallback and the UTF-8 name. */
export function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
