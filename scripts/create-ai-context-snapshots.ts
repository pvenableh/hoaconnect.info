/**
 * Script to create the `ai_context_snapshots` collection — the L2 tier of the
 * AI context broker (see docs/plan-earnest-parity-upgrade.md, Phase 0). One row
 * per org caches the assembled org-context block so grounding is cheap:
 *
 *   L1 in-memory Map (5-min TTL)  →  L2 ai_context_snapshots (30-min TTL)  →
 *   L3 live rebuild via gatherOrgContext().
 *
 * Additive, idempotent, and tenant-isolated via the `organization` FK. Accessed
 * ONLY through the server (static admin token); the broker degrades gracefully
 * to always-live grounding if this collection is absent, so shipping the code
 * before running this script is safe.
 *
 * Run with: pnpm run create:ai-context-snapshots
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations are skipped.
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

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        {
          field: "id",
          type: "uuid",
          meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
          schema: { is_primary_key: true, has_auto_increment: false },
        },
      ],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("🚀 Creating ai_context_snapshots collection...\n");

  console.log("🧠 ai_context_snapshots");
  await createCollection("ai_context_snapshots", {
    icon: "cached",
    note: "Cached org-context block for the AI assistant (L2 of the context broker).",
    display_template: "{{organization}} — {{context_type}}",
    sort_field: "date_updated",
  });

  // Tenant isolation. NOT nullable; one snapshot per org per context_type.
  await createField("ai_context_snapshots", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
    },
  });
  await createRelation({
    collection: "ai_context_snapshots",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await createField("ai_context_snapshots", "context_type", {
    type: "string",
    schema: { is_nullable: false, default_value: "org" },
    meta: {
      interface: "input",
      width: "half",
      note: "Which context this snapshot holds (currently just 'org').",
    },
  });

  await createField("ai_context_snapshots", "content", {
    type: "text",
    meta: {
      interface: "input-multiline",
      note: "The assembled plain-text org-context block placed in the system prompt.",
    },
  });

  await createField("ai_context_snapshots", "token_estimate", {
    type: "integer",
    meta: { interface: "input", note: "Rough token estimate of `content` (~len/4)." },
  });

  await createField("ai_context_snapshots", "expires_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      note: "When this L2 snapshot goes stale and should be rebuilt.",
    },
  });

  await createField("ai_context_snapshots", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true },
  });
  await createField("ai_context_snapshots", "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
