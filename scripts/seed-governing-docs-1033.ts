/**
 * Import the 1033 Lenox governing documents from docs/governing-docs/seed/
 * (spec §4 "direct import", §8; plan docs/plan-governing-docs.md §3).
 *
 *   7 documents · 209 provisions · 43 curated statute flags · their statute
 *   references · the provision links of acceptance criterion 6 · the
 *   organization's regime / governing-statute fields.
 *
 * The mapping and the write order live in scripts/lib/governing-import.ts and
 * are tested in tests/scripts/governing-import.test.ts. This file only reads
 * the seed and talks to Directus.
 *
 * **Idempotent.** Rows are matched on (organization, source_key); a second run
 * creates nothing. Provision text and admin-set statuses are written on create
 * only: a re-run reports text that differs and leaves it alone.
 *
 * **The seed is data.** Text is stored exactly as it is in the files.
 *
 * Read-only by default: prints counts of what it would create or change.
 *   pnpm run seed:governing-docs-1033                    # look
 *   pnpm run seed:governing-docs-1033 -- --apply         # write (hosted Directus: Peter's yes first)
 *   … -- --flags=suggested                               # import flags hidden from members
 *
 * Prerequisites: `pnpm run create:governing-docs -- --apply` has run;
 * DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LENOX_PROVISION_LINKS,
  applyImportPlan,
  buildImportPlan,
  type ImportStore,
  type SeedFlagsFile,
  type SeedManifest,
  type SeedProvision,
} from "./lib/governing-import";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");
const FLAG_STATUS = process.argv.includes("--flags=suggested") ? "suggested" : "confirmed";
const SEED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/governing-docs/seed");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  // A dry run before the collections exist reads 403; that is "no row yet".
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint.split("?")[0]}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** A well-formed stand-in id for dry runs (uuid columns reject anything else). Never written. */
let dryCount = 0;
const dryUuid = () => `00000000-0000-4000-8000-${(++dryCount).toString(16).padStart(12, "0")}`;

const store: ImportStore = {
  async findOne(collection, match) {
    const filter = Object.fromEntries(Object.entries(match).map(([k, v]) => [k, v === null ? { _null: true } : { _eq: v }]));
    const res = await directusFetch(`/items/${collection}?limit=1&fields=*&filter=${encodeURIComponent(JSON.stringify(filter))}`);
    return res?.data?.[0] ?? null;
  },
  async create(collection, data) {
    if (!APPLY) return dryUuid();
    const res = await directusFetch(`/items/${collection}`, { method: "POST", body: JSON.stringify(data) });
    if (!res?.data?.id) throw new Error(`Could not create a row in ${collection} (does the collection exist?)`);
    return res.data.id;
  },
  async update(collection, id, data) {
    if (!APPLY) return;
    await directusFetch(`/items/${collection}/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
};

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to write)"} · flags as ${FLAG_STATUS}`);

  const read = (f: string) => readFileSync(resolve(SEED_DIR, f), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as SeedManifest;
  const provisions = JSON.parse(read("provisions.json")) as SeedProvision[];
  const flagsFile = JSON.parse(read("statute_flags.json")) as SeedFlagsFile;
  const transcriptions = Object.fromEntries(
    manifest.documents.filter((d) => d.transcription_file).map((d) => [d.transcription_file!, read(d.transcription_file!)])
  );

  const plan = buildImportPlan(manifest, provisions, flagsFile, {
    transcriptions,
    flagStatus: FLAG_STATUS,
    links: LENOX_PROVISION_LINKS,
  });
  console.log(
    `Seed: ${plan.documents.length} documents, ${plan.provisions.length} provisions, ${plan.flags.length} flags, ${plan.references.length} statute references, ${plan.links.length} provision links`
  );

  const org = await store.findOne("hoa_organizations", { slug: manifest.organization.slug });
  if (!org) throw new Error(`Organization "${manifest.organization.slug}" not found.`);

  // Organization fields: fill what is empty or different, and never blank a
  // `state` someone already set.
  const orgChanges: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plan.organization)) {
    if (v === null) continue;
    if (k === "state" && org.state) continue;
    if ((org[k] ?? null) !== v) orgChanges[k] = v;
  }
  console.log(`Organization fields to set: ${Object.keys(orgChanges).join(", ") || "none"}`);
  if (Object.keys(orgChanges).length) await store.update("hoa_organizations", org.id, orgChanges);

  const { stats, textDiffers } = await applyImportPlan(store, org.id, plan);
  console.log(APPLY ? "\nWritten:" : "\nWould write:");
  for (const [collection, s] of Object.entries(stats)) {
    console.log(`  ${collection.padEnd(32)} create ${String(s.created).padStart(3)} · update ${String(s.updated).padStart(3)} · unchanged ${String(s.unchanged).padStart(3)}`);
  }
  if (textDiffers.length) {
    console.log(`\n${textDiffers.length} provision(s) hold text that differs from the seed. Left alone (text changes only through the audited edit):`);
    console.log(`  ${textDiffers.join(", ")}`);
  }
  if (!APPLY) console.log("\nNothing written. Run with --apply to write.");
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
