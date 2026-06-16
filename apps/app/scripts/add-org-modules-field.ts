/**
 * Script to add a per-org `modules` toggle map to hoa_organizations
 * (Phase 7b, Track B — "manage what they manage").
 *
 * Each org gets a single JSON field, `modules`, holding simple on/off switches
 * for the optional product modules. Disabled modules hide from the dock and
 * their pages refuse access (enforced app-side via useModules() + a `module`
 * route middleware — NOT via Directus permissions; this is org config, not a
 * permission boundary).
 *
 * Shape (all default true):
 *   { pets, vehicles, leases, rules, polls, requests, meetings, feed,
 *     payments, expenses, announcements, moderation, email, directory, board }
 *
 * Additive & non-destructive: the field default seeds all-enabled for new orgs,
 * and the composable treats any MISSING key as enabled — so existing orgs (whose
 * column is null until first save) lose nothing. No permission change is needed:
 * the existing org read perms already expose org fields.
 *
 * Run with: pnpm run add:org-modules
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing modules field is skipped.
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
  let exists = false;
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    exists = true;
  } catch {
    /* create below */
  }

  if (exists) {
    // Keep the field's default_value/meta in sync (e.g. newly-added module keys
    // so new orgs get them). Idempotent.
    await directusFetch(`/fields/${collection}/${field}`, {
      method: "PATCH",
      body: JSON.stringify(fieldConfig),
    });
    console.log(`   ✏️  Updated field: ${collection}.${field} (default synced)`);
    return;
  }

  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...fieldConfig }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

// All optional modules, all enabled by default.
const DEFAULT_MODULES = {
  feed: true,
  announcements: true,
  meetings: true,
  polls: true,
  requests: true,
  moderation: true,
  documents: true,
  rules: true,
  directory: true,
  pets: true,
  vehicles: true,
  leases: true,
  payments: true,
  expenses: true,
  email: true,
  board: true,
  channels: true,
};

async function main(): Promise<void> {
  console.log("🚀 Adding hoa_organizations.modules toggle map...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createField("hoa_organizations", "modules", {
      type: "json",
      schema: { default_value: DEFAULT_MODULES },
      meta: {
        interface: "input-code",
        special: ["cast-json"],
        width: "full",
        note: "Per-org optional module on/off toggles (managed from Settings → Modules). Missing keys are treated as enabled.",
        options: { language: "json" },
      },
    });
    console.log("\n✅ modules field complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
