/**
 * Narrow what the Directus **HOA Member** policy may update and delete in
 * `directus_files` (the contract and the reasons are in scripts/lib/member-files.ts).
 *
 *   pnpm exec dotenv -- tsx scripts/scope-member-file-writes.ts            # dry run
 *   pnpm exec dotenv -- tsx scripts/scope-member-file-writes.ts --apply    # write (Peter's yes first)
 *
 * Touches two permission rows of one policy and nothing else. Reads each back
 * after writing. Idempotent: a second run reports "already scoped".
 *
 * Check it with a member's own token (the app's `/api/websocket/token` gives
 * one to the signed-in user): `GET /permissions/me/directus_files/<id>` answers
 * update and delete access for that file without changing it.
 */
import { MEMBER_FILE_DELETE_FILTER, MEMBER_FILE_UPDATE_FILTER } from "./lib/member-files";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function df(endpoint: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${endpoint.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const TARGET: Record<string, unknown> = { update: MEMBER_FILE_UPDATE_FILTER, delete: MEMBER_FILE_DELETE_FILTER };

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}`);
  const policies = (await df("/policies?fields=id,name&limit=100")).data as { id: string; name: string }[];
  const member = policies.find((p) => p.name === "HOA Member");
  if (!member) throw new Error("No HOA Member policy");
  const perms = (await df(`/permissions?filter[policy][_eq]=${member.id}&filter[collection][_eq]=directus_files&fields=id,action,permissions&limit=20`))
    .data as { id: number; action: string; permissions: unknown }[];

  const changes: { id: number; action: string; from: unknown; to: unknown }[] = [];
  for (const action of ["update", "delete"]) {
    const row = perms.find((p) => p.action === action);
    if (!row) throw new Error(`HOA Member has no ${action} permission on directus_files`);
    const same = JSON.stringify(row.permissions) === JSON.stringify(TARGET[action]);
    console.log(`\nHOA Member · directus_files · ${action} (permission ${row.id})${same ? " — already scoped" : ""}`);
    console.log(`  current: ${JSON.stringify(row.permissions)}`);
    if (!same) {
      console.log(`  target:  ${JSON.stringify(TARGET[action])}`);
      changes.push({ id: row.id, action, from: row.permissions, to: TARGET[action] });
    }
  }
  const others = perms.filter((p) => !["update", "delete"].includes(p.action)).map((p) => p.action);
  console.log(`\nLeft as they are: ${others.join(", ") || "nothing"}`);

  if (!changes.length) return console.log("\n✅ Already scoped — nothing to do.");
  if (!APPLY) return console.log(`\n(dry run) ${changes.length} permission row(s) would change. Re-run with --apply.`);

  for (const c of changes) {
    await df(`/permissions/${c.id}`, { method: "PATCH", body: JSON.stringify({ permissions: c.to }) });
    const back = (await df(`/permissions/${c.id}?fields=permissions`)).data;
    if (JSON.stringify(back.permissions) !== JSON.stringify(c.to)) {
      await df(`/permissions/${c.id}`, { method: "PATCH", body: JSON.stringify({ permissions: c.from }) });
      throw new Error(`${c.action}: the read-back did not match, so it was put back`);
    }
    console.log(`  ✅ ${c.action} scoped (permission ${c.id})`);
  }
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
