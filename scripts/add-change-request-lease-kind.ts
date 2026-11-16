/**
 * Owners report leases from My Household — `lease` joins the kinds a change
 * request can be.
 *
 * `hoa_member_change_requests.kind` is a plain string whose choices live in the
 * field's interface options, so Directus does not refuse `lease` without this
 * (it does not enforce `choices`; core/shared/members/residency.ts says the
 * same of another field). This adds the choice so the Directus admin shows it
 * as a label, and `pnpm generate:types` writes it into the `kind` union, and
 * names `hoa_leases` in `target_collection`'s note.
 *
 * Changes field metadata only: no column, no data, no permission.
 * Idempotent: a choice already there is left alone.
 *
 * Run: pnpm add:change-request-lease-kind --dry-run, read it, then without the flag.
 * Then: pnpm generate:types (the kind union already says 'lease' by hand).
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const COLLECTION = "hoa_member_change_requests";
const LEASE_CHOICE = { text: "Lease", value: "lease" };
const TARGET_NOTE = "hoa_members | hoa_vehicles | hoa_pets | hoa_leases";

async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${options.method || "GET"} ${endpoint}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function patchMeta(field: string, meta: Record<string, unknown>, says: string) {
  if (DRY) {
    console.log(`   would ${says}`);
    return;
  }
  await dx(`/fields/${COLLECTION}/${field}`, { method: "PATCH", body: JSON.stringify({ meta }) });
  console.log(`   ✅ ${says}`);
}

async function main() {
  console.log(`\n🏠 Lease reports on change requests${DRY ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${DIRECTUS_URL}\n`);

  console.log(`📋 ${COLLECTION}.kind`);
  const kind = (await dx(`/fields/${COLLECTION}/kind`))?.data;
  if (!kind) throw new Error(`${COLLECTION}.kind not found: run pnpm create:change-requests first`);
  const options = kind.meta?.options ?? {};
  const choices: Array<{ text: string; value: string }> = Array.isArray(options.choices) ? options.choices : [];
  console.log(`   choices now: ${choices.map((c) => c.value).join(", ") || "(none)"}`);
  if (choices.some((c) => c.value === LEASE_CHOICE.value)) {
    console.log("   ⏭️  lease is already a choice");
  } else {
    await patchMeta("kind", { options: { ...options, choices: [...choices, LEASE_CHOICE] } }, `add the choice ${JSON.stringify(LEASE_CHOICE)}`);
  }

  console.log(`\n📋 ${COLLECTION}.target_collection`);
  const target = (await dx(`/fields/${COLLECTION}/target_collection`))?.data;
  const note = target?.meta?.note ?? null;
  console.log(`   note now: ${note ?? "(none)"}`);
  if (note === TARGET_NOTE) console.log("   ⏭️  note already names hoa_leases");
  else await patchMeta("target_collection", { note: TARGET_NOTE }, `set the note to "${TARGET_NOTE}"`);

  console.log(DRY ? "\nDry run done. Run again without --dry-run to apply." : "\n✅ Done. Then run: pnpm generate:types");
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
