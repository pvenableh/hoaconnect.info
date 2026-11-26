/**
 * Adds `contract_end` (a calendar day) to hoa_vendors.
 *
 * `active_until` says when the relationship ended; the board home's contract
 * Heatstrip, the coverage reminder and the AI notices want the date the
 * current contract or cover runs out, which is a different thing for a vendor
 * still on the job. Readers prefer `contract_end` and fall back to
 * `active_until`, so a community that never fills the new field sees no change.
 *
 * Run with: pnpm run add:vendor-contract-end
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing field is left as it is. Any hoa_vendors permission
 * that lists its fields explicitly gains `contract_end`; `*` rules need nothing.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const COLLECTION = "hoa_vendors";
const FIELD = "contract_end";

async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${endpoint}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const exists = await dx(`/fields/${COLLECTION}/${FIELD}`).then(() => true, () => false);
  if (exists) {
    console.log(`⏭️  ${COLLECTION}.${FIELD} already exists`);
  } else {
    await dx(`/fields/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify({
        field: FIELD,
        type: "date",
        schema: { is_nullable: true },
        meta: {
          interface: "datetime",
          note: "When the current contract or insurance cover runs out (leave blank if none)",
          width: "half",
        },
      }),
    });
    console.log(`✅ ${COLLECTION}.${FIELD} created`);
  }

  const perms = (await dx(`/permissions?filter[collection][_eq]=${COLLECTION}&limit=-1&fields=id,action,fields`))?.data ?? [];
  for (const p of perms) {
    const fields: string[] | null = p.fields;
    if (!fields || fields.includes("*") || fields.includes(FIELD)) continue;
    if (!fields.includes("active_until")) continue; // only rules that already expose the vendor's dates
    await dx(`/permissions/${p.id}`, { method: "PATCH", body: JSON.stringify({ fields: [...fields, FIELD] }) });
    console.log(`✅ permission ${p.id} (${p.action}) gains ${FIELD}`);
  }
  console.log("Done. Run `pnpm generate:types` next.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
