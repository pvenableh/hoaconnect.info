/**
 * Add block_settings.landing — a single JSON blob holding the per-org public
 * landing configuration that the admin edits from Settings → Public site:
 *
 *   {
 *     widgets:  [ { key, enabled } ],        // glass-widget row visibility + order
 *     places:   { neighborhood, walk_score, bike_score, items: [{ name, walk_time, distance }] },
 *     listings: [ { type: 'sale'|'rental', title, url, price, image } ],
 *     inquiry:  { enabled, recipient_type: 'email'|'user', email, user },
 *     geo:      { lat, lon }                  // cached after first geocode
 *   }
 *
 * The org's per-tenant settings already live on block_settings (read as
 * hoa_organizations.settings → BlockSetting). One JSON field keeps the schema
 * flexible — no per-sub-key migrations or type regen as the shape evolves.
 *
 * Idempotent. Run with: pnpm run add:landing-config  →  then pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
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

async function main(): Promise<void> {
  console.log("🚀 Adding block_settings.landing\n");
  try {
    await directusFetch(`/fields/block_settings/landing`);
    console.log("   ⏭️  Field already exists, skipping.");
    return;
  } catch {
    /* doesn't exist — create */
  }

  await directusFetch(`/fields/block_settings`, {
    method: "POST",
    body: JSON.stringify({
      field: "landing",
      type: "json",
      meta: {
        interface: "input-code",
        special: ["cast-json"],
        width: "full",
        note: "Public landing config (widgets, neighborhood/walk-score, listings, inquiry routing, cached geo). Edited via Settings → Public site.",
        options: { language: "json" },
      },
      schema: { is_nullable: true },
    }),
  });
  console.log("   ✅ Created block_settings.landing");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
