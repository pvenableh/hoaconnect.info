/**
 * RFC 4180 CSV writing, plus the field extraction the Data Trust export needs.
 *
 * The escaping half of this used to live inside `reporting/ledger.ts`, which was
 * fine while the Finances tab was the only thing writing a CSV. The export
 * writes several, so it moved here and `ledger.ts` re-exports `toCsv` for its
 * existing callers.
 *
 * Pure: no Directus, no fs, no H3.
 */

/** Escape one CSV cell (RFC 4180: quote when it contains "," | '"' | newline). */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + rows of primitives. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\n");
}

/**
 * Read a dot-path off a row (`"unit.name"`), tolerating the two shapes Directus
 * returns for a relation: an expanded object, or a bare id string. A path that
 * runs into a string mid-way yields "" rather than throwing — an un-expanded
 * relation should leave the cell blank, not fail the whole export.
 *
 * Arrays and objects at the LEAF are JSON-stringified: `mailing_address` is a
 * JSON column, and dropping it silently would lose real data from an export
 * whose entire point is that nothing is withheld.
 */
export function readPath(row: unknown, path: string): string | number | null {
  let cur: unknown = row;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur == null) return "";
  if (typeof cur === "string" || typeof cur === "number") return cur;
  if (typeof cur === "boolean") return cur ? "true" : "false";
  return JSON.stringify(cur);
}

/** Project rows through a column spec into a CSV string. */
export function rowsToCsv(
  columns: ReadonlyArray<{ header: string; path: string }>,
  rows: readonly unknown[]
): string {
  return toCsv(
    columns.map((c) => c.header),
    rows.map((row) => columns.map((c) => readPath(row, c.path)))
  );
}
