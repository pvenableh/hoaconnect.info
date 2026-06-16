/**
 * Script to create payment_expenses — money OUT (vendor bills, maintenance,
 * utilities, etc.) tracked per org (Phase 7b, Track A).
 *
 * Mirrors the payment_* family (payment_requests / _transactions / _schedules):
 * org-scoped, admin-managed. Each row is one expense with an optional receipt
 * file. This is intentionally simple bookkeeping — NOT a general ledger.
 *
 * Fields: status (draft|approved|paid), title*, category, vendor, amount*,
 * expense_date, paid_date, description, receipt (M2O directus_files), notes,
 * organization* (M2O, CASCADE), + system fields.
 *
 * Permissions (Phase 5/6 pattern, in this script): HOA Admin manages all rows in
 * their org; HOA Member gets NO access. Board-treasurer read, if ever wanted, is
 * enforced via an elevated server route (the admin-or-board pattern), not a row
 * policy — so it's deliberately omitted here.
 *
 * Run with: pnpm run create:expenses
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations/permissions are skipped.
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

const STATUS_CHOICES = [
  { text: "Draft", value: "draft", color: "var(--theme--foreground-subdued)" },
  { text: "Approved", value: "approved", color: "var(--theme--primary)" },
  { text: "Paid", value: "paid", color: "var(--theme--success)" },
];
const CATEGORY_CHOICES = [
  { text: "Maintenance", value: "maintenance" },
  { text: "Utilities", value: "utilities" },
  { text: "Insurance", value: "insurance" },
  { text: "Landscaping", value: "landscaping" },
  { text: "Admin", value: "admin" },
  { text: "Other", value: "other" },
];

async function createExpensesCollection(): Promise<void> {
  console.log("\n📁 Creating payment_expenses collection...");
  await createCollection("payment_expenses", {
    collection: "payment_expenses",
    icon: "receipt_long",
    note: "HOA expenses (money out) — vendor bills, maintenance, utilities",
    display_template: "{{title}} — {{amount}}",
    sort_field: "sort",
  });

  await createField("payment_expenses", "status", {
    type: "string",
    schema: { default_value: "draft" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: STATUS_CHOICES } },
  });
  await createField("payment_expenses", "category", {
    type: "string",
    schema: { default_value: "other" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: CATEGORY_CHOICES } },
  });
  await createField("payment_expenses", "title", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "full" } });
  await createField("payment_expenses", "vendor", { type: "string", meta: { interface: "input", width: "half", note: "Who was paid" } });
  await createField("payment_expenses", "amount", {
    type: "decimal",
    schema: { is_nullable: false, numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: "input", required: true, width: "half", note: "USD (decimal)" },
  });
  await createField("payment_expenses", "expense_date", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("payment_expenses", "paid_date", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("payment_expenses", "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });
  await createField("payment_expenses", "notes", { type: "text", meta: { interface: "input-multiline", width: "full", note: "Internal notes" } });

  // Receipt / invoice file.
  await createField("payment_expenses", "receipt", {
    type: "uuid",
    meta: { interface: "file", display: "file", width: "half", note: "Receipt or invoice" },
  });
  await createRelation({ collection: "payment_expenses", field: "receipt", related_collection: "directus_files", schema: { on_delete: "SET NULL" } });

  // Tenancy.
  await createField("payment_expenses", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "payment_expenses", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  // System fields.
  await createField("payment_expenses", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("payment_expenses", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("payment_expenses", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "payment_expenses", field: "user_created", related_collection: "directus_users" });
  await createField("payment_expenses", "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField("payment_expenses", "user_updated", { type: "uuid", meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "payment_expenses", field: "user_updated", related_collection: "directus_users" });
}

// ── Permissions ──────────────────────────────────────────────────────────────
interface Role { id: string; name: string; }
interface Policy { id: string; name: string; }
async function getRoles(): Promise<Role[]> {
  const response = await directusFetch(`/roles?filter=${JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })}&fields=id,name`);
  return response.data as Role[];
}
async function getRolePolicy(roleId: string, roleName: string): Promise<Policy | null> {
  try {
    const response = await directusFetch(`/access?filter=${JSON.stringify({ role: { _eq: roleId } })}&fields=id,policy&limit=1`);
    if (response.data?.length) {
      const policyId = typeof response.data[0].policy === "string" ? response.data[0].policy : response.data[0].policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
  }
}
async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  try {
    await directusFetch("/permissions", { method: "POST", body: JSON.stringify({ policy, collection, action, ...config }) });
    console.log(`      ✅ ${action}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("409") || error.message.includes("unique")) {
      console.log(`      ⏭️  ${action} (already exists)`);
    } else {
      console.log(`      ❌ ${action}: ${error.message}`);
    }
  }
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Setting up permissions...");
  const roles = await getRoles();
  if (!roles.length) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions setup.");
    return;
  }
  const adminRole = roles.find((r) => r.name === "HOA Admin");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;

  const orgFilter = { organization: { _eq: "$CURRENT_USER.organization" } };

  if (adminPolicy) {
    console.log("\n   📋 payment_expenses for HOA Admin (full org access)...");
    for (const action of ["create", "read", "update", "delete"]) {
      await postPermission(adminPolicy.id, "payment_expenses", action, {
        permissions: orgFilter,
        validation: action === "create" || action === "update" ? orgFilter : null,
        fields: ["*"],
      });
    }
  }
  // HOA Member: no permissions created → no access (expenses are admin/treasurer-only).
  console.log("\n   📋 HOA Member: no access (intentional — money-out is admin-only).");
}

async function main(): Promise<void> {
  console.log("🚀 Creating payment_expenses + permissions...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createExpensesCollection();
    await setupPermissions();
    console.log("\n✅ Expenses collection + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
