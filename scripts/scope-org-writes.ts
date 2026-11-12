/**
 * Scope the HOA policies' unrestricted update and delete rights (the contract
 * and the reasons are in scripts/lib/org-write-scopes.ts).
 *
 *   pnpm exec dotenv -- tsx scripts/scope-org-writes.ts                       # dry run
 *   pnpm exec dotenv -- tsx scripts/scope-org-writes.ts --apply <backup.json> # write (Peter's yes first)
 *   pnpm exec dotenv -- tsx scripts/scope-org-writes.ts --revert <backup.json>
 *
 * --apply adds the `block_hero.hoa_organizations` alias (metadata only), writes
 * the rows it will change to <backup.json>, sets each filter, reads it back,
 * and clears the Directus cache. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { HERO_ORG_ALIAS, ORG_WRITE_SCOPES } from "./lib/org-write-scopes";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
const argAfter = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const APPLY = argAfter("--apply");
const REVERT = argAfter("--revert");

async function df(endpoint: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${endpoint.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureHeroAlias(write: boolean) {
  const relation = (await df("/relations/hoa_organizations/hero")).data;
  const hasField = await df(`/fields/block_hero/${HERO_ORG_ALIAS}`).then(() => true, () => false);
  const wired = relation?.meta?.one_field === HERO_ORG_ALIAS && hasField;
  console.log(`block_hero.${HERO_ORG_ALIAS} (reverse of hoa_organizations.hero): ${wired ? "wired" : "missing"}`);
  if (wired || !write) return;
  if (!hasField) {
    await df("/fields/block_hero", {
      method: "POST",
      body: JSON.stringify({
        field: HERO_ORG_ALIAS,
        type: "alias",
        schema: null,
        meta: { interface: "list-o2m", special: ["o2m"], hidden: true, note: "Reverse of hoa_organizations.hero. HOA Admin update/delete scope through it (scripts/lib/org-write-scopes.ts)." },
      }),
    });
  }
  if (relation?.meta?.one_field !== HERO_ORG_ALIAS) {
    await df("/relations/hoa_organizations/hero", { method: "PATCH", body: JSON.stringify({ meta: { one_field: HERO_ORG_ALIAS } }) });
  }
  console.log("  ✅ wired");
}

type Row = { id: number; policy: string; collection: string; action: string; permissions: unknown };

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : REVERT ? "REVERT" : "dry run"}`);
  if (REVERT) {
    const rows = JSON.parse(readFileSync(REVERT, "utf8")) as Row[];
    for (const r of rows) await df(`/permissions/${r.id}`, { method: "PATCH", body: JSON.stringify({ permissions: r.permissions }) });
    await df("/utils/cache/clear", { method: "POST" });
    return console.log(`Reverted ${rows.length} row(s); cache cleared.`);
  }

  await ensureHeroAlias(!!APPLY);
  const policies = (await df("/policies?fields=id,name&limit=100")).data as { id: string; name: string }[];
  const changes: { row: Row; to: unknown; policy: string }[] = [];
  for (const [policyName, collections] of Object.entries(ORG_WRITE_SCOPES)) {
    const policy = policies.find((p) => p.name === policyName);
    if (!policy) throw new Error(`No policy ${policyName}`);
    for (const [collection, actions] of Object.entries(collections)) {
      for (const [action, to] of Object.entries(actions)) {
        const [row] = (await df(`/permissions?filter[policy][_eq]=${policy.id}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&fields=id,policy,collection,action,permissions&limit=1`)).data as Row[];
        if (!row) {
          console.log(`  - ${policyName} ${collection} ${action}: no such permission, nothing to scope`);
          continue;
        }
        const same = JSON.stringify(row.permissions) === JSON.stringify(to);
        console.log(`  ${same ? "✓" : "→"} #${row.id} ${policyName} ${collection} ${action}: ${same ? "already scoped" : `${JSON.stringify(row.permissions)} → ${JSON.stringify(to)}`}`);
        if (!same) changes.push({ row, to, policy: policyName });
      }
    }
  }
  if (!changes.length) return console.log("\n✅ Already scoped — nothing to do.");
  if (!APPLY) return console.log(`\n(dry run) ${changes.length} row(s) would change. Re-run with --apply <backup.json>.`);

  writeFileSync(APPLY, JSON.stringify(changes.map((c) => c.row), null, 2));
  console.log(`\nBackup of ${changes.length} row(s): ${APPLY}`);
  for (const { row, to, policy } of changes) {
    await df(`/permissions/${row.id}`, { method: "PATCH", body: JSON.stringify({ permissions: to }) });
    const back = (await df(`/permissions/${row.id}?fields=permissions`)).data;
    if (JSON.stringify(back.permissions) !== JSON.stringify(to)) throw new Error(`#${row.id}: read-back differs; run --revert ${APPLY}`);
    console.log(`  ✅ #${row.id} ${policy} ${row.collection} ${row.action}`);
  }
  await df("/utils/cache/clear", { method: "POST" });
  console.log("Cache cleared.");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
