/**
 * The export manifest and the archive's plain-English README.
 *
 * `schema_version` is load-bearing and starts at 1. The Management Transition
 * Wizard (Phase 4) reads these archives, so the manifest is a contract with
 * future code, not a summary for humans — that is what the README is for. Bump
 * the version on any change that would make an older reader wrong; adding a
 * field is not such a change.
 *
 * Pure: no Directus, no fs, no H3.
 */

import type { ExportTier } from "./collections";
import { PLATFORM_COLLECTIONS } from "./collections";

export const EXPORT_SCHEMA_VERSION = 1;

/**
 * How long a finished archive stays downloadable before the worker purges it
 * and flips the job to `expired`.
 *
 * It lives here, next to the schema version, because it is shared by three
 * places that must agree: the route that queues a job, the worker that stamps
 * `expires_at` and later deletes the file, and the download route that re-checks
 * expiry between purge runs. A worker that disagreed with the route would either
 * hand out archives the UI has already called expired, or delete one the board
 * was still told it had days to fetch.
 */
export const EXPORT_TTL_DAYS = 7;

export interface ManifestOrg {
  readonly id: string;
  readonly name: string | null;
  readonly slug: string;
  readonly legal_name?: string | null;
}

export interface ManifestCollection {
  readonly collection: string;
  readonly label: string;
  /** Path inside the archive, e.g. "data/hoa_members.json". */
  readonly file: string;
  readonly rows: number;
  /** Fields nulled for this tier, omitted when nothing was redacted. */
  readonly redacted?: readonly string[];
}

export interface ManifestFiles {
  readonly count: number;
  readonly bytes: number;
}

export interface ExportManifest {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly tier: ExportTier;
  readonly organization: ManifestOrg;
  readonly collections: readonly ManifestCollection[];
  readonly csvs: readonly string[];
  /** Null when the requester opted out of the files archive. */
  readonly files: ManifestFiles | null;
  /** Collections deliberately absent, and why. */
  readonly excluded: Readonly<Record<string, string>>;
  /** Build the app was running when this archive was produced. */
  readonly app_build_id: string | null;
}

export interface BuildManifestInput {
  readonly tier: ExportTier;
  readonly generatedAt: string;
  readonly organization: ManifestOrg;
  readonly collections: readonly ManifestCollection[];
  readonly csvs: readonly string[];
  readonly files: ManifestFiles | null;
  readonly appBuildId?: string | null;
  /** Tier-specific omissions, merged over the platform-owned list. */
  readonly excludedByTier?: Readonly<Record<string, string>>;
}

export function buildManifest(input: BuildManifestInput): ExportManifest {
  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    generated_at: input.generatedAt,
    tier: input.tier,
    organization: input.organization,
    collections: input.collections,
    csvs: input.csvs,
    files: input.files,
    excluded: { ...PLATFORM_COLLECTIONS, ...(input.excludedByTier ?? {}) },
    app_build_id: input.appBuildId ?? null,
  };
}

/** Total rows across every collection in the archive. */
export function totalRows(manifest: ExportManifest): number {
  return manifest.collections.reduce((sum, c) => sum + c.rows, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * The README that ships inside the archive. Written for a board member opening
 * the zip a year from now on a laptop with no special software — which is the
 * whole point of pairing JSON with CSV.
 */
export function renderReadme(manifest: ExportManifest): string {
  const org = manifest.organization.name || manifest.organization.slug;
  const lines: string[] = [];

  lines.push(`${org} — data export`);
  lines.push("=".repeat(`${org} — data export`.length));
  lines.push("");
  lines.push(`Generated: ${manifest.generated_at}`);
  lines.push(
    `Contents:  ${manifest.tier === "full" ? "Full export" : "Shareable export"} — ${totalRows(
      manifest
    ).toLocaleString("en-US")} records across ${manifest.collections.length} collections`
  );
  if (manifest.files) {
    lines.push(
      `Files:     ${manifest.files.count.toLocaleString("en-US")} (${formatBytes(
        manifest.files.bytes
      )})`
    );
  } else {
    lines.push("Files:     not included in this export");
  }
  lines.push("");
  lines.push("This archive belongs to your community. You may keep it, move it to");
  lines.push("another provider, or hand it to a new manager. No part of it is");
  lines.push("licensed to us or dependent on your account staying open.");
  lines.push("");

  lines.push("WHAT'S IN HERE");
  lines.push("--------------");
  lines.push("  data/     One JSON file per collection — the complete record,");
  lines.push("            including every field, for import into another system.");
  if (manifest.csvs.length > 0) {
    lines.push("  csv/      The same information in spreadsheet form, for reading.");
    lines.push("            Opens in Excel, Numbers or Google Sheets.");
  }
  if (manifest.files) {
    lines.push("  files/    Every document, photo and attachment, in the folder");
    lines.push("            structure your community used.");
  }
  lines.push("  manifest.json");
  lines.push("            A machine-readable index: row counts, what was included,");
  lines.push("            and what was left out. Schema version " + manifest.schema_version + ".");
  lines.push("");

  if (manifest.tier === "shareable") {
    lines.push("ABOUT THIS SHAREABLE EXPORT");
    lines.push("---------------------------");
    lines.push("This is the variant meant to be handed to an incoming manager. It");
    lines.push("contains the full operational record — members, units, finances,");
    lines.push("requests, documents, governance and delinquency — but leaves out");
    lines.push("your board's private deliberation: internal channels, comments,");
    lines.push("AI conversations, moderation history and activity tracking.");
    lines.push("");
    lines.push("Request a full export to get everything.");
    lines.push("");
  }

  lines.push("CONTENTS BY COLLECTION");
  lines.push("----------------------");
  const width = Math.max(...manifest.collections.map((c) => c.label.length), 10);
  for (const c of manifest.collections) {
    const redacted = c.redacted?.length ? `  (withheld: ${c.redacted.join(", ")})` : "";
    lines.push(
      `  ${c.label.padEnd(width)}  ${String(c.rows).padStart(7)}  ${c.file}${redacted}`
    );
  }
  lines.push("");

  const excluded = Object.entries(manifest.excluded);
  if (excluded.length > 0) {
    lines.push("NOT INCLUDED, AND WHY");
    lines.push("---------------------");
    for (const [name, reason] of excluded.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${name}`);
      lines.push(`    ${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
