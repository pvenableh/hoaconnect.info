/**
 * Backfill the per-organization storage structure.
 *
 * Phase 1 — Scaffold (always safe, idempotent):
 *   For every org, ensure it has a root folder (hoa_organizations.folder) and
 *   the standard subfolder layout:
 *     Documents · Meetings(Agendas,Minutes) · Images · Uploads(Comments,
 *     Messages,Emails) · Branding
 *
 * Phase 2 — Sort existing files (best-effort, guarded):
 *   Move already-uploaded files into their matching subfolder based on what
 *   references them:
 *     comment attachments  → Uploads/Comments
 *     channel-msg attach.  → Uploads/Messages
 *     email attachments    → Uploads/Emails
 *   and file what sits in no folder with its community (2026-11-16):
 *     expense receipts     → Records/Expense receipts  (marked record-expense-receipt)
 *     lease documents      → Records/Leases            (marked record-lease; a
 *                            lease, or an owner's lease report)
 *     documents' files     → Documents
 *     logo, icon, footer   → Branding
 *     landing hero images  → Images
 *   A file is moved only when it sits in no folder or already inside this
 *   community's library: never out of another community's (a row of this one
 *   may name another's file). The new sorts take only files in no folder.
 *   Each category is fault-tolerant — a schema mismatch logs a warning and the
 *   pass continues.
 *
 * Safety: DRY-RUN by default. Pass --apply to write. Optional --org=<slug> to
 * target a single org, --skip-sort to only scaffold.
 *
 * Run:  pnpm run backfill:storage            (dry run, all orgs)
 *       pnpm run backfill:storage -- --apply (apply)
 *       pnpm run backfill:storage -- --apply --org=605lincolnroad
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const SKIP_SORT = ARGS.includes("--skip-sort");
const ORG_FILTER = ARGS.find((a) => a.startsWith("--org="))?.split("=")[1] || null;

interface Node {
  key: string;
  name: string;
  children?: Node[];
}
const STORAGE_TREE: Node[] = [
  { key: "documents", name: "Documents" },
  {
    key: "meetings",
    name: "Meetings",
    children: [
      { key: "meetings/agendas", name: "Agendas" },
      { key: "meetings/minutes", name: "Minutes" },
    ],
  },
  { key: "images", name: "Images" },
  {
    key: "uploads",
    name: "Uploads",
    children: [
      { key: "uploads/comments", name: "Comments" },
      { key: "uploads/messages", name: "Messages" },
      { key: "uploads/emails", name: "Emails" },
    ],
  },
  { key: "branding", name: "Branding" },
  // Keep in step with core/server/utils/org-storage.ts.
  {
    key: "records",
    name: "Records",
    children: [
      { key: "records/receipts", name: "Expense receipts" },
      { key: "records/leases", name: "Leases" },
    ],
  },
];

/** A record's file mark (core/shared/records/files.ts). */
const RECORD_MARK = { receipt: "record-expense-receipt", lease: "record-lease" } as const;

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${endpoint}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getChildFolders(parentId: string): Promise<any[]> {
  return (await df(`/folders?filter[parent][_eq]=${parentId}&fields=id,name&limit=-1`))?.data || [];
}

async function createFolder(name: string, parent: string | null): Promise<string> {
  if (!APPLY) {
    console.log(`   · would create folder "${name}"`);
    return `dry:${name}`;
  }
  const res = await df(`/folders`, { method: "POST", body: JSON.stringify({ name, parent }) });
  return res.data.id;
}

async function ensureChildren(parentId: string, nodes: Node[], map: Record<string, string>) {
  const existing = parentId.startsWith("dry:") ? [] : await getChildFolders(parentId);
  const byName = new Map<string, string>(existing.map((f: any) => [String(f.name).toLowerCase(), f.id]));
  for (const node of nodes) {
    let id = byName.get(node.name.toLowerCase());
    if (!id) id = await createFolder(node.name, parentId);
    map[node.key] = id;
    if (node.children?.length) await ensureChildren(id, node.children, map);
  }
}

async function ensureOrg(org: any): Promise<{ rootId: string; map: Record<string, string> }> {
  let rootId: string | null =
    typeof org.folder === "string" ? org.folder : org.folder?.id ?? null;

  if (rootId) {
    try {
      await df(`/folders/${rootId}?fields=id`);
    } catch {
      rootId = null;
    }
  }
  if (!rootId) {
    rootId = await createFolder(org.name || org.slug || "Organization", null);
    if (APPLY && !rootId.startsWith("dry:")) {
      await df(`/items/hoa_organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ folder: rootId }),
      });
    }
  }
  const map: Record<string, string> = {};
  await ensureChildren(rootId, STORAGE_TREE, map);
  return { rootId, map };
}

const parentOf = new Map<string, string | null>();
async function withinRoot(rootId: string, folderId: string): Promise<boolean> {
  let at: string | null = folderId;
  for (let i = 0; i < 64 && at; i++) {
    if (at === rootId) return true;
    if (!parentOf.has(at)) {
      const f = (await df(`/folders/${at}?fields=id,parent`).catch(() => null))?.data;
      parentOf.set(at, f?.parent ?? null);
    }
    at = parentOf.get(at) ?? null;
  }
  return false;
}

/**
 * Move a file into `folderId` of the community whose root is `rootId`: only
 * when it sits in no folder or already inside that library (with `onlyLoose`,
 * only when it sits in no folder). `mark` sets a record's mark on a file with
 * no description or another record mark, never over a governing or support one.
 */
async function moveFile(
  fileId: string,
  folderId: string,
  label: string,
  counters: any,
  rootId: string,
  opts: { onlyLoose?: boolean; mark?: string } = {}
) {
  if (folderId.startsWith("dry:")) return;
  const file = (await df(`/files/${fileId}?fields=id,folder,description`).catch(() => null))?.data;
  if (!file) return;
  const from: string | null = typeof file.folder === "string" ? file.folder : file.folder?.id ?? null;
  if (from && (opts.onlyLoose || !(await withinRoot(rootId, from)))) {
    if (from !== folderId && !(await withinRoot(rootId, from))) {
      console.warn(`   ⚠︎ left ${label} file ${fileId}: it is in another library`);
      counters.leftElsewhere++;
    }
    return;
  }
  const desc: string | null = file.description ?? null;
  const mark = opts.mark && (desc == null || desc.startsWith("record-")) && desc !== opts.mark ? opts.mark : null;
  if (from === folderId && !mark) return;
  counters.candidates++;
  if (!APPLY) {
    counters.wouldMove++;
    console.log(`   · would file ${label} ${fileId}${mark ? ` (mark ${mark})` : ""}`);
    return;
  }
  try {
    await df(`/files/${fileId}`, { method: "PATCH", body: JSON.stringify({ folder: folderId, ...(mark ? { description: mark } : {}) }) });
    counters.moved++;
  } catch (e: any) {
    console.warn(`   ⚠︎ could not move ${label} file ${fileId}: ${e.message}`);
  }
}

const idOf = (v: any): string | null => (typeof v === "string" ? v : v?.id ?? null);

async function sortRecords(orgId: string, rootId: string, map: Record<string, string>, counters: any) {
  const loose = { onlyLoose: true };
  try {
    const rows = (await df(`/items/payment_expenses?filter[organization][_eq]=${orgId}&filter[receipt][_nnull]=true&fields=receipt&limit=-1`))?.data || [];
    for (const r of rows) await moveFile(idOf(r.receipt)!, map["records/receipts"], "receipt", counters, rootId, { ...loose, mark: RECORD_MARK.receipt });
  } catch (e: any) {
    console.warn(`   ⚠︎ receipts sort skipped: ${e.message}`);
  }
  try {
    const leases = (await df(`/items/hoa_leases?filter[organization][_eq]=${orgId}&filter[document][_nnull]=true&fields=document&limit=-1`))?.data || [];
    const reports = (await df(`/items/hoa_member_change_requests?filter[organization][_eq]=${orgId}&filter[kind][_eq]=lease&fields=payload&limit=-1`))?.data || [];
    const ids = [...leases.map((l: any) => idOf(l.document)), ...reports.map((r: any) => r.payload?.document)].filter(Boolean);
    for (const id of new Set<string>(ids)) await moveFile(id, map["records/leases"], "lease", counters, rootId, { ...loose, mark: RECORD_MARK.lease });
  } catch (e: any) {
    console.warn(`   ⚠︎ leases sort skipped: ${e.message}`);
  }
}

async function sortDocuments(orgId: string, rootId: string, dest: string, counters: any) {
  try {
    const rows = (await df(`/items/hoa_documents?filter[organization][_eq]=${orgId}&filter[file][_nnull]=true&fields=file&limit=-1`))?.data || [];
    for (const r of rows) await moveFile(idOf(r.file)!, dest, "document", counters, rootId, { onlyLoose: true });
  } catch (e: any) {
    console.warn(`   ⚠︎ documents sort skipped: ${e.message}`);
  }
}

async function sortBranding(orgId: string, rootId: string, map: Record<string, string>, counters: any) {
  try {
    const org = (await df(`/items/hoa_organizations/${orgId}?fields=settings.logo,settings.icon,settings.footer_image,hero.background_image,hero.foreground_image`))?.data;
    for (const f of [org?.settings?.logo, org?.settings?.icon, org?.settings?.footer_image].map(idOf).filter(Boolean)) {
      await moveFile(f!, map.branding, "branding", counters, rootId, { onlyLoose: true });
    }
    for (const f of [org?.hero?.background_image, org?.hero?.foreground_image].map(idOf).filter(Boolean)) {
      await moveFile(f!, map.images, "hero image", counters, rootId, { onlyLoose: true });
    }
  } catch (e: any) {
    console.warn(`   ⚠︎ branding sort skipped: ${e.message}`);
  }
}

function fileIdsFrom(value: any): string[] {
  // attachments are stored as JSON arrays of file ids (strings) or objects.
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => (typeof v === "string" ? v : v?.id || v?.directus_files_id?.id || v?.directus_files_id))
    .filter(Boolean);
}

async function sortComments(orgId: string, rootId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_comments?filter[organization][_eq]=${orgId}&fields=id,attachments&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "comment", counters, rootId);
  } catch (e: any) {
    console.warn(`   ⚠︎ comments sort skipped: ${e.message}`);
  }
}

async function sortMessages(orgId: string, rootId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_channel_messages?filter[channel][organization][_eq]=${orgId}&fields=id,attachments&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "message", counters, rootId);
  } catch (e: any) {
    console.warn(`   ⚠︎ messages sort skipped: ${e.message}`);
  }
}

async function sortEmails(orgId: string, rootId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_emails?filter[organization][_eq]=${orgId}&fields=id,attachments.directus_files_id&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "email", counters, rootId);
  } catch (e: any) {
    console.warn(`   ⚠︎ emails sort skipped (collection/field may differ): ${e.message}`);
  }
}

async function main() {
  console.log(`📦 Org storage backfill — ${APPLY ? "APPLY" : "DRY RUN"}${ORG_FILTER ? ` (org=${ORG_FILTER})` : ""}\n`);

  let url = `/items/hoa_organizations?fields=id,name,slug,folder&limit=-1`;
  if (ORG_FILTER) url += `&filter[slug][_eq]=${encodeURIComponent(ORG_FILTER)}`;
  const orgs = (await df(url))?.data || [];
  if (!orgs.length) {
    console.log("No organizations found.");
    return;
  }

  const counters = { candidates: 0, wouldMove: 0, moved: 0, leftElsewhere: 0 };

  for (const org of orgs) {
    console.log(`🏢 ${org.name || org.slug} (${org.slug})`);
    const { rootId, map } = await ensureOrg(org);
    console.log(`   root: ${rootId}`);

    if (!SKIP_SORT && !rootId.startsWith("dry:")) {
      await sortComments(org.id, rootId, map["uploads/comments"], counters);
      await sortMessages(org.id, rootId, map["uploads/messages"], counters);
      await sortEmails(org.id, rootId, map["uploads/emails"], counters);
      await sortRecords(org.id, rootId, map, counters);
      await sortDocuments(org.id, rootId, map.documents, counters);
      await sortBranding(org.id, rootId, map, counters);
    }
    console.log("");
  }

  console.log("— Summary —");
  console.log(`  files matched: ${counters.candidates}`);
  if (counters.leftElsewhere) console.log(`  left in another library: ${counters.leftElsewhere}`);
  if (APPLY) console.log(`  files moved:   ${counters.moved}`);
  else console.log(`  would move:    ${counters.wouldMove}  (re-run with --apply)`);
  console.log("\n✅ Done.");
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
