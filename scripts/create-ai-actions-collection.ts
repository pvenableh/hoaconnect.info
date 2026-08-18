/**
 * Creates `ai_actions` — the HITL proposal/approval queue for the AI assistant
 * (docs/plan-earnest-parity-upgrade.md, Phase 4). When the assistant proposes an
 * action (create a task, update a request, send an email…), a row lands here as
 * `pending` and waits for a human to approve/reject — unless the org's trust
 * tier auto-approves it (never for outbound actions). Nothing executes until the
 * Phase-4 proposal/execution wiring is built; this collection is inert on its own.
 *
 * Tenant-isolated via `organization`; accessed only through the server (static
 * admin token), like the other ai_* collections.
 *
 * Run with: pnpm run create:ai-actions
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

async function addUserRelation(collection: string, field: string, note: string): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", note },
  });
  await createRelation({
    collection,
    field,
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });
}

const STATUS_CHOICES = [
  { text: "Pending", value: "pending" },
  { text: "Approved", value: "approved" },
  { text: "Rejected", value: "rejected" },
  { text: "Executed", value: "executed" },
  { text: "Failed", value: "failed" },
];

async function main() {
  console.log("🚀 Creating ai_actions collection...\n");

  console.log("⚡ ai_actions");
  await createCollection("ai_actions", {
    icon: "bolt",
    note: "HITL proposal/approval queue — actions the assistant proposes, pending human approval.",
    display_template: "{{action_type}} — {{status}}",
    archive_field: "status",
    archive_value: "rejected",
    sort_field: "date_created",
  });

  // Tenant isolation.
  await createField("ai_actions", "organization", {
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
    collection: "ai_actions",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await createField("ai_actions", "action_type", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "Catalog key (e.g. create_task, send_email)." },
  });
  await createField("ai_actions", "title", {
    type: "string",
    meta: { interface: "input", note: "Human one-line summary of the proposed action." },
  });
  await createField("ai_actions", "status", {
    type: "string",
    schema: { is_nullable: false, default_value: "pending" },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      options: { choices: STATUS_CHOICES },
      display: "labels",
    },
  });
  await createField("ai_actions", "category", {
    type: "string",
    meta: { interface: "input", width: "half", note: "internal | record_update | scheduling | comms." },
  });
  await createField("ai_actions", "risk", {
    type: "string",
    meta: { interface: "input", width: "half", note: "low | medium | high." },
  });
  await createField("ai_actions", "outbound", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half", note: "Reaches residents/board — always requires approval." },
  });

  await createField("ai_actions", "payload", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "The action's parameters." },
  });
  await createField("ai_actions", "preview", {
    type: "text",
    meta: { interface: "input-multiline", note: "Human-readable preview of what will happen." },
  });
  await createField("ai_actions", "result", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "Execution result (on success)." },
  });
  await createField("ai_actions", "error_message", {
    type: "text",
    meta: { interface: "input-multiline", note: "Failure detail (on failed execution)." },
  });

  // What the action acts on (mirrors the dossier focus).
  await createField("ai_actions", "entity_type", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });
  await createField("ai_actions", "entity_id", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });

  // The conversation that proposed it.
  await createField("ai_actions", "conversation", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({
    collection: "ai_actions",
    field: "conversation",
    related_collection: "ai_conversations",
    schema: { on_delete: "SET NULL" },
  });

  await addUserRelation("ai_actions", "requested_by", "The staff member whose turn proposed this action.");
  await addUserRelation("ai_actions", "approved_by", "Who approved/rejected it.");

  await createField("ai_actions", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });
  await createField("ai_actions", "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
