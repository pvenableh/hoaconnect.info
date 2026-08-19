/**
 * Standalone Data Trust export WORKER — runs ON the DigitalOcean droplet
 * (alongside Directus), NOT in the Vercel app. Same shape as
 * `notification-digest-worker.ts`: it talks straight to Directus with the admin
 * token and reuses the app's pure export modules, so the archive a board
 * downloads is built from exactly the map the test suite guards.
 *
 * It exists as a worker rather than a serverless route for two reasons that are
 * both about the promise being made. Org storage quotas run 5–250 GB, so an
 * archive can take minutes and hundreds of megabytes of disk — past any
 * serverless limit. And "the board can trigger an export mid-dispute" only means
 * something if the export finishes after they close the tab.
 *
 * Trigger it every few minutes from the droplet's crontab — the exact line is
 * in docs/data-export-cron.md.
 *
 * Every run does three things, in this order:
 *   1. purge archives past `expires_at` (delete the file, flip the row to
 *      `expired`, keep the row as the audit record)
 *   2. fail jobs left `running` by a killed process, so an org is never wedged
 *      behind a job that will never finish
 *   3. claim and build up to `--max` queued jobs, oldest first
 *
 *   pnpm run export:worker                  # do the work
 *   pnpm run export:worker -- --dry-run     # report what it WOULD do, write nothing
 *   pnpm run export:worker -- --job <id>    # build one specific job row
 *   pnpm run export:worker -- --purge-only  # expire old archives, build nothing
 *   pnpm run export:worker -- --keep-temp   # leave the staging directory behind
 *
 * Env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, optional EXPORT_WORK_DIR (default
 *      the system temp dir), EXPORT_FOLDER_NAME (default "Data exports"),
 *      NUXT_PUBLIC_BUILD_ID (recorded in the manifest), APP_URL (deep link in
 *      the "your export is ready" notification).
 */

import archiver from "archiver";
import { createWriteStream, openAsBlob } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Writable } from "node:stream";
import {
  createDirectus,
  createNotification,
  deleteFile,
  readFiles,
  readFolders,
  readItem,
  readItems,
  rest,
  staticToken,
  updateItem,
} from "@directus/sdk";
// Reused app modules — imported by RELATIVE path (the `#core` alias is
// Nuxt-only). Every one of them is pure by construction: no Directus, no fs, no
// H3. The archive is therefore built from exactly the map, redaction rules and
// ledger maths the test suite and the Finances tab already cover.
import {
  exportOrder,
  type ExportEntry,
  type ExportTier,
} from "../core/shared/export/collections";
import {
  EXPORT_TTL_DAYS,
  buildManifest,
  renderReadme,
  type ManifestCollection,
  type ManifestFiles,
} from "../core/shared/export/manifest";
import { redactRows, redactedFields } from "../core/shared/export/redaction";
import { csvCell, readPath, toCsv } from "../core/shared/export/csv";
import {
  entriesSinceOpening,
  expenseEntriesFromExpenses,
  incomeEntriesFromRequests,
  openingBalanceFromOrg,
  type LedgerEntry,
} from "../core/shared/reporting/ledger";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const WORK_ROOT = process.env.EXPORT_WORK_DIR || tmpdir();
const EXPORT_FOLDER_NAME = process.env.EXPORT_FOLDER_NAME || "Data exports";
const APP_URL = process.env.APP_URL || "";
const BUILD_ID = process.env.NUXT_PUBLIC_BUILD_ID || null;

const DRY_RUN = process.argv.includes("--dry-run");
const PURGE_ONLY = process.argv.includes("--purge-only");
const KEEP_TEMP = process.argv.includes("--keep-temp");
const ONLY_JOB = argValue("--job");
const MAX_JOBS = Number(argValue("--max") || 3);

/** Rows per Directus page. Small enough that one page is never a memory problem. */
const PAGE_SIZE = 200;
/** Parent ids per `_in` filter — keeps the query string well short of any limit. */
const ID_CHUNK = 100;
/** A `running` job older than this was killed mid-build; nothing will finish it. */
const STALE_HOURS = 6;

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : null;
}

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const directus = createDirectus(DIRECTUS_URL).with(staticToken(DIRECTUS_STATIC_TOKEN)).with(rest());

type Row = Record<string, unknown>;

interface ExportJob {
  id: string;
  status: string;
  tier: ExportTier;
  include_files: boolean;
  organization: string;
  requested_by: string | null;
  date_created: string | null;
  date_started: string | null;
}

interface OrgRow {
  id: string;
  name: string | null;
  slug: string;
  legal_name: string | null;
  folder: string | { id: string } | null;
  opening_balance: number | string | null;
  opening_balance_date: string | null;
}

const items = (collection: string, query: Record<string, unknown>): Promise<Row[]> =>
  directus.request(readItems(collection as never, query as never)) as Promise<Row[]>;

const patchJob = (id: string, payload: Record<string, unknown>) =>
  directus.request(updateItem("hoa_data_exports" as never, id, payload as never));

const nowIso = () => new Date().toISOString();

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Await the stream's own callback so a slow disk applies backpressure. */
function write(stream: Writable, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(text, (err) => (err ? reject(err) : resolve()));
  });
}

function closeStream(stream: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

/**
 * Collection → primary-key field, read from Directus once per run.
 *
 * Pagination sorts by the primary key rather than trusting the default order.
 * A collection with a configured `sort` field sorts by it, and that column is
 * neither unique nor stable — paging through it can repeat one row and skip
 * another, which in an export means an archive that is quietly wrong.
 */
async function primaryKeys(): Promise<Map<string, string>> {
  const res = await fetch(`${DIRECTUS_URL}/fields?limit=-1`, {
    headers: { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Could not read the schema: HTTP ${res.status}`);
  const body = (await res.json()) as {
    data: Array<{ collection: string; field: string; schema?: { is_primary_key?: boolean } | null }>;
  };
  const map = new Map<string, string>();
  for (const f of body.data) {
    if (f.schema?.is_primary_key) map.set(f.collection, f.field);
  }
  return map;
}

function pkOf(pks: Map<string, string>, collection: string): string {
  const pk = pks.get(collection);
  if (!pk) throw new Error(`No primary key found for ${collection} — is it in the schema?`);
  return pk;
}

// ---------------------------------------------------------------------------
// Reading one collection's rows for one org
// ---------------------------------------------------------------------------

async function* pages(
  collection: string,
  filter: Record<string, unknown>,
  fields: string[],
  pk: string
): AsyncGenerator<Row[]> {
  for (let page = 1; ; page++) {
    const rows = await items(collection, { filter, fields, sort: [pk], limit: PAGE_SIZE, page });
    if (!rows.length) return;
    yield rows;
    if (rows.length < PAGE_SIZE) return;
  }
}

/**
 * Pages of one entry's rows, however that entry reaches its organization.
 *
 * A `via` entry is filtered against the parent ids collected earlier in the
 * run — which is why `exportOrder` puts parents first, and why a parent with no
 * rows yields nothing at all rather than an unfiltered read of the whole table.
 */
async function* entryPages(
  entry: ExportEntry,
  orgId: string,
  idsByCollection: Map<string, string[]>,
  pks: Map<string, string>,
  fields: string[]
): AsyncGenerator<Row[]> {
  const pk = pkOf(pks, entry.collection);
  const scope = entry.scope;

  if (scope.kind === "self") {
    yield* pages(entry.collection, { [pk]: { _eq: orgId } }, fields, pk);
    return;
  }
  if (scope.kind === "direct") {
    yield* pages(entry.collection, { [scope.field]: { _eq: orgId } }, fields, pk);
    return;
  }

  const parentIds = idsByCollection.get(scope.parent) ?? [];
  if (!parentIds.length) return;
  for (const ids of chunk(parentIds, ID_CHUNK)) {
    yield* pages(entry.collection, { [scope.field]: { _in: ids } }, fields, pk);
  }
}

// ---------------------------------------------------------------------------
// Staging the records
// ---------------------------------------------------------------------------

/**
 * Write `data/<collection>.json` for one entry, streaming page by page.
 *
 * Nothing accumulates in memory except the primary keys of collections that are
 * some other entry's parent — an org with 80,000 activity rows must not need
 * 80,000 rows of RAM to export.
 */
async function stageCollection(
  entry: ExportEntry,
  tier: ExportTier,
  orgId: string,
  workDir: string,
  idsByCollection: Map<string, string[]>,
  pks: Map<string, string>,
  keepIds: boolean
): Promise<ManifestCollection> {
  const pk = pkOf(pks, entry.collection);
  const file = `data/${entry.collection}.json`;
  const out = createWriteStream(join(workDir, file));
  const ids: string[] = [];
  let rows = 0;

  try {
    await write(out, "[\n");
    for await (const page of entryPages(entry, orgId, idsByCollection, pks, ["*"])) {
      const redacted = redactRows(entry, tier, page);
      let text = "";
      for (const row of redacted) {
        text += `${rows === 0 && text === "" ? "" : ",\n"}${JSON.stringify(row)}`;
        rows++;
      }
      if (keepIds) for (const row of page) ids.push(String(row[pk]));
      if (text) await write(out, text);
    }
    await write(out, "\n]\n");
  } finally {
    await closeStream(out);
  }

  if (keepIds) idsByCollection.set(entry.collection, ids);

  const redactedHere = redactedFields(entry, tier);
  return {
    collection: entry.collection,
    label: entry.label,
    file,
    rows,
    ...(redactedHere.length ? { redacted: [...redactedHere] } : {}),
  };
}

/**
 * Write the human-readable CSV for an entry that has one.
 *
 * This is a second, narrow read rather than a projection of the JSON already
 * written. A CSV column like `unit.name` needs the relation expanded, and
 * expanding it in the main read would replace the raw foreign key in
 * `data/*.json` with a partial object — the archive's verbatim half would stop
 * being verbatim to prettify its readable half.
 */
async function stageCsv(
  entry: ExportEntry,
  orgId: string,
  workDir: string,
  idsByCollection: Map<string, string[]>,
  pks: Map<string, string>
): Promise<string | null> {
  if (!entry.csv) return null;
  const columns = entry.csv.columns;
  const file = `csv/${entry.csv.file}`;
  const fields = [pkOf(pks, entry.collection), ...columns.map((c) => c.path)];
  const out = createWriteStream(join(workDir, file));

  try {
    await write(out, `${toCsv([...columns.map((c) => c.header)], [])}\n`);
    for await (const page of entryPages(entry, orgId, idsByCollection, pks, fields)) {
      const lines = page.map((row) =>
        columns.map((c) => csvCell(readPath(row, c.path))).join(",")
      );
      if (lines.length) await write(out, `${lines.join("\n")}\n`);
    }
  } finally {
    await closeStream(out);
  }
  return file;
}

/**
 * `csv/ledger.csv` — the fourth CSV, and the only one that isn't a projection of
 * a single collection.
 *
 * Money is spread across `payment_requests` (what was collected) and
 * `payment_expenses` (what was spent), and the number a successor treasurer
 * actually needs — the running balance — exists in neither. It is derived, by
 * the same pure module the Finances tab renders from, so the spreadsheet in the
 * archive agrees line for line with the report in the app. The opening balance
 * leads the file: without it a reader would silently assume the community
 * started at zero on its first recorded transaction.
 */
async function stageLedgerCsv(org: OrgRow, workDir: string): Promise<string | null> {
  const requests: Row[] = [];
  for await (const page of pages(
    "payment_requests",
    { organization: { _eq: org.id } },
    ["request_type", "title", "amount_paid", "paid_at", "status"],
    "id"
  )) {
    requests.push(...page);
  }

  const expenses: Row[] = [];
  for await (const page of pages(
    "payment_expenses",
    { organization: { _eq: org.id } },
    ["category", "title", "amount", "expense_date", "date_created"],
    "id"
  )) {
    expenses.push(...page);
  }

  const opts = openingBalanceFromOrg(org);
  const entries: LedgerEntry[] = entriesSinceOpening(
    [
      ...incomeEntriesFromRequests(requests as never),
      ...expenseEntriesFromExpenses(expenses as never),
    ],
    opts
  ).sort((a, b) => a.date.localeCompare(b.date));

  let running = opts.openingBalance;
  const rows: Array<Array<string | number | null>> = [
    [
      opts.openingBalanceAsOf ? opts.openingBalanceAsOf.slice(0, 10) : "",
      "Opening balance",
      "",
      "",
      "",
      running.toFixed(2),
    ],
  ];
  for (const entry of entries) {
    running += entry.direction === "in" ? entry.amount : -entry.amount;
    rows.push([
      entry.date.slice(0, 10),
      entry.direction === "in" ? "Money in" : "Money out",
      entry.category,
      entry.label ?? "",
      entry.amount.toFixed(2),
      running.toFixed(2),
    ]);
  }

  const file = "csv/ledger.csv";
  await writeFile(
    join(workDir, file),
    `${toCsv(
      ["Date", "Direction", "Category", "Description", "Amount", "Running balance"],
      rows
    )}\n`
  );
  console.log(`   ledger.csv                       ${String(entries.length).padStart(7)} entries`);
  return file;
}

// ---------------------------------------------------------------------------
// The org's files
// ---------------------------------------------------------------------------

interface StoredFile {
  id: string;
  name: string;
  bytes: number;
}

/** Every folder under the org's root, as "path/inside/the/archive". */
async function folderPaths(rootId: string): Promise<Map<string, string>> {
  const paths = new Map<string, string>([[rootId, ""]]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const ids of chunk(frontier, 50)) {
      const folders = (await directus.request(
        readFolders({
          filter: { parent: { _in: ids } },
          fields: ["id", "name", "parent"],
          limit: -1,
        })
      )) as Array<{ id: string; name: string; parent: string | { id: string } | null }>;
      for (const f of folders) {
        const parentId = typeof f.parent === "string" ? f.parent : f.parent?.id;
        const base = parentId ? paths.get(parentId) : "";
        if (base == null) continue;
        paths.set(f.id, base ? `${base}/${safeName(f.name)}` : safeName(f.name));
        next.push(f.id);
      }
    }
    frontier = next;
  }
  return paths;
}

/** Keep a folder or file name from escaping its directory inside the archive. */
function safeName(name: string): string {
  return (name || "untitled").replace(/[/\\]/g, "-").replace(/^\.+/, "_").trim() || "untitled";
}

/**
 * The org's files, addressed by their path inside the archive.
 *
 * Directus `directus_files` is a global collection; an org owns the subtree
 * under `hoa_organizations.folder`, which is the same containment rule the
 * storage API enforces on every request. Files sitting at the very root of that
 * subtree land in `files/` directly.
 */
async function collectFiles(rootId: string): Promise<StoredFile[]> {
  const paths = await folderPaths(rootId);
  const used = new Set<string>();
  const out: StoredFile[] = [];

  for (const ids of chunk([...paths.keys()], 50)) {
    for (let page = 1; ; page++) {
      // `readFiles`, not `readItems("directus_files")` — files are a system
      // collection served from /files, and /items/directus_files does not exist.
      const files = (await directus.request(
        readFiles({
          filter: { folder: { _in: ids } },
          fields: ["id", "filename_download", "filesize", "folder"],
          sort: ["id"],
          limit: PAGE_SIZE,
          page,
        })
      )) as unknown as Array<{
        id: string;
        filename_download: string | null;
        filesize: number | string | null;
        folder: string | { id: string } | null;
      }>;
      if (!files.length) break;

      for (const f of files) {
        const folderId = typeof f.folder === "string" ? f.folder : f.folder?.id;
        const dir = folderId ? (paths.get(folderId) ?? "") : "";
        const base = safeName(f.filename_download || f.id);
        // Two uploads can share a filename in one folder. Prefix the id rather
        // than silently overwriting one with the other.
        let name = dir ? `${dir}/${base}` : base;
        if (used.has(name)) name = dir ? `${dir}/${f.id.slice(0, 8)}-${base}` : `${f.id.slice(0, 8)}-${base}`;
        used.add(name);
        out.push({ id: f.id, name: `files/${name}`, bytes: Number(f.filesize) || 0 });
      }
      if (files.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/**
 * Append one entry and wait for archiver to finish consuming it.
 *
 * Appending every file at once would queue hundreds of open HTTP responses that
 * archiver reads minutes later, and the idle ones time out. One at a time keeps
 * exactly one download in flight and bounds memory to a single buffer.
 */
function appendStream(archive: archiver.Archiver, source: Readable, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEntry = () => {
      archive.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      archive.off("entry", onEntry);
      reject(err);
    };
    archive.once("entry", onEntry);
    archive.once("error", onError);
    archive.append(source, { name });
  });
}

// ---------------------------------------------------------------------------
// Uploading the archive
// ---------------------------------------------------------------------------

/**
 * The folder finished archives live in — deliberately OUTSIDE every org root.
 *
 * Org storage usage is the sum of `filesize` across the org's folder subtree, so
 * dropping a 2 GB archive inside it would charge a community quota for asking
 * for its own data, and the next export would then include the previous one.
 */
async function exportsFolderId(): Promise<string | null> {
  const existing = (await directus.request(
    readFolders({
      filter: { name: { _eq: EXPORT_FOLDER_NAME }, parent: { _null: true } },
      fields: ["id"],
      limit: 1,
    })
  )) as Array<{ id: string }>;
  if (existing[0]) return existing[0].id;

  const res = await fetch(`${DIRECTUS_URL}/folders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: EXPORT_FOLDER_NAME, parent: null }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { id?: string } };
  return body.data?.id ?? null;
}

async function uploadArchive(path: string, filename: string, folder: string | null): Promise<string> {
  // openAsBlob reads lazily, so a multi-gigabyte archive is streamed to Directus
  // rather than loaded into the worker's heap first.
  const blob = await openAsBlob(path, { type: "application/zip" });
  const form = new FormData();
  if (folder) form.append("folder", folder);
  form.append("title", filename);
  form.append("filename_download", filename);
  // Directus applies the metadata fields that precede the file part, so `file`
  // goes last.
  form.append("file", blob, filename);

  const res = await fetch(`${DIRECTUS_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data?: { id?: string } };
  if (!body.data?.id) throw new Error("Upload succeeded but Directus returned no file id");
  return body.data.id;
}

// ---------------------------------------------------------------------------
// Building one job
// ---------------------------------------------------------------------------

async function buildArchive(
  job: ExportJob,
  org: OrgRow,
  workDir: string,
  zipPath: string
): Promise<ReturnType<typeof buildManifest>> {
  const tier = job.tier;
  const entries = exportOrder(tier);
  const pks = await primaryKeys();
  const parents = new Set(
    entries.map((e) => (e.scope.kind === "via" ? e.scope.parent : null)).filter(Boolean) as string[]
  );

  await mkdir(join(workDir, "data"), { recursive: true });
  await mkdir(join(workDir, "csv"), { recursive: true });

  const idsByCollection = new Map<string, string[]>();
  const collections: ManifestCollection[] = [];
  const csvs: string[] = [];

  for (const entry of entries) {
    const summary = await stageCollection(
      entry,
      tier,
      org.id,
      workDir,
      idsByCollection,
      pks,
      parents.has(entry.collection)
    );
    collections.push(summary);
    console.log(`   ${entry.collection.padEnd(32)} ${String(summary.rows).padStart(7)} rows`);

    // A CSV is the readable convenience copy; `data/*.json` beside it is the
    // record. If a column has drifted out of the schema, warn and keep going —
    // losing a spreadsheet is not a reason to fail an export the board is
    // waiting on.
    try {
      const csv = await stageCsv(entry, org.id, workDir, idsByCollection, pks);
      if (csv) csvs.push(csv);
    } catch (err) {
      console.warn(`   ⚠️  ${entry.csv?.file}: ${(err as Error).message}`);
    }
  }

  try {
    const ledger = await stageLedgerCsv(org, workDir);
    if (ledger) csvs.push(ledger);
  } catch (err) {
    console.warn(`   ⚠️  ledger.csv: ${(err as Error).message}`);
  }

  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 6 } });
  const finished = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });
  archive.pipe(output);

  // Files first: they stream straight from Directus into the zip, one at a time,
  // and their tally is what the manifest reports.
  let files: ManifestFiles | null = null;
  if (job.include_files) {
    const rootId = typeof org.folder === "string" ? org.folder : org.folder?.id ?? null;
    if (!rootId) {
      console.log("   ⚠️  no storage root folder — the archive will carry records only");
    } else {
      const stored = await collectFiles(rootId);
      let count = 0;
      let bytes = 0;
      for (const file of stored) {
        const res = await fetch(`${DIRECTUS_URL}/assets/${file.id}?download`, {
          headers: { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
        });
        if (!res.ok || !res.body) {
          console.warn(`   ⚠️  skipped ${file.name}: HTTP ${res.status}`);
          continue;
        }
        await appendStream(archive, Readable.fromWeb(res.body as never), file.name);
        count++;
        bytes += file.bytes;
      }
      files = { count, bytes };
      console.log(`   files                            ${String(count).padStart(7)} attached`);
    }
  }

  const manifest = buildManifest({
    tier,
    generatedAt: nowIso(),
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      legal_name: org.legal_name,
    },
    collections,
    csvs,
    files,
    appBuildId: BUILD_ID,
  });

  await writeFile(join(workDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(workDir, "README.txt"), renderReadme(manifest));

  // Everything staged on disk goes in last, in one shot. The zip itself lives
  // outside `workDir`, so this can never try to archive the file it is writing.
  archive.directory(workDir, false);
  await archive.finalize();
  await finished;

  return manifest;
}

async function runJob(job: ExportJob): Promise<void> {
  const org = (await directus.request(
    readItem("hoa_organizations" as never, job.organization, {
      fields: [
        "id",
        "name",
        "slug",
        "legal_name",
        "folder",
        "opening_balance",
        "opening_balance_date",
      ],
    } as never)
  )) as unknown as OrgRow;

  console.log(`\n📦 ${org.slug} — ${job.tier} export${job.include_files ? " + files" : ""} (${job.id})`);
  const workDir = join(WORK_ROOT, `hoa-export-${job.id}`);
  const zipPath = join(WORK_ROOT, `hoa-export-${job.id}.zip`);

  try {
    await mkdir(workDir, { recursive: true });
    const manifest = await buildArchive(job, org, workDir, zipPath);
    const size = (await stat(zipPath)).size;

    const stamp = nowIso().slice(0, 10);
    const filename = `${org.slug || "community"}-${job.tier}-export-${stamp}.zip`;
    const fileId = await uploadArchive(zipPath, filename, await exportsFolderId());

    const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 86_400_000).toISOString();
    await patchJob(job.id, {
      status: "ready",
      file: fileId,
      size_bytes: size,
      manifest,
      date_completed: nowIso(),
      expires_at: expiresAt,
    });
    console.log(`   ✅ ready — ${filename} (${size.toLocaleString("en-US")} bytes), expires ${expiresAt.slice(0, 10)}`);
    await notifyRequester(job, org, expiresAt);
  } catch (err) {
    const message = (err as Error)?.message || String(err);
    console.error(`   ❌ failed: ${message}`);
    await patchJob(job.id, {
      status: "failed",
      // The admin who asked sees this string in Settings → Your data, so keep it
      // to the sentence that tells them whether to retry.
      error: message.slice(0, 2000),
      date_completed: nowIso(),
    }).catch(() => {});
  } finally {
    if (KEEP_TEMP) {
      console.log(`   (kept ${workDir} and ${zipPath})`);
    } else {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      await rm(zipPath, { force: true }).catch(() => {});
    }
  }
}

/**
 * Tell the admin the archive is waiting.
 *
 * The Settings tab says "you can close this page — we'll keep going", and this
 * is the half that makes that true. It writes the bell row directly rather than
 * going through `notifyUsers`, which is a Nitro-only module; and it deliberately
 * does not consult the per-category preferences, because this is the receipt for
 * something the recipient just asked for by hand.
 */
async function notifyRequester(job: ExportJob, org: OrgRow, expiresAt: string): Promise<void> {
  if (!job.requested_by) return;
  const days = EXPORT_TTL_DAYS;
  try {
    await directus.request(
      createNotification({
        recipient: job.requested_by,
        subject: `Your ${org.name || org.slug} data export is ready`,
        message: [
          `The ${job.tier === "full" ? "full" : "shareable"} export you requested has finished.`,
          `Download it from Settings → Your data${APP_URL && org.slug ? ` (${APP_URL}/${org.slug}/admin/settings/data)` : ""}.`,
          `It stays available for ${days} days, until ${expiresAt.slice(0, 10)}.`,
        ].join(" "),
        collection: "hoa_data_exports",
        item: job.id,
      })
    );
  } catch (err) {
    console.warn(`   ⚠️  could not notify the requester: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

async function claimNext(): Promise<ExportJob | null> {
  const filter = ONLY_JOB
    ? { id: { _eq: ONLY_JOB } }
    : { status: { _eq: "queued" } };
  const rows = (await items("hoa_data_exports", {
    filter,
    fields: [
      "id",
      "status",
      "tier",
      "include_files",
      "organization",
      "requested_by",
      "date_created",
      "date_started",
    ],
    sort: ["date_created"],
    limit: 1,
  })) as unknown as ExportJob[];

  const job = rows[0];
  if (!job) return null;
  if (ONLY_JOB && job.status !== "queued" && job.status !== "running") {
    console.log(`   job ${job.id} is ${job.status}, not queued — refusing to rebuild it`);
    return null;
  }
  await patchJob(job.id, { status: "running", date_started: nowIso(), error: null });
  return job;
}

/**
 * Delete archives past their expiry and mark the rows `expired`.
 *
 * The row outlives the file on purpose: "an export happened on this date" is
 * part of the community's audit trail, and the row is what the Settings tab
 * shows to explain why a download link is gone.
 */
async function purgeExpired(): Promise<void> {
  const rows = (await items("hoa_data_exports", {
    filter: { status: { _eq: "ready" }, expires_at: { _lte: nowIso() } },
    fields: ["id", "file", "expires_at"],
    limit: 50,
  })) as unknown as Array<{ id: string; file: string | { id: string } | null }>;

  if (!rows.length) return;
  console.log(`🧹 purging ${rows.length} expired archive(s)`);
  for (const row of rows) {
    const fileId = typeof row.file === "string" ? row.file : row.file?.id;
    if (DRY_RUN) {
      console.log(`   would purge ${row.id}${fileId ? ` (file ${fileId})` : ""}`);
      continue;
    }
    if (fileId) {
      await directus.request(deleteFile(fileId)).catch((err) => {
        console.warn(`   ⚠️  could not delete file ${fileId}: ${(err as Error).message}`);
      });
    }
    await patchJob(row.id, { status: "expired", file: null }).catch((err) => {
      console.warn(`   ⚠️  could not expire ${row.id}: ${(err as Error).message}`);
    });
  }
}

/**
 * Release jobs a killed worker left `running`.
 *
 * Without this, one crash wedges an org permanently: the POST route refuses a
 * new export while anything is in flight, so the board's "take my data" button
 * would 409 forever with no way to clear it from the UI.
 */
async function failStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
  const rows = (await items("hoa_data_exports", {
    filter: {
      status: { _eq: "running" },
      _or: [{ date_started: { _lte: cutoff } }, { date_started: { _null: true } }],
    },
    fields: ["id", "date_started"],
    limit: 25,
  })) as unknown as Array<{ id: string }>;

  for (const row of rows) {
    if (DRY_RUN) {
      console.log(`   would fail stale job ${row.id}`);
      continue;
    }
    console.log(`   ⚠️  job ${row.id} was left running — marking it failed`);
    await patchJob(row.id, {
      status: "failed",
      error: "The export was interrupted before it finished. Please request a new one.",
      date_completed: nowIso(),
    }).catch(() => {});
  }
}

/**
 * A single-writer lock for the whole run.
 *
 * The cron fires every few minutes and a files-included export can easily run
 * longer than the interval. Two overlapping workers would read the same oldest
 * `queued` row and both build it — two archives, double the disk and bandwidth,
 * and whichever finished second would overwrite the other's file id on the row.
 * Returns null when someone else holds the lock; a lock whose process is gone is
 * treated as stale and taken over, so a killed worker cannot block the queue.
 */
async function acquireLock(): Promise<(() => Promise<void>) | null> {
  const path = join(WORK_ROOT, "hoa-data-export.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await rm(path, { force: true }).catch(() => {});
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number((await readFile(path, "utf8").catch(() => "")).trim());
      if (pid && isRunning(pid)) return null;
      console.log(`   (clearing a stale lock from pid ${pid || "unknown"})`);
      await rm(path, { force: true }).catch(() => {});
    }
  }
  return null;
}

/** Signal 0 tests for the process without touching it. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function main() {
  console.log(`📦 Data export worker — ${nowIso()}${DRY_RUN ? " (dry run)" : ""}`);

  // A dry run only reads, so it can look in on a build that is already going.
  const release = DRY_RUN ? async () => {} : await acquireLock();
  if (!release) {
    console.log("⏭️  Another export worker is already running — nothing to do.");
    return;
  }
  try {
    await runQueue();
  } finally {
    await release();
  }
}

async function runQueue() {

  await purgeExpired();
  await failStaleJobs();
  if (PURGE_ONLY) {
    console.log("✅ purge only — done.");
    return;
  }

  if (DRY_RUN) {
    const queued = (await items("hoa_data_exports", {
      filter: ONLY_JOB ? { id: { _eq: ONLY_JOB } } : { status: { _eq: "queued" } },
      fields: ["id", "tier", "include_files", "date_created", { organization: ["slug"] }],
      sort: ["date_created"],
      limit: 25,
    })) as unknown as Array<{
      id: string;
      tier: string;
      include_files: boolean;
      organization: { slug?: string } | string | null;
    }>;
    console.log(`\nqueued=${queued.length}`);
    for (const job of queued) {
      const slug = typeof job.organization === "object" ? job.organization?.slug : job.organization;
      console.log(`   ${job.id}  ${slug}  ${job.tier}${job.include_files ? " + files" : ""}`);
    }
    console.log("\n✅ Dry run — nothing was written.");
    return;
  }

  let built = 0;
  while (built < MAX_JOBS) {
    const job = await claimNext();
    if (!job) break;
    await runJob(job);
    built++;
    if (ONLY_JOB) break;
  }

  console.log(`\n✅ Done. built=${built}`);
}

main().catch((err) => {
  console.error("\n❌ Worker failed:", err);
  process.exit(1);
});
