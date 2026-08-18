/**
 * Add hoa_organizations.external_url — the URL of an org's externally-hosted
 * marketing site (e.g. a bespoke Nuxt site like 1033lenox.com). When set, the
 * built-in HOA Connect landing is disabled and HOA Connect acts as the resident
 * portal only.
 *
 * Idempotent. Run with: pnpm run add:external-url
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
  console.log("🚀 Adding hoa_organizations.external_url\n");
  try {
    await directusFetch(`/fields/hoa_organizations/external_url`);
    console.log("   ⏭️  Field already exists, skipping.");
    return;
  } catch {
    /* doesn't exist — create */
  }

  await directusFetch(`/fields/hoa_organizations`, {
    method: "POST",
    body: JSON.stringify({
      field: "external_url",
      type: "string",
      meta: {
        interface: "input",
        width: "full",
        note: "External marketing site URL (e.g. https://yourbuilding.com). When set, the built-in landing is disabled and HOA Connect serves the resident portal only.",
        options: { placeholder: "https://yourbuilding.com" },
      },
      schema: { is_nullable: true },
    }),
  });
  console.log("   ✅ Created hoa_organizations.external_url");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
