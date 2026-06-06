/**
 * Agency / multi-property billing — P1 data model.
 *
 * Creates, idempotently, the platform-level billing layer described in
 * docs/plan-agency-multi-property-billing.md §5:
 *
 *  1. `billing_accounts` — a platform-level entity (like `subscription_plans`)
 *     that owns ONE Stripe customer + ONE subscription and can span many orgs.
 *     Holds the source-of-truth subscription status/trial/free-account flags that
 *     child orgs resolve "up" to (see getEffectiveEntitlement / shared
 *     resolveEntitlement). `seats_purchased` mirrors the Stripe quantity;
 *     `included_properties` is reserved for a later bundled-tier pricing option
 *     (left 0/unused in v1 per the resolved decisions).
 *
 *  2. `billing_account_members` — junction (billing_account × user × role:
 *     owner|billing_admin|viewer) for who can see the agency dashboard / manage
 *     the payment method. Distinct from `hoa_members` (per-property operational
 *     access).
 *
 *  3. `hoa_organizations.billing_account` — nullable m2o (on_delete SET NULL).
 *     When null (every existing org) the org bills itself exactly as today; when
 *     set, entitlement resolves up. Purely additive — no destructive migration,
 *     same approach as inquiry_routing / manager_permissions in PR #280.
 *
 * Permissions: App Admin has admin_access (all perms) so needs nothing here.
 *  - billing_account_members can READ their own billing account + its members.
 *  - HOA Admins can READ the parent billing account's status (read-only) so the
 *    org UI can show "billed by <agency>" without exposing other accounts.
 *
 * P1 ships the model only — no new Stripe flow. Seed accounts as
 * `is_free_account: true` (comped) or set status by hand to onboard an agency.
 * P2 adds the subscribe / seat-sync endpoints + webhook routing.
 *
 * Run with: pnpm run create:billing-accounts
 * Then:     pnpm run generate:types   (refresh types/directus.ts)
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations/permissions are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

// Existing role policies (must match scripts/setup-directus-permissions.ts).
// App Admin has admin_access:true (every permission) so it is intentionally absent.
const HOA_ADMIN_POLICY = "d09e906c-b418-4cd1-a680-fe5fbbc05576";

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

// ============================================================================
// Generic helpers (mirrors create-property-management.ts)
// ============================================================================

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

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
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
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
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

async function addSystemFields(collection: string): Promise<void> {
  await createField(collection, "user_created", {
    type: "uuid",
    meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users" });
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
  await createField(collection, "user_updated", {
    type: "uuid",
    meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_updated", related_collection: "directus_users" });
  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
}

async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  try {
    const existing = await directusFetch(
      `/permissions?filter=${encodeURIComponent(JSON.stringify({ policy: { _eq: policy }, collection: { _eq: collection }, action: { _eq: action } }))}&fields=id&limit=1`
    );
    if (existing?.data?.length) {
      console.log(`      ⏭️  ${collection}.${action} (already exists)`);
      return;
    }
  } catch {
    /* fall through to create */
  }
  try {
    await directusFetch("/permissions", {
      method: "POST",
      body: JSON.stringify({ policy, collection, action, ...config }),
    });
    console.log(`      ✅ ${collection}.${action}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("409") || error.message.includes("unique")) {
      console.log(`      ⏭️  ${collection}.${action} (already exists)`);
    } else {
      console.log(`      ❌ ${collection}.${action}: ${error.message}`);
    }
  }
}

// ============================================================================
// 1. billing_accounts collection
// ============================================================================

const ACCOUNT_STATUS_CHOICES = [
  { text: "Active", value: "active" },
  { text: "Past due", value: "past_due" },
  { text: "Canceled", value: "canceled" },
  { text: "Suspended", value: "suspended" },
];

// Mirrors hoa_organizations.subscription_status — the value child orgs resolve up to.
const SUBSCRIPTION_STATUS_CHOICES = [
  { text: "Active", value: "active" },
  { text: "Trial", value: "trial" },
  { text: "Past due", value: "past_due" },
  { text: "Canceled", value: "canceled" },
  { text: "Expired", value: "expired" },
];

const BILLING_CYCLE_CHOICES = [
  { text: "Monthly", value: "monthly" },
  { text: "Yearly", value: "yearly" },
];

async function createBillingAccountsCollection(): Promise<void> {
  console.log("\n📁 billing_accounts collection...");

  await createCollection("billing_accounts", {
    collection: "billing_accounts",
    icon: "account_balance",
    note: "Agency / multi-property billing: one Stripe customer + one subscription spanning many orgs. Source of truth for entitlement of any org pointing here.",
    display_template: "{{name}}",
  });

  await createField("billing_accounts", "name", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "e.g. \"Acme Property Management\"" },
  });

  await createField("billing_accounts", "status", {
    type: "string",
    schema: { default_value: "active" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: ACCOUNT_STATUS_CHOICES }, note: "Account lifecycle (mirrors Stripe)" },
  });

  // Primary billing contact.
  await createField("billing_accounts", "owner", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user", note: "Primary billing contact" },
  });
  await createRelation({ collection: "billing_accounts", field: "owner", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });

  // ── Subscription / Stripe (the single customer + subscription) ──
  await createField("billing_accounts", "subscription_status", {
    type: "string",
    schema: { default_value: "trial" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: SUBSCRIPTION_STATUS_CHOICES }, note: "SOURCE OF TRUTH for every org pointing at this account (entitlement resolves up)." },
  });
  await createField("billing_accounts", "trial_ends_at", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", note: "One trial per agency; child properties don't carry their own once account-billed." },
  });
  await createField("billing_accounts", "is_free_account", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half", note: "Comped agency — bypasses subscription checks for all child orgs." },
  });

  await createField("billing_accounts", "subscription_plan", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{name}}" }, note: "The agency plan/tier" },
  });
  await createRelation({ collection: "billing_accounts", field: "subscription_plan", related_collection: "subscription_plans", schema: { on_delete: "SET NULL" } });

  await createField("billing_accounts", "billing_cycle", {
    type: "string",
    schema: { default_value: "monthly" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: BILLING_CYCLE_CHOICES } },
  });

  await createField("billing_accounts", "stripe_customer_id", {
    type: "string",
    meta: { interface: "input", width: "half", note: "The single Stripe customer" },
  });
  await createField("billing_accounts", "stripe_subscription_id", {
    type: "string",
    meta: { interface: "input", width: "half", note: "The single Stripe subscription" },
  });

  await createField("billing_accounts", "seats_purchased", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "Denormalized mirror of the live Stripe quantity (= active property count). Not a hard cap." },
  });
  await createField("billing_accounts", "included_properties", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "Reserved: properties bundled before per-seat pricing. Left 0/unused in v1 (flat per-property)." },
  });

  await addSystemFields("billing_accounts");
}

// ============================================================================
// 2. billing_account_members junction
// ============================================================================

const MEMBER_ROLE_CHOICES = [
  { text: "Owner", value: "owner" },
  { text: "Billing admin", value: "billing_admin" },
  { text: "Viewer", value: "viewer" },
];

async function createBillingAccountMembersCollection(): Promise<void> {
  console.log("\n📁 billing_account_members junction...");

  await createCollection("billing_account_members", {
    collection: "billing_account_members",
    icon: "group",
    note: "Who can see the agency dashboard / manage the payment method (owner|billing_admin|viewer). Distinct from hoa_members (per-property operational access).",
    display_template: "{{user.first_name}} {{user.last_name}} ({{role}})",
  });

  await createField("billing_account_members", "billing_account", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({
    collection: "billing_account_members",
    field: "billing_account",
    related_collection: "billing_accounts",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await createField("billing_account_members", "user", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "user" },
  });
  await createRelation({ collection: "billing_account_members", field: "user", related_collection: "directus_users", schema: { on_delete: "CASCADE" } });

  await createField("billing_account_members", "role", {
    type: "string",
    schema: { default_value: "viewer", is_nullable: false },
    meta: { interface: "select-dropdown", display: "labels", required: true, width: "half", options: { choices: MEMBER_ROLE_CHOICES } },
  });

  await addSystemFields("billing_account_members");
}

// ============================================================================
// 3. hoa_organizations.billing_account (nullable m2o, SET NULL)
// ============================================================================

async function addOrgBillingAccountField(): Promise<void> {
  console.log("\n🧩 hoa_organizations.billing_account...");

  await createField("hoa_organizations", "billing_account", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
      note: "Optional agency billing account. When set, the org's own subscription_* fields are advisory and entitlement resolves up to this account. Null = self-billed (default).",
    },
  });
  await createRelation({
    collection: "hoa_organizations",
    field: "billing_account",
    related_collection: "billing_accounts",
    meta: { sort_field: null },
    schema: { on_delete: "SET NULL" },
  });
}

// ============================================================================
// 4. Permissions
// ============================================================================

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Billing account permissions...");

  // A billing-account member sees ONLY the accounts they belong to + that
  // account's members. ($CURRENT_USER.billing_account_members.* — the reverse
  // o2m alias Directus exposes for the junction's `user` field.)
  const ownAccountFilter = { id: { _in: "$CURRENT_USER.billing_account_members.billing_account" } };
  const ownMembershipFilter = { billing_account: { _in: "$CURRENT_USER.billing_account_members.billing_account" } };

  await postPermission(HOA_ADMIN_POLICY, "billing_accounts", "read", {
    permissions: ownAccountFilter,
    validation: null,
    // Read-only status surface — enough to show "billed by <agency>", not the Stripe ids.
    fields: ["id", "name", "status", "subscription_status", "trial_ends_at", "is_free_account", "billing_cycle", "seats_purchased", "included_properties", "subscription_plan"],
  });

  // Members can also enumerate who else is on their account(s).
  await postPermission(HOA_ADMIN_POLICY, "billing_account_members", "read", {
    permissions: ownMembershipFilter,
    validation: null,
    fields: ["id", "billing_account", "user", "role"],
  });

  // Note: write access (manage payment method, add/remove members/properties)
  // arrives with the P2 Stripe endpoints + P3 agency dashboard, gated to
  // owner/billing_admin in elevated server routes — not as broad policy perms.
  console.log("   ℹ️  Write access is deferred to P2/P3 (elevated server routes).");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("🚀 Agency / multi-property billing — P1 data model...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createBillingAccountsCollection();
    await createBillingAccountMembersCollection();
    await addOrgBillingAccountField();
    await setupPermissions();
    console.log("\n✅ Billing accounts setup complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. Onboard an agency by hand: create a billing_accounts row");
    console.log("      (is_free_account:true to comp, or set subscription_status),");
    console.log("      add billing_account_members, and set billing_account on each org.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
