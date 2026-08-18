/**
 * Script to create the contextual-AI chat collections (Phase 3 of the Anthropic
 * AI assistant — see docs/plan-anthropic-ai-assistant-tokens.md and the round
 * plan ~/.claude/plans/foamy-shimmying-mitten.md). Additive and idempotent
 * against prod Directus, mirroring create-ai-wallet-collections.ts:
 *
 *   ai_conversations  — one row per assistant conversation (per org + user).
 *                       Carries the title and the last model used. The messages
 *                       hang off it; deleting a conversation cascades them.
 *   ai_messages       — APPEND-ONLY chat turns (user | assistant) for a
 *                       conversation, with the per-turn model and metered token
 *                       channels (mirrors the ai_transactions token columns).
 *
 * Both are tenant-isolated via the `organization` FK and accessed ONLY through
 * the server (static admin token, like ai_wallets/ai_transactions) — the chat
 * route enforces org access with requireOrgComposeAccess + an org filter, so no
 * per-role Directus permission rows are needed (none are added here).
 *
 * Run with: pnpm run create:ai-chat
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations are skipped.
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

async function addOrgField(collection: string): Promise<void> {
  await createField(collection, "organization", {
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
    collection,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
}

async function addAuditFields(collection: string): Promise<void> {
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true },
  });
  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true },
  });
}

const ROLE_CHOICES = [
  { text: "User", value: "user" },
  { text: "Assistant", value: "assistant" },
];

async function main() {
  console.log("🚀 Creating contextual-AI chat collections...\n");

  // ── ai_conversations ─────────────────────────────────────────────────────
  console.log("💬 ai_conversations");
  await createCollection("ai_conversations", {
    icon: "forum",
    note: "An AI assistant conversation (per org + user). Messages hang off it.",
    display_template: "{{title}}",
    sort_field: "date_updated",
  });
  await addOrgField("ai_conversations");
  await createField("ai_conversations", "user", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", note: "The staff member who owns this conversation." },
  });
  await createRelation({
    collection: "ai_conversations",
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });
  await createField("ai_conversations", "title", {
    type: "string",
    meta: { interface: "input", note: "Short human label (first message or AI-derived)." },
  });
  await createField("ai_conversations", "model", {
    type: "string",
    meta: { interface: "input", note: "Most recent Anthropic model id used in this conversation." },
  });
  await addAuditFields("ai_conversations");

  // ── ai_messages (append-only turns) ──────────────────────────────────────
  console.log("\n🗨️  ai_messages");
  await createCollection("ai_messages", {
    icon: "chat",
    note: "Append-only AI chat turns (user | assistant) with per-turn metered tokens.",
    display_template: "{{role}} — {{content}}",
    sort_field: "date_created",
  });
  await addOrgField("ai_messages");
  await createField("ai_messages", "conversation", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      display: "related-values",
      display_options: { template: "{{title}}" },
    },
  });
  await createRelation({
    collection: "ai_messages",
    field: "conversation",
    related_collection: "ai_conversations",
    meta: { sort_field: null, one_field: "messages" },
    schema: { on_delete: "CASCADE" },
  });
  await createField("ai_messages", "role", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown", required: true, options: { choices: ROLE_CHOICES }, display: "labels" },
  });
  await createField("ai_messages", "content", {
    type: "text",
    meta: { interface: "input-multiline", note: "The message text (assistant body is plain text/markdown)." },
  });
  await createField("ai_messages", "model", {
    type: "string",
    meta: { interface: "input", note: "Anthropic model id used for an assistant turn." },
  });
  await createField("ai_messages", "input_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_messages", "output_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_messages", "cache_read_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_messages", "cache_write_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_messages", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
