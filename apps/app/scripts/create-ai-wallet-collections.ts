/**
 * Script to create the AI-credit economy collections (Phase 1 of the Anthropic
 * AI assistant + token economy — see docs/plan-anthropic-ai-assistant-tokens.md
 * §4.5). Additive and idempotent against prod Directus:
 *
 *   ai_wallets        — per-ORG credit wallet (one row per organization).
 *                       balance_credits is a DERIVED/cached convenience mirror;
 *                       the ai_transactions ledger is the source of truth.
 *                       Tracks the resetting allowance pool + permanent purchased
 *                       pool, the period reset date, and auto-refill settings.
 *   ai_transactions   — APPEND-ONLY ledger: debit | purchase | grant | refund,
 *                       with the metered token channels, model, feature, the
 *                       acting user, and the Stripe id for purchases (idempotency
 *                       key). Never updated or deleted.
 *
 * Also adds `included_credits` to subscription_plans (the monthly allowance per
 * plan tier — plan §3.2).
 *
 * Run with: pnpm run create:ai-wallets
 * Then:     pnpm generate:types
 * Then:     pnpm setup:permissions --only="HOA Admin" (org-scoped wallet access)
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations are skipped.
 *
 * NOTE: not yet run against prod (awaiting confirmation) — the metering route,
 * composer "Draft with AI", and Stripe top-ups depend on this + generate:types.
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

const TX_TYPE_CHOICES = [
  { text: "Debit (AI usage)", value: "debit", color: "var(--theme--warning)" },
  { text: "Purchase (Stripe)", value: "purchase", color: "var(--theme--success)" },
  { text: "Grant (allowance/promo)", value: "grant", color: "var(--theme--primary)" },
  { text: "Refund", value: "refund", color: "var(--theme--foreground-subdued)" },
];

const TX_FEATURE_CHOICES = [
  { text: "Draft", value: "draft" },
  { text: "Rewrite", value: "rewrite" },
  { text: "Summarize", value: "summarize" },
  { text: "Q&A", value: "ask" },
  { text: "Chat", value: "chat" },
  { text: "Embed", value: "embed" },
];

async function main() {
  console.log("🚀 Creating AI-credit economy collections...\n");

  // ── ai_wallets ─────────────────────────────────────────────────────────────
  console.log("💳 ai_wallets");
  await createCollection("ai_wallets", {
    icon: "account_balance_wallet",
    note: "Per-org AI-credit wallet. balance_credits is a cached mirror; ai_transactions is truth.",
    display_template: "{{organization.name}} — {{balance_credits}} credits",
  });
  await addOrgField("ai_wallets");
  await createField("ai_wallets", "balance_credits", {
    type: "integer",
    schema: { default_value: 0, is_nullable: false },
    meta: { interface: "input", note: "Cached total balance (allowance + purchased)." },
  });
  await createField("ai_wallets", "allowance_credits", {
    type: "integer",
    schema: { default_value: 0, is_nullable: false },
    meta: { interface: "input", note: "Plan-funded credits remaining this period (resets)." },
  });
  await createField("ai_wallets", "purchased_credits", {
    type: "integer",
    schema: { default_value: 0, is_nullable: false },
    meta: { interface: "input", note: "Purchased credits remaining (never expire)." },
  });
  await createField("ai_wallets", "included_credits", {
    type: "integer",
    schema: { default_value: 0, is_nullable: false },
    meta: { interface: "input", note: "This plan's monthly allowance grant." },
  });
  await createField("ai_wallets", "period_resets_at", {
    type: "timestamp",
    meta: { interface: "datetime", note: "When the allowance pool next resets." },
  });
  await createField("ai_wallets", "auto_refill_enabled", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean" },
  });
  await createField("ai_wallets", "auto_refill_threshold", {
    type: "integer",
    meta: { interface: "input", note: "Balance below which auto-refill triggers." },
  });
  await createField("ai_wallets", "auto_refill_pack", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      options: { choices: [{ text: "Small", value: "small" }, { text: "Medium", value: "medium" }, { text: "Large", value: "large" }] },
    },
  });
  await addAuditFields("ai_wallets");

  // ── ai_transactions (append-only ledger) ────────────────────────────────────
  console.log("\n🧾 ai_transactions");
  await createCollection("ai_transactions", {
    icon: "receipt_long",
    note: "Append-only AI-credit ledger (debit/purchase/grant/refund). Never update or delete.",
    display_template: "{{type}} {{credits}} — {{feature}}",
    sort_field: "date_created",
  });
  await addOrgField("ai_transactions");
  await createField("ai_transactions", "type", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown", required: true, options: { choices: TX_TYPE_CHOICES }, display: "labels" },
  });
  await createField("ai_transactions", "credits", {
    type: "integer",
    schema: { is_nullable: false, default_value: 0 },
    meta: { interface: "input", required: true, note: "Positive magnitude of credits." },
  });
  await createField("ai_transactions", "feature", {
    type: "string",
    meta: { interface: "select-dropdown", options: { choices: TX_FEATURE_CHOICES } },
  });
  await createField("ai_transactions", "model", {
    type: "string",
    meta: { interface: "input", note: "Anthropic model id used (for debits)." },
  });
  await createField("ai_transactions", "input_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_transactions", "output_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_transactions", "cache_read_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_transactions", "cache_write_tokens", { type: "integer", meta: { interface: "input" } });
  await createField("ai_transactions", "stripe_id", {
    type: "string",
    meta: { interface: "input", note: "Stripe payment_intent id — idempotency key for purchases." },
  });
  await createField("ai_transactions", "user", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", note: "Acting user (for debits)." },
  });
  await createRelation({
    collection: "ai_transactions",
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });
  await createField("ai_transactions", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });

  // ── subscription_plans.included_credits ─────────────────────────────────────
  console.log("\n📦 subscription_plans.included_credits");
  if (await collectionExists("subscription_plans")) {
    await createField("subscription_plans", "included_credits", {
      type: "integer",
      schema: { default_value: 0, is_nullable: false },
      meta: { interface: "input", note: "Monthly AI-credit allowance for this plan tier." },
    });
  } else {
    console.log("   ⚠️  subscription_plans not found — skipping included_credits.");
  }

  console.log("\n✅ Done. Next: pnpm generate:types, then setup:permissions.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
