/**
 * Schema for the billing engine (Phase 1, PayHOA parity): schedules that
 * generate their own charges, a late-fee policy the org can actually apply,
 * saved payment methods for autopay, and the fields on payment_requests that
 * tie a charge back to the schedule/period that produced it.
 *
 * Additive only — every field below is nullable/optional so existing
 * payment_schedules / payment_requests / hoa_organizations rows stay valid.
 * The engine (core/shared/billing/engine.ts, Session 1B) and the worker
 * (scripts/billing-worker.ts, Session 1C) are pure consumers of this schema;
 * nothing here writes a row.
 *
 * Run with: pnpm create:billing-engine
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations are skipped.
 *
 * Permissions for payment_methods are NOT set here — they're added to the
 * central scripts/setup-directus-permissions.ts (run that separately, as
 * always, after this script).
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
      fields: [{ field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } }],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...fieldConfig }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("already has an associated relationship") || error.message.includes("409")) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

// ── payment_schedules: cadence that can actually generate charges ──────────
const CADENCE_CHOICES = [
  { text: "Monthly", value: "monthly" },
  { text: "Quarterly", value: "quarterly" },
  { text: "Semiannual", value: "semiannual" },
  { text: "Annual", value: "annual" },
];
const AMOUNT_SOURCE_CHOICES = [
  { text: "Fixed amount", value: "fixed" },
  { text: "Per-unit rate", value: "per_unit_rate" },
  { text: "Ownership %", value: "ownership_pct" },
];

async function extendPaymentSchedules(): Promise<void> {
  console.log("\n📁 Extending payment_schedules...");

  await createField("payment_schedules", "cadence", {
    type: "string",
    meta: { interface: "select-dropdown", width: "half", options: { choices: CADENCE_CHOICES }, note: "Generation cadence. Existing `frequency` stays for display; the worker reads this." },
  });
  await createField("payment_schedules", "amount_source", {
    type: "string",
    schema: { default_value: "fixed" },
    meta: { interface: "select-dropdown", width: "half", options: { choices: AMOUNT_SOURCE_CHOICES } },
  });
  await createField("payment_schedules", "audience", {
    type: "json",
    meta: { interface: "input-code", width: "full", options: { language: "json" }, note: '{ "all": true } or { "units": [unit ids] }' },
  });
  await createField("payment_schedules", "generate_days_ahead", {
    type: "integer",
    schema: { default_value: 14 },
    meta: { interface: "input", width: "half", note: "How many days before due_date a charge is generated." },
  });
  await createField("payment_schedules", "last_generated_period", {
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, note: "YYYY-MM of the last period this schedule generated. Written by the worker; idempotency key." },
  });
}

// ── hoa_organizations: a late-fee policy that can be applied ───────────────
const LATE_FEE_KIND_CHOICES = [
  { text: "Flat amount", value: "flat" },
  { text: "Percent of balance", value: "percent" },
];
const LATE_FEE_REPEAT_CHOICES = [
  { text: "Once per charge", value: "once" },
  { text: "Monthly until paid", value: "monthly" },
];

async function extendOrganizations(): Promise<void> {
  console.log("\n📁 Extending hoa_organizations (late-fee policy)...");

  await createField("hoa_organizations", "late_fee_kind", {
    type: "string",
    schema: { default_value: "flat" },
    meta: { interface: "select-dropdown", width: "half", options: { choices: LATE_FEE_KIND_CHOICES }, note: "Interpretation of the existing late_fee_amount." },
  });
  await createField("hoa_organizations", "late_fee_repeat", {
    type: "string",
    schema: { default_value: "once" },
    meta: { interface: "select-dropdown", width: "half", options: { choices: LATE_FEE_REPEAT_CHOICES } },
  });
  await createField("hoa_organizations", "late_fee_cap", {
    type: "decimal",
    schema: { numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: "input", width: "half", options: { iconLeft: "attach_money" }, note: "Max total late fees on one charge. Empty = uncapped." },
  });
}

// ── payment_requests: trace a charge back to what produced it ──────────────
const SOURCE_CHOICES = [
  { text: "Schedule", value: "schedule" },
  { text: "Manual", value: "manual" },
  { text: "Late fee", value: "late_fee" },
  { text: "Plan", value: "plan" },
];

async function extendPaymentRequests(): Promise<void> {
  console.log("\n📁 Extending payment_requests...");

  await createField("payment_requests", "unit", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{unit_number}}" } },
  });
  await createRelation({ collection: "payment_requests", field: "unit", related_collection: "hoa_units", schema: { on_delete: "SET NULL" } });

  await createField("payment_requests", "period_start", { type: "date", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("payment_requests", "period_end", { type: "date", meta: { interface: "datetime", display: "datetime", width: "half" } });

  await createField("payment_requests", "source", {
    type: "string",
    meta: { interface: "select-dropdown", width: "half", options: { choices: SOURCE_CHOICES }, note: "Manual = created by a board member directly, not by this engine." },
  });
  // Polymorphic (schedule / late-fee-parent-charge / plan id) — deliberately no
  // FK relation, same reasoning as org_audit_log's entity_id.
  await createField("payment_requests", "source_id", {
    type: "uuid",
    meta: { interface: "input", width: "half", readonly: true, note: "id of the schedule/charge/plan named by `source`. No FK: the target collection varies." },
  });
}

// ── payment_methods: saved Stripe payment methods, connected-account side ──
const PAYMENT_METHOD_TYPE_CHOICES = [
  { text: "Card", value: "card" },
  { text: "US bank account", value: "us_bank_account" },
];
const PAYMENT_METHOD_STATUS_CHOICES = [
  { text: "Active", value: "active", color: "var(--theme--success)" },
  { text: "Disabled", value: "disabled", color: "var(--theme--foreground-subdued)" },
];

async function createPaymentMethodsCollection(): Promise<void> {
  console.log("\n📁 Creating payment_methods collection...");
  await createCollection("payment_methods", {
    collection: "payment_methods",
    icon: "credit_card",
    note: "Saved Stripe payment methods on the org's connected account, per member",
    display_template: "{{brand}} •••• {{last4}}",
    sort_field: "sort",
  });

  await createField("payment_methods", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "payment_methods", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("payment_methods", "member", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: "payment_methods", field: "member", related_collection: "hoa_members", schema: { on_delete: "CASCADE" } });

  await createField("payment_methods", "stripe_customer_id", {
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, note: "Customer id on the org's CONNECTED account, not the platform account." },
  });
  await createField("payment_methods", "stripe_payment_method_id", {
    type: "string",
    meta: { interface: "input", width: "half", readonly: true },
  });
  await createField("payment_methods", "type", {
    type: "string",
    meta: { interface: "select-dropdown", width: "half", options: { choices: PAYMENT_METHOD_TYPE_CHOICES } },
  });
  await createField("payment_methods", "last4", { type: "string", meta: { interface: "input", width: "half", readonly: true } });
  await createField("payment_methods", "brand", { type: "string", meta: { interface: "input", width: "half", readonly: true, note: "Card brand, or bank name for ACH." } });

  await createField("payment_methods", "is_autopay", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half" },
  });
  await createField("payment_methods", "autopay_day", {
    type: "integer",
    meta: { interface: "input", width: "half", note: "Day of month, 1–28, autopay charges this method." },
  });
  await createField("payment_methods", "status", {
    type: "string",
    schema: { default_value: "active" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: PAYMENT_METHOD_STATUS_CHOICES } },
  });

  // System fields.
  await createField("payment_methods", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("payment_methods", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("payment_methods", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "payment_methods", field: "user_created", related_collection: "directus_users" });
  await createField("payment_methods", "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField("payment_methods", "user_updated", { type: "uuid", meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "payment_methods", field: "user_updated", related_collection: "directus_users" });
}

async function main(): Promise<void> {
  console.log("🚀 Creating billing-engine schema...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await extendPaymentSchedules();
    await extendOrganizations();
    await extendPaymentRequests();
    await createPaymentMethodsCollection();
    console.log("\n✅ Billing-engine schema complete!");
    console.log("\n📌 Next: run `pnpm setup:permissions` (payment_methods is now in the");
    console.log("   central config), then `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
