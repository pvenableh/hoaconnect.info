/**
 * The "Support attachments" folder in directus_files (operator console
 * Session F). Support uploads land here; without it they land in the root and
 * still work. Read-only unless --apply.
 *
 * Also reports, read-only, what non-admin policies may read in directus_files:
 * the app never hands these files out through a member's own Directus
 * permissions (the asset proxy refuses them, and downloads check the message),
 * but a policy with unfiltered read would let `/api/directus/files` list their
 * names.
 *
 *   pnpm run create:support-attachments-folder              # read-only
 *   pnpm run create:support-attachments-folder -- --apply   # create (hosted Directus: Peter's yes first)
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");
const NAME = "Support attachments";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);

  const folders = (await directusFetch(`/folders?filter=${q({ name: { _eq: NAME }, parent: { _null: true } })}&fields=id&limit=-1`))?.data ?? [];
  console.log(`Folder "${NAME}": ${folders.length ? `exists (${folders.length})` : "missing"}`);

  const files = (await directusFetch(`/files?filter=${q({ description: { _starts_with: "support-" } })}&fields=description&limit=-1`))?.data ?? [];
  const pending = files.filter((f: any) => String(f.description).startsWith("support-upload:")).length;
  console.log(`Support files: ${files.length} (${pending} waiting to be attached, ${files.length - pending} on messages)`);

  const perms = (await directusFetch(`/permissions?filter=${q({ collection: { _eq: "directus_files" }, action: { _eq: "read" } })}&fields=policy,permissions&limit=-1`))?.data ?? [];
  const unfiltered = perms.filter((p: any) => !p.permissions || !Object.keys(p.permissions).length).length;
  console.log(`Non-admin read rules on directus_files: ${perms.length} (${unfiltered} unfiltered)`);

  if (!APPLY) {
    if (!folders.length) console.log("\nNothing written. Run with --apply to create the folder.");
    return;
  }
  if (folders.length) {
    console.log("\nNothing to create.");
    return;
  }
  const created = await directusFetch("/folders", { method: "POST", body: JSON.stringify({ name: NAME, parent: null }) });
  console.log(`\nCreated folder "${NAME}" (${created?.data?.id ? "ok" : "no id returned"})`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
