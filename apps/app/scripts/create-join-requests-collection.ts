/**
 * Self-service join-request schema — pieces the app already ships code for
 * but that were never created in Directus:
 *
 *  1. hoa_join_requests — a logged-in user's request to join an org
 *     (request-join / approve-join-request / reject-join-request routes,
 *     pending list in UsersPage). Without it every join-request route fails
 *     with FORBIDDEN at runtime.
 *  2. hoa_email_recipients.member — M2O link back to the hoa_member a
 *     recipient row belongs to (written by sendEmailJob, queried by
 *     /api/email/[id]); without it the email detail endpoint fails.
 *
 * All reads/writes go through server routes using the admin token, so no
 * Directus role policies are needed — this script only shapes the data.
 *
 * Idempotent. Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Run: pnpm run create:join-requests
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const COLLECTION = "hoa_join_requests";

async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${options.method || "GET"} ${endpoint}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function collectionExists(name: string): Promise<boolean> {
  try {
    await dx(`/collections/${name}`);
    return true;
  } catch {
    return false;
  }
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await dx(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function createField(collection: string, field: string, cfg: Record<string, any>) {
  if (await fieldExists(collection, field)) {
    console.log(`   ⏭️  ${collection}.${field} exists`);
    return;
  }
  await dx(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...cfg }) });
  console.log(`   ✅ ${collection}.${field}`);
}

async function createRelation(cfg: Record<string, any>) {
  try {
    await dx("/relations", { method: "POST", body: JSON.stringify(cfg) });
    console.log(`   ✅ relation ${cfg.collection}.${cfg.field} → ${cfg.related_collection}`);
  } catch (e: any) {
    if (/already|409/i.test(e.message)) console.log(`   ⏭️  relation ${cfg.collection}.${cfg.field} exists`);
    else throw e;
  }
}

const m2o = (note: string, required = false) => ({
  type: "uuid",
  schema: { is_nullable: !required },
  meta: {
    interface: "select-dropdown-m2o",
    required,
    width: "half",
    display: "related-values",
    note,
  },
});

const dropdown = (choices: { text: string; value: string }[], def: string, note: string) => ({
  type: "string",
  schema: { default_value: def },
  meta: {
    interface: "select-dropdown",
    display: "labels",
    width: "half",
    options: { choices },
    note,
  },
});

async function main() {
  console.log(`\nJoin-request schema\n`);

  // 1. Collection ------------------------------------------------------------
  if (await collectionExists(COLLECTION)) {
    console.log(`⏭️  collection ${COLLECTION} exists`);
  } else {
    await dx("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: COLLECTION,
        meta: {
          icon: "person_add",
          note: "Logged-in users requesting membership in an org, pending admin review.",
          color: "#10B981",
          archive_field: "status",
          archive_value: "rejected",
          unarchive_value: "pending",
          sort_field: null,
          accountability: "all",
          display_template: "{{user}} → {{organization}} ({{status}})",
        },
        schema: { name: COLLECTION },
        fields: [
          {
            field: "id",
            type: "uuid",
            meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
            schema: { is_primary_key: true },
          },
          {
            field: "date_created",
            type: "timestamp",
            meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true, width: "half" },
          },
          {
            field: "date_updated",
            type: "timestamp",
            meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true, width: "half" },
          },
        ],
      }),
    });
    console.log(`✅ collection ${COLLECTION}`);
  }

  // 2. Fields ------------------------------------------------------------
  await createField(COLLECTION, "status", dropdown(
    [
      { text: "Pending", value: "pending" },
      { text: "Approved", value: "approved" },
      { text: "Rejected", value: "rejected" },
    ],
    "pending",
    "Review state of this join request."
  ));
  await createField(COLLECTION, "user", m2o("The user asking to join.", true));
  await createField(COLLECTION, "organization", m2o("The org they want to join.", true));
  await createField(COLLECTION, "unit_number", {
    type: "string",
    schema: { is_nullable: true },
    meta: { interface: "input", width: "half", note: "Unit the applicant says they live in." },
  });
  await createField(COLLECTION, "member_type", dropdown(
    [
      { text: "Owner", value: "owner" },
      { text: "Tenant", value: "tenant" },
    ],
    "owner",
    "Owner or tenant, as claimed by the applicant."
  ));
  await createField(COLLECTION, "message", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", note: "Optional note from the applicant." },
  });
  await createField(COLLECTION, "processed_by", m2o("Admin who approved/rejected."));
  await createField(COLLECTION, "processed_at", {
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", width: "half" },
  });
  await createField(COLLECTION, "rejection_reason", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full" },
  });

  // 3. Relations ------------------------------------------------------------
  await createRelation({
    collection: COLLECTION,
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "CASCADE" },
  });
  await createRelation({
    collection: COLLECTION,
    field: "organization",
    related_collection: "hoa_organizations",
    schema: { on_delete: "CASCADE" },
  });
  await createRelation({
    collection: COLLECTION,
    field: "processed_by",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });

  // 4. hoa_email_recipients.member ------------------------------------------
  console.log(`\nEmail recipient → member link\n`);
  await createField("hoa_email_recipients", "member", m2o("The hoa_member this recipient row belongs to."));
  await createRelation({
    collection: "hoa_email_recipients",
    field: "member",
    related_collection: "hoa_members",
    schema: { on_delete: "SET NULL" },
  });

  console.log("\n📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
