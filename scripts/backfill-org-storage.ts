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
];

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

async function moveFile(fileId: string, folderId: string, label: string, counters: any) {
  if (folderId.startsWith("dry:")) return;
  counters.candidates++;
  if (!APPLY) {
    counters.wouldMove++;
    return;
  }
  try {
    await df(`/files/${fileId}`, { method: "PATCH", body: JSON.stringify({ folder: folderId }) });
    counters.moved++;
  } catch (e: any) {
    console.warn(`   ⚠︎ could not move ${label} file ${fileId}: ${e.message}`);
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

async function sortComments(orgId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_comments?filter[organization][_eq]=${orgId}&fields=id,attachments&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "comment", counters);
  } catch (e: any) {
    console.warn(`   ⚠︎ comments sort skipped: ${e.message}`);
  }
}

async function sortMessages(orgId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_channel_messages?filter[channel][organization][_eq]=${orgId}&fields=id,attachments&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "message", counters);
  } catch (e: any) {
    console.warn(`   ⚠︎ messages sort skipped: ${e.message}`);
  }
}

async function sortEmails(orgId: string, dest: string, counters: any) {
  try {
    const rows =
      (await df(
        `/items/hoa_emails?filter[organization][_eq]=${orgId}&fields=id,attachments.directus_files_id&limit=-1`
      ))?.data || [];
    for (const r of rows) for (const fid of fileIdsFrom(r.attachments)) await moveFile(fid, dest, "email", counters);
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

  const counters = { candidates: 0, wouldMove: 0, moved: 0 };

  for (const org of orgs) {
    console.log(`🏢 ${org.name || org.slug} (${org.slug})`);
    const { rootId, map } = await ensureOrg(org);
    console.log(`   root: ${rootId}`);

    if (!SKIP_SORT && !rootId.startsWith("dry:")) {
      await sortComments(org.id, map["uploads/comments"], counters);
      await sortMessages(org.id, map["uploads/messages"], counters);
      await sortEmails(org.id, map["uploads/emails"], counters);
    }
    console.log("");
  }

  console.log("— Summary —");
  console.log(`  files matched: ${counters.candidates}`);
  if (APPLY) console.log(`  files moved:   ${counters.moved}`);
  else console.log(`  would move:    ${counters.wouldMove}  (re-run with --apply)`);
  console.log("\n✅ Done.");
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
