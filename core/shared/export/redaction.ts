/**
 * Tier redaction for the Data Trust export.
 *
 * Only the `shareable` tier redacts anything; `full` is verbatim by definition —
 * it is the community's own copy, and an anti-lock-in promise that quietly
 * withheld fields from the board would not be worth making.
 *
 * Redacted fields are NULLED rather than deleted. Dropping the key would make a
 * shareable archive structurally different from a full one, and anything reading
 * it later (the Phase 4 transition wizard, a successor's import tool) would have
 * to guess whether a missing column meant "empty" or "withheld". A null plus the
 * manifest's `redacted` list says exactly which it was.
 *
 * Pure: no Directus, no fs, no H3.
 */

import type { ExportEntry, ExportTier } from "./collections";

export type Row = Record<string, unknown>;

/** Fields this entry redacts in this tier — empty unless the tier is shareable. */
export function redactedFields(entry: ExportEntry, tier: ExportTier): readonly string[] {
  if (tier !== "shareable") return [];
  return entry.redact ?? [];
}

/** A copy of `row` with the tier's redacted fields set to null. */
export function redactRow(entry: ExportEntry, tier: ExportTier, row: Row): Row {
  const fields = redactedFields(entry, tier);
  if (fields.length === 0) return row;
  const out: Row = { ...row };
  for (const field of fields) {
    // Only null a field the row actually has, so redaction never invents columns.
    if (field in out) out[field] = null;
  }
  return out;
}

export function redactRows(
  entry: ExportEntry,
  tier: ExportTier,
  rows: readonly Row[]
): Row[] {
  const fields = redactedFields(entry, tier);
  if (fields.length === 0) return [...rows];
  return rows.map((row) => redactRow(entry, tier, row));
}
