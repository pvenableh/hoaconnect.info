/**
 * Phase 3 (PM advanced) additive schema.
 *
 * Adds the few fields Phase 3 needs on top of the Phase 2 project model:
 *
 *   payment_expenses.project   — M2O → hoa_projects (SET NULL). Lets an expense
 *                                roll up into a project's budget vs actual.
 *   hoa_projects.expenses      — O2M alias (the inverse of the above) so the
 *                                Directus admin shows a project's expenses.
 *   hoa_project_events.approval_token_expires
 *                              — timestamp; the tokenized public approval link
 *                                stops working past this instant.
 *   hoa_project_events.approval_note
 *                              — free text the approver/rejecter leaves when
 *                                acting on a milestone (in-app or via the link).
 *
 * The approval_token / approved_by / approved_at fields and the parent_event
 * (spawn) relation already exist from Phase 2 — nothing to add for those.
 *
 * Run with: pnpm run add:project-phase3
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing fields/relations are skipped. Additive only.
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

async function main(): Promise<void> {
  console.log("🚀 Adding Phase 3 project fields...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  // ── Expense → project budget rollup ─────────────────────────────────────
  console.log("\n💰 payment_expenses.project (budget rollup)...");
  await createField("payment_expenses", "project", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{title}}" },
      note: "Roll this expense up into a project's budget",
    },
  });
  await createRelation({
    collection: "payment_expenses",
    field: "project",
    related_collection: "hoa_projects",
    meta: { one_field: "expenses", sort_field: null },
    schema: { on_delete: "SET NULL" },
  });

  console.log("\n📁 hoa_projects.expenses (inverse alias)...");
  await createField("hoa_projects", "expenses", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}} — {{amount}}" } },
  });

  // ── Milestone approval link hardening ───────────────────────────────────
  console.log("\n🔐 hoa_project_events approval link fields...");
  await createField("hoa_project_events", "approval_token_expires", {
    type: "timestamp",
    meta: { interface: "datetime", hidden: true, note: "Public approval link expiry" },
  });
  await createField("hoa_project_events", "approval_note", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Note left by the approver/rejecter" },
  });

  console.log("\n✅ Phase 3 fields complete!");
  console.log("\n📌 Next: run `pnpm generate:types`.");
}

main().catch((error: any) => {
  console.error("\n❌ Error:", error.message);
  console.error(error);
  process.exit(1);
});
