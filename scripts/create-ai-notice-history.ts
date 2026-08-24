/**
 * Create `ai_notice_history` — the memory that stops the notices cron becoming
 * a nag.
 *
 * The generators are deterministic, which is their virtue and, without this
 * collection, their problem: a request that has been open 31 days is still open
 * 32 days later, so an unguarded cron would raise the same notice every single
 * night until someone acted. Nothing trains a person to ignore notifications
 * faster.
 *
 * So each escalation writes one row keyed by a hash of
 * `noticeType : entityType : entityId : YYYY-MM`, and the cron refuses to fire
 * anything whose hash is already present. One notification per notice, per
 * entity, per **calendar month** — the month boundary, rather than a rolling
 * 30 days, so a board that reviews things monthly sees each open item once per
 * review cycle at a predictable time.
 *
 * The cron degrades safely: if this collection does not exist yet it warns,
 * skips dedup, and still sends — shipping the code before running this script
 * is therefore safe, it is just noisier until you do.
 *
 * Run with: pnpm run create:ai-notice-history
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
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
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
    const m = String(error.message);
    if (
      m.includes("already exists") ||
      m.includes("already has an associated relationship") ||
      m.includes("409")
    ) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("🚀 Creating ai_notice_history collection...\n");

  console.log("🔔 ai_notice_history");
  await createCollection("ai_notice_history", {
    icon: "notifications_paused",
    note: "One row per notice already escalated this calendar month — the notices cron's dedup ledger.",
    display_template: "{{notice_type}} — {{period}}",
    sort_field: "date_created",
  });

  // Tenant isolation. A hash is only unique WITHIN a community.
  await createField("ai_notice_history", "organization", {
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
    collection: "ai_notice_history",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  // The dedup key itself. Indexed, because every cron run queries on it.
  await createField("ai_notice_history", "notice_hash", {
    type: "string",
    schema: { is_nullable: false, is_indexed: true },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      readonly: true,
      note: "sha256 of noticeType:entityType:entityId:YYYY-MM — the once-a-month key.",
    },
  });

  // Everything below is for a human reading the table; the cron only needs the
  // hash. Kept because "why did I get this?" is the first question anyone asks
  // about an automated notification, and a bare hash cannot answer it.
  await createField("ai_notice_history", "notice_type", {
    type: "string",
    meta: { interface: "input", width: "half", note: "e.g. request-aged, invoice-overdue." },
  });
  await createField("ai_notice_history", "entity_type", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });
  await createField("ai_notice_history", "entity_id", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });
  await createField("ai_notice_history", "priority", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      options: {
        choices: [
          { text: "Urgent", value: "urgent" },
          { text: "High", value: "high" },
          { text: "Medium", value: "medium" },
          { text: "Low", value: "low" },
        ],
      },
    },
  });
  await createField("ai_notice_history", "period", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Calendar month, YYYY-MM." },
  });
  await createField("ai_notice_history", "title", {
    type: "string",
    meta: { interface: "input", note: "The notice's headline, as sent." },
  });
  await createField("ai_notice_history", "recipients", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "How many people the bell row reached." },
  });

  await createField("ai_notice_history", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
