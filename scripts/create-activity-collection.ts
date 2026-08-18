/**
 * Create hoa_activity — an append-only portal activity log (Phase 1: page
 * views, downloads, auth). Admin/PM-grant see all of their org's activity;
 * members see their own. Tenant-scoped via `organization` (the write route
 * derives org + member from the session, never the client).
 *
 *   organization  — M2O hoa_organizations (required, tenant key)
 *   member        — M2O hoa_members (who; nullable)
 *   user          — M2O directus_users (the auth identity; nullable)
 *   event_type    — page_view | download | doc_view | login | logout |
 *                   session_start | payment | request | profile_update |
 *                   upload | search
 *   path          — route path for page views
 *   target_collection / target_id — polymorphic subject (e.g. hoa_documents/<id>)
 *   label         — human-friendly label for timelines (e.g. document title)
 *   metadata      — json (referrer, duration, file size, query…)
 *   session_id    — groups a visit
 *   ip / user_agent — request context (set server-side)
 *
 * Run with: pnpm run create:activity
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
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

async function createCollection(collection: string, meta: Record<string, any>) {
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

async function createField(collection: string, field: string, fieldConfig: Record<string, any>) {
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

async function createRelation(relationConfig: Record<string, any>) {
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

const EVENT_TYPE_CHOICES = [
  { text: "Page view", value: "page_view" },
  { text: "Download", value: "download", color: "var(--theme--primary)" },
  { text: "Document view", value: "doc_view" },
  { text: "Session start", value: "session_start", color: "var(--theme--success)" },
  { text: "Login", value: "login", color: "var(--theme--success)" },
  { text: "Logout", value: "logout" },
  { text: "Payment", value: "payment", color: "var(--theme--success)" },
  { text: "Request", value: "request" },
  { text: "Profile update", value: "profile_update" },
  { text: "Upload", value: "upload" },
  { text: "Search", value: "search" },
];

async function main() {
  console.log("📊 Creating hoa_activity...\n");

  await createCollection("hoa_activity", {
    icon: "timeline",
    note: "Append-only portal activity log (page views, downloads, auth). Org-scoped; admins/PM-grant see all, members see their own.",
    display_template: "{{event_type}} — {{label}}",
    sort_field: "date_created",
  });

  await createField("hoa_activity", "organization", {
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
    collection: "hoa_activity",
    field: "organization",
    related_collection: "hoa_organizations",
    schema: { on_delete: "CASCADE" },
  });

  await createField("hoa_activity", "member", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "related-values", width: "half", note: "The acting member." },
  });
  await createRelation({
    collection: "hoa_activity",
    field: "member",
    related_collection: "hoa_members",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_activity", "user", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", width: "half", note: "The auth identity." },
  });
  await createRelation({
    collection: "hoa_activity",
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_activity", "event_type", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown",
      required: true,
      options: { choices: EVENT_TYPE_CHOICES, allowOther: true },
      display: "labels",
      width: "half",
    },
  });
  await createField("hoa_activity", "path", { type: "string", meta: { interface: "input" } });
  await createField("hoa_activity", "target_collection", { type: "string", meta: { interface: "input", width: "half" } });
  await createField("hoa_activity", "target_id", { type: "string", meta: { interface: "input", width: "half" } });
  await createField("hoa_activity", "label", { type: "string", meta: { interface: "input" } });
  await createField("hoa_activity", "metadata", { type: "json", meta: { interface: "input-code", options: { language: "json" } } });
  await createField("hoa_activity", "session_id", { type: "string", meta: { interface: "input", width: "half" } });
  await createField("hoa_activity", "ip", { type: "string", meta: { interface: "input", width: "half" } });
  await createField("hoa_activity", "user_agent", { type: "text", meta: { interface: "input-multiline" } });
  await createField("hoa_activity", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, width: "half" },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
