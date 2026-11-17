/**
 * Residents ask to change the name on file — `name` joins the kinds a change
 * request can be (docs/spec-delegation.md follow-up, 2026-11-17). The name on
 * `hoa_members` is what other members see; an admin approves a change to it.
 *
 * `hoa_member_change_requests.kind` is a plain string whose choices live in the
 * field's interface options, so Directus does not refuse `lease` without this
 * (it does not enforce `choices`). This adds the choice so the Directus admin shows it
 * as a label, and `pnpm generate:types` writes it into the `kind` union, and
 * names `hoa_leases` in `target_collection`'s note.
 *
 * Changes field metadata only: no column, no data, no permission.
 * Idempotent: a choice already there is left alone.
 *
 * Run: pnpm add:change-request-name-kind --dry-run, read it, then without the flag.
 * Then: pnpm generate:types (the kind union already says 'name' by hand).
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
const NAME_CHOICE = { text: "Name", value: "name" };

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
  console.log(`\n🪪 Name changes on change requests${DRY ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${DIRECTUS_URL}\n`);

  console.log(`📋 ${COLLECTION}.kind`);
  const kind = (await dx(`/fields/${COLLECTION}/kind`))?.data;
  if (!kind) throw new Error(`${COLLECTION}.kind not found: run pnpm create:change-requests first`);
  const options = kind.meta?.options ?? {};
  const choices: Array<{ text: string; value: string }> = Array.isArray(options.choices) ? options.choices : [];
  console.log(`   choices now: ${choices.map((c) => c.value).join(", ") || "(none)"}`);
  if (choices.some((c) => c.value === NAME_CHOICE.value)) {
    console.log("   ⏭️  name is already a choice");
  } else {
    await patchMeta("kind", { options: { ...options, choices: [NAME_CHOICE, ...choices] } }, `add the choice ${JSON.stringify(NAME_CHOICE)}`);
  }

  console.log(DRY ? "\nDry run done. Run again without --dry-run to apply." : "\n✅ Done. Then run: pnpm generate:types");
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
