/**
 * Recompute (backfill) `hoa_organizations.storage_used_bytes` for every org by
 * summing `filesize` across the org's whole folder subtree. Run this once after
 * `setup:org-storage-fields` to seed the cached counters from existing files;
 * the app keeps them current thereafter (and self-heals via the meter's
 * ?recompute path).
 *
 * DRY-RUN by default — prints what each org WOULD be set to. Pass --apply to
 * write. Scope to one org with --org=<slug>.
 *
 * Run:  pnpm run recompute:org-storage                 (dry run, all orgs)
 *       pnpm run recompute:org-storage -- --apply       (apply)
 *       pnpm run recompute:org-storage -- --apply --org=605lincolnroad
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const ORG_ARG = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length);

async function api(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** All folder ids under `root` (inclusive), via level-order BFS. */
async function subtreeFolderIds(root: string): Promise<string[]> {
  const ids = [root];
  let frontier = [root];
  while (frontier.length) {
    const params = new URLSearchParams({ "fields[]": "id", limit: "-1" });
    frontier.forEach((id, i) => params.set(`filter[parent][_in][${i}]`, id));
    const j = await api(`/folders?${params}`);
    const next = (j?.data || []).map((f: any) => f.id).filter(Boolean);
    if (!next.length) break;
    ids.push(...next);
    frontier = next;
  }
  return ids;
}

/** Sum filesize across a folder subtree via chunked REST aggregate. */
async function sumSubtree(root: string): Promise<number> {
  const folders = await subtreeFolderIds(root);
  let total = 0;
  for (let i = 0; i < folders.length; i += 50) {
    const chunk = folders.slice(i, i + 50);
    const params = new URLSearchParams({ "aggregate[sum]": "filesize" });
    chunk.forEach((id, idx) => params.set(`filter[folder][_in][${idx}]`, id));
    const j = await api(`/files?${params}`);
    total += Number(j?.data?.[0]?.sum?.filesize) || 0;
  }
  return total;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

async function main() {
  console.log(
    `🧮 Recompute org storage — ${APPLY ? "APPLY" : "DRY RUN"}${ORG_ARG ? ` (org=${ORG_ARG})` : ""}\n`
  );

  const filter = ORG_ARG ? `&filter[slug][_eq]=${encodeURIComponent(ORG_ARG)}` : "";
  const j = await api(
    `/items/hoa_organizations?fields[]=id&fields[]=name&fields[]=slug&fields[]=folder&limit=-1${filter}`
  );
  const orgs: any[] = j?.data || [];
  if (!orgs.length) {
    console.log("No organizations found.");
    return;
  }

  for (const org of orgs) {
    const root = typeof org.folder === "string" ? org.folder : org.folder?.id ?? null;
    if (!root) {
      console.log(`   ⚠️  ${org.slug || org.id}: no root folder — skipping`);
      continue;
    }
    const total = await sumSubtree(root);
    console.log(`   ${org.slug || org.name}: ${fmt(total)} (${total} bytes)`);
    if (APPLY) {
      await api(`/items/hoa_organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ storage_used_bytes: total }),
      });
    }
  }

  console.log(
    APPLY ? "\n✅ Applied." : "\nℹ️  Dry run — re-run with --apply to write."
  );
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
