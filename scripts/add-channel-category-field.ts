/**
 * Parity Round 2, Phase 3 — roster folders.
 *
 * Adds `hoa_channels.category`: a free-text folder name that groups channels in
 * the roster sidebar. Null (the default for every existing row) means "no
 * folder" — those channels render exactly as they do today, at the top of their
 * section, which is why this ships without a migration.
 *
 * A string rather than a relation on purpose. A folder here is a label someone
 * types while organising their own sidebar ("Budget 2027", "Vendors — roofing");
 * making it a collection would mean a second admin surface to manage rows nobody
 * else references, and renaming a folder would stop being a rename.
 *
 * The roster ALSO groups by the entity a channel already points at (request /
 * project / vendor) — that needs no schema, those FKs exist. `category` wins
 * when both are present, so any channel can be filed anywhere.
 *
 * Existing channel permissions use fields ["*"], so `category` needs no new
 * perms.
 *
 * Idempotent: the field is created only when absent.
 *
 * Run with: pnpm add:channel-category
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then run
 * `pnpm generate:types`.
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
  if (response.status === 204) return null;
  return response.json();
}

async function ensureCategory(): Promise<void> {
  console.log("\n🗂  hoa_channels.category");
  let exists = false;
  try {
    await directusFetch("/fields/hoa_channels/category");
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    console.log("   ⏭️  category already exists, skipping");
    return;
  }
  await directusFetch("/fields/hoa_channels", {
    method: "POST",
    body: JSON.stringify({
      field: "category",
      type: "string",
      schema: { is_nullable: true, default_value: null },
      meta: {
        interface: "input",
        width: "half",
        options: { placeholder: "e.g. Budget 2027" },
        note: "Optional folder name. Channels sharing a category group together in the roster sidebar; empty means ungrouped.",
      },
    }),
  });
  console.log("   ✅ Created category");
}

async function main(): Promise<void> {
  console.log("🚀 Channel roster folders (Parity Round 2, Phase 3)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureCategory();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();
