/**
 * Governing documents: reading the audit trail. Pure: no Directus, no browser.
 * Nothing here changes a row; it only names actions and lays a row's before
 * and after side by side. Values are shown as stored.
 */

/** Every action the app writes. A row with an action not listed here shows its raw name. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  text_edit: "Text edited",
  provision_edit: "Provision details edited",
  review_state: "Review state changed",
  provision_split: "Provision split",
  provision_merge: "Provisions merged",
  provisions_reorder: "Provisions reordered",
  provisions_propose: "Provisions proposed",
  publish: "Document published",
  unpublish: "Document unpublished",
  document_edit: "Document details edited",
  document_upload: "Document uploaded",
  document_delete: "Draft deleted",
  source_attach: "Original attached",
  source_delete: "Original removed",
  flag_status: "Flag status changed",
  flag_edit: "Flag edited",
  flags_suggest: "Flags suggested",
};
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS);
export const auditActionLabel = (action: string | null | undefined) => AUDIT_ACTION_LABELS[action ?? ""] ?? action ?? "Change";

export type AuditChange = { field: string; before: string; after: string };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PIECE_DETAILS: Array<[string, string]> = [
  ["original_label", "Label"],
  ["citation", "Citation"],
  ["heading", "Heading"],
  ["review_state", "Review state"],
];
const isPieceList = (v: unknown): v is Array<Record<string, unknown>> =>
  Array.isArray(v) && v.length > 0 && v.every((p) => isRecord(p) && typeof p.text === "string");

/** A merge records the pieces it joined. Each is laid out as its details, then its text exactly as stored. */
const pieceList = (pieces: Array<Record<string, unknown>>): string =>
  pieces
    .map((p, i) => {
      const details = PIECE_DETAILS.filter(([key]) => p[key] != null && p[key] !== "").map(([key, label]) => `${label}: ${String(p[key])}`);
      return [`Piece ${i + 1}`, ...details, "", p.text as string].join("\n");
    })
    .join("\n\n");

/** A stored value as text. A string is itself, untouched; nothing is the empty string. */
export const auditValue = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v : isPieceList(v) ? pieceList(v) : JSON.stringify(v, null, 2);

/**
 * The fields that differ between a row's `before` and `after`, in the order
 * they were stored. When either side is not a set of fields, the whole value
 * is one entry with an empty field name.
 */
export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  if (before == null && after == null) return [];
  if (!(isRecord(before) || before == null) || !(isRecord(after) || after == null)) {
    return [{ field: "", before: auditValue(before), after: auditValue(after) }];
  }
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const changes: AuditChange[] = [];
  for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const from = auditValue(b[field]);
    const to = auditValue(a[field]);
    if (from !== to) changes.push({ field, before: from, after: to });
  }
  return changes;
}
