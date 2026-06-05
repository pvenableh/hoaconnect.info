/**
 * Phase 8, Track D — link tickets (hoa_requests) to channels and to each other.
 *
 * Adds:
 *   1. hoa_channels.request  — M2O → hoa_requests (on delete SET NULL). A channel
 *      can be the internal discussion thread for a ticket. The reverse lookup
 *      (a ticket's channel) is `hoa_channels` filtered by `request`.
 *   2. hoa_requests.parent_request — self M2O → hoa_requests (on delete SET NULL).
 *      Lets a "spawn task" action link the new task back to its source ticket.
 *
 * Existing channel/request permissions use fields ["*"], so the new fields are
 * covered without permission changes.
 *
 * Idempotent: fields/relations are skipped if they already exist.
 *
 * Run with: pnpm tsx scripts/link-requests-channels.ts
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

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function createM2OField(
  collection: string,
  field: string,
  relatedCollection: string,
  note: string
): Promise<void> {
  if (await fieldExists(collection, field)) {
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
  } else {
    await directusFetch(`/fields/${collection}`, {
      method: "POST",
      body: JSON.stringify({
        field,
        type: "uuid",
        schema: { is_nullable: true },
        meta: {
          interface: "select-dropdown-m2o",
          special: ["m2o"],
          width: "half",
          note,
        },
      }),
    });
    console.log(`   ✅ Created field ${collection}.${field}`);
  }

  try {
    await directusFetch(`/relations`, {
      method: "POST",
      body: JSON.stringify({
        collection,
        field,
        related_collection: relatedCollection,
        schema: { on_delete: "SET NULL" },
        meta: { sort_field: null },
      }),
    });
    console.log(`   ✅ Created relation ${collection}.${field} → ${relatedCollection}`);
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(`   ⏭️  Relation ${collection}.${field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  console.log("🚀 Linking requests ↔ channels (Phase 8, Track D)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    console.log("\n🔗 hoa_channels.request → hoa_requests");
    await createM2OField(
      "hoa_channels",
      "request",
      "hoa_requests",
      "The ticket this channel is the internal discussion thread for."
    );

    console.log("\n🔗 hoa_requests.parent_request → hoa_requests");
    await createM2OField(
      "hoa_requests",
      "parent_request",
      "hoa_requests",
      "Parent ticket this request/task was spawned from."
    );

    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();
