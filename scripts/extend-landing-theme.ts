/**
 * Extend block_settings.theme to the full style set (classic | modern | luxury).
 *
 * The org's per-tenant landing style is stored on block_settings.theme
 * (hoa_organizations.settings → BlockSetting). The field's select choices only
 * listed classic/modern; the app already writes/saves luxury and the landing
 * now applies it (app/pages/[slug]/index.vue), but this brings the Directus
 * admin dropdown — and the generated types — in line.
 *
 * Run with: pnpm run extend:landing-theme  →  then pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: re-running just re-sets the same choices.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
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
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const THEME_CHOICES = [
  { text: "Classic", value: "classic" },
  { text: "Modern", value: "modern" },
  { text: "Luxury", value: "luxury" },
];

async function main(): Promise<void> {
  console.log("🎨 Extending block_settings.theme choices to classic | modern | luxury...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await directusFetch(`/fields/block_settings/theme`, {
      method: "PATCH",
      body: JSON.stringify({
        meta: {
          interface: "select-dropdown",
          display: "labels",
          options: { choices: THEME_CHOICES },
        },
      }),
    });
    console.log("   ✅ Updated block_settings.theme choices");
    console.log("\n📌 Next: run `pnpm generate:types` to widen the BlockSetting.theme type.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
