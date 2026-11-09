/**
 * Script to add `declared_units` to hoa_organizations.
 *
 * A new community has no `hoa_units` rows yet, so at signup the board declares
 * its unit count and the server picks the band from that. `resolveBandForOrg`
 * uses the larger of the real count and this one, so the Settings quote and the
 * charge both follow it. A count declared too high stays in force until someone
 * corrects it here in Directus.
 *
 * Additive & non-destructive: the column is nullable and existing orgs stay null,
 * which means "use the real count". The app reads it with the admin client, so no
 * permission change is needed.
 *
 * Run with: pnpm run add:declared-units
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing field is left as it is.
 *
 * Deploy order: run this on production Directus BEFORE the signup change goes
 * live. Until it has run, setup-organization refuses new signups with a 503.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const COLLECTION = "hoa_organizations";
const FIELD = "declared_units";

function directusFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
}

async function main(): Promise<void> {
  console.log(`🚀 Adding ${COLLECTION}.${FIELD}...\n`);
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  // Directus answers 403 for a field that doesn't exist. Anything else that isn't
  // a 200 (a bad token is a 401) must stop here, not fall through to a create.
  const existing = await directusFetch(`/fields/${COLLECTION}/${FIELD}`);
  if (existing.ok) {
    console.log(`   ⏭️  ${COLLECTION}.${FIELD} already exists — nothing to do.`);
    return;
  }
  if (existing.status !== 403) {
    throw new Error(`Could not check for the field: HTTP ${existing.status}: ${await existing.text()}`);
  }

  const created = await directusFetch(`/fields/${COLLECTION}`, {
    method: "POST",
    body: JSON.stringify({
      field: FIELD,
      type: "integer",
      schema: { is_nullable: true },
      meta: {
        interface: "input",
        width: "half",
        note: "Unit count the board declared at signup. The subscription band uses the larger of this and the real unit count. Edit here to correct it.",
        options: { min: 0 },
      },
    }),
  });
  if (!created.ok) throw new Error(`HTTP ${created.status}: ${await created.text()}`);

  console.log(`   ✅ Created field: ${COLLECTION}.${FIELD}`);
  console.log("\n📌 Next: run `pnpm generate:types`.");
}

main().catch((error: any) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
