/**
 * Add hoa_organizations.landing_stats — a small JSON counter for basic public
 * landing insights ({ views, inquiries }). Kept on the org (NOT inside
 * block_settings.landing) so the view beacon's read-modify-write never clobbers
 * the admin-edited landing config.
 *
 * Idempotent. Run with: pnpm run add:landing-stats  →  then pnpm generate:types
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
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
  console.log("🚀 Adding hoa_organizations.landing_stats\n");
  try {
    await df(`/fields/hoa_organizations/landing_stats`);
    console.log("   ⏭️  Field already exists, skipping.");
    return;
  } catch {
    /* create */
  }
  await df(`/fields/hoa_organizations`, {
    method: "POST",
    body: JSON.stringify({
      field: "landing_stats",
      type: "json",
      meta: {
        interface: "input-code",
        special: ["cast-json"],
        width: "full",
        note: "Public landing insights counter ({ views, inquiries }). Maintained by the app.",
        options: { language: "json" },
      },
      schema: { is_nullable: true },
    }),
  });
  console.log("   ✅ Created hoa_organizations.landing_stats");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
