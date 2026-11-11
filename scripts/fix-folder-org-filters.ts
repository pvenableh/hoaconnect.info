/**
 * Stop the bare 500 on nested file, folder and user reads with a member's token
 * (the cause and the fix are in scripts/lib/folder-org-filters.ts).
 *
 *   pnpm exec dotenv -- tsx scripts/fix-folder-org-filters.ts                       # dry run
 *   pnpm exec dotenv -- tsx scripts/fix-folder-org-filters.ts --apply <backup.json> # write (Peter's yes first)
 *   pnpm exec dotenv -- tsx scripts/fix-folder-org-filters.ts --revert <backup.json>
 *
 * --apply: adds the `directus_folders.hoa_organizations` alias (metadata only,
 * no column), writes the rows it changes to <backup.json> first, rewrites every
 * permission row that uses `$CURRENT_USER.hoa_members.organization.folder`,
 * reads each back, and clears the Directus cache (needed after a permission
 * change; see 0776dba). --revert puts those rows back from the file and clears
 * the cache; the alias stays (it changes nothing on its own).
 *
 * Idempotent: a second run finds no row to change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FOLDER_ORG_ALIAS, rewriteFolderFilter, usesFolderPath } from "./lib/folder-org-filters";

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

type Row = { id: number; policy: string; collection: string; action: string; permissions: unknown; validation: unknown; presets: unknown };
const PARTS = ["permissions", "validation", "presets"] as const;

async function ensureAlias(write: boolean) {
  const relation = (await df("/relations/hoa_organizations/folder")).data;
  const hasField = await df(`/fields/directus_folders/${FOLDER_ORG_ALIAS}`).then(() => true, () => false);
  const wired = relation?.meta?.one_field === FOLDER_ORG_ALIAS && hasField;
  console.log(`directus_folders.${FOLDER_ORG_ALIAS} (reverse of hoa_organizations.folder): ${wired ? "wired" : "missing"}`);
  if (wired || !write) return;
  if (!hasField) {
    // Alias only: `type: "alias"` with `special: ["o2m"]` adds no database column.
    await df("/fields/directus_folders", {
      method: "POST",
      body: JSON.stringify({
        field: FOLDER_ORG_ALIAS,
        type: "alias",
        schema: null,
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          hidden: true,
          note: "Reverse of hoa_organizations.folder. File and folder permissions scope through it (scripts/lib/folder-org-filters.ts).",
        },
      }),
    });
  }
  if (relation?.meta?.one_field !== FOLDER_ORG_ALIAS) {
    await df("/relations/hoa_organizations/folder", { method: "PATCH", body: JSON.stringify({ meta: { one_field: FOLDER_ORG_ALIAS } }) });
  }
  console.log("  ✅ wired");
}

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : REVERT ? "REVERT" : "dry run"}`);
  const policies = (await df("/policies?fields=id,name&limit=100")).data as { id: string; name: string }[];
  const name = (id: string) => policies.find((p) => p.id === id)?.name ?? id;

  if (REVERT) {
    const rows = JSON.parse(readFileSync(REVERT, "utf8")) as Row[];
    for (const r of rows) {
      await df(`/permissions/${r.id}`, { method: "PATCH", body: JSON.stringify({ permissions: r.permissions, validation: r.validation, presets: r.presets }) });
      console.log(`  ↩︎ #${r.id} ${name(r.policy)} ${r.collection} ${r.action}`);
    }
    await df("/utils/cache/clear", { method: "POST" });
    return console.log(`Reverted ${rows.length} row(s); cache cleared.`);
  }

  await ensureAlias(!!APPLY);
  const all = (await df("/permissions?limit=-1&fields=id,policy,collection,action,permissions,validation,presets")).data as Row[];
  const affected = all.filter((r) => PARTS.some((part) => usesFolderPath(r[part])));
  const next = affected.map((r) => {
    const out: Partial<Row> = {};
    for (const part of PARTS) {
      if (!usesFolderPath(r[part])) continue;
      // A payload validation cannot follow a relation: drop it.
      out[part] = part === "validation" ? null : rewriteFolderFilter(r[part]);
    }
    return { row: r, change: out };
  });
  for (const { row, change } of next) {
    console.log(`\n#${row.id} ${name(row.policy)} · ${row.collection} · ${row.action}`);
    for (const [part, value] of Object.entries(change)) {
      console.log(`  ${part} before: ${JSON.stringify(row[part as keyof Row])}`);
      console.log(`  ${part} after:  ${value === null ? "null (dropped)" : JSON.stringify(value)}`);
    }
  }
  if (!affected.length) return console.log("\n✅ No row uses the folder path — nothing to do.");
  if (!APPLY) return console.log(`\n(dry run) ${affected.length} row(s) would change. Re-run with --apply <backup.json>.`);

  writeFileSync(APPLY, JSON.stringify(affected, null, 2));
  console.log(`\nBackup of ${affected.length} row(s): ${APPLY}`);
  for (const { row, change } of next) {
    await df(`/permissions/${row.id}`, { method: "PATCH", body: JSON.stringify(change) });
    const back = (await df(`/permissions/${row.id}?fields=permissions,validation,presets`)).data;
    for (const [part, value] of Object.entries(change)) {
      if (JSON.stringify(back[part]) !== JSON.stringify(value)) throw new Error(`#${row.id} ${part}: read-back differs; run --revert ${APPLY}`);
    }
    console.log(`  ✅ #${row.id} ${name(row.policy)} ${row.collection} ${row.action}`);
  }
  await df("/utils/cache/clear", { method: "POST" });
  console.log("Cache cleared.");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
