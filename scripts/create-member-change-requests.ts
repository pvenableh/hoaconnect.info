/**
 * Member self-service review workflow schema.
 *
 *  1. hoa_member_change_requests — a resident's proposed change to their own
 *     household data (contact info, mailing address, a vehicle, or a pet).
 *     Live records are never mutated until an Admin / Property Manager approves;
 *     on approval the server applies `payload` to `target_collection`.
 *  2. hoa_members.mailing_address (JSON) — a separate mailing address distinct
 *     from the unit, so owners off-site receive mail correctly.
 *
 * All reads/writes go through org-scoped server routes using the admin token, so
 * no Directus role policies are needed here — this script only shapes the data.
 *
 * Idempotent. Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Run: pnpm run create:change-requests
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const COLLECTION = "hoa_member_change_requests";

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

const dropdown = (choices: { text: string; value: string; color?: string }[], def: string, note: string) => ({
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
  console.log(`\nMember change-request schema\n`);

  // 1. Collection ------------------------------------------------------------
  if (await collectionExists(COLLECTION)) {
    console.log(`⏭️  collection ${COLLECTION} exists`);
  } else {
    await dx("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: COLLECTION,
        meta: {
          icon: "fact_check",
          note: "Resident-submitted changes to household data, pending admin/PM review.",
          color: "#6366F1",
          archive_field: "status",
          archive_value: "cancelled",
          unarchive_value: "pending",
          sort_field: null,
          accountability: "all",
          display_template: "{{kind}} · {{action}} ({{status}})",
        },
        schema: { name: COLLECTION },
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
    console.log(`✅ collection ${COLLECTION}`);
  }

  // 2. Fields ----------------------------------------------------------------
  await createField(
    COLLECTION,
    "status",
    dropdown(
      [
        { text: "Pending", value: "pending", color: "var(--theme--warning)" },
        { text: "Approved", value: "approved", color: "var(--theme--success)" },
        { text: "Rejected", value: "rejected", color: "var(--theme--danger)" },
        { text: "Cancelled", value: "cancelled", color: "var(--theme--foreground-subdued)" },
      ],
      "pending",
      "Review state"
    )
  );

  await createField(
    COLLECTION,
    "kind",
    dropdown(
      [
        { text: "Contact info", value: "contact" },
        { text: "Mailing address", value: "mailing_address" },
        { text: "Vehicle", value: "vehicle" },
        { text: "Pet", value: "pet" },
      ],
      "contact",
      "What the resident is changing"
    )
  );

  await createField(
    COLLECTION,
    "action",
    dropdown(
      [
        { text: "Add", value: "create" },
        { text: "Update", value: "update" },
        { text: "Remove", value: "delete" },
      ],
      "update",
      "Add / update / remove"
    )
  );

  await createField(COLLECTION, "organization", m2o("Owning organization (tenant scope)", true));
  await createField(COLLECTION, "member", m2o("The member this change belongs to", true));
  await createField(COLLECTION, "submitted_by", m2o("User who submitted the request"));
  await createField(COLLECTION, "reviewed_by", m2o("Admin / PM who decided"));

  await createField(COLLECTION, "target_collection", {
    type: "string",
    meta: { interface: "input", width: "half", note: "hoa_members | hoa_vehicles | hoa_pets" },
  });
  await createField(COLLECTION, "target_id", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Existing record id (null for new)" },
  });
  await createField(COLLECTION, "payload", {
    type: "json",
    meta: { interface: "input-code", width: "full", options: { language: "json" }, note: "Proposed field values" },
  });
  await createField(COLLECTION, "note", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Resident's note to the reviewer" },
  });
  await createField(COLLECTION, "review_note", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Reviewer's note (esp. on reject)" },
  });
  await createField(COLLECTION, "reviewed_at", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", readonly: true },
  });
  await createField(COLLECTION, "date_created", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", readonly: true, special: ["date-created"] },
  });
  await createField(COLLECTION, "date_updated", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", readonly: true, special: ["date-updated"] },
  });

  // 3. Relations -------------------------------------------------------------
  await createRelation({
    collection: COLLECTION,
    field: "organization",
    related_collection: "hoa_organizations",
    schema: { on_delete: "CASCADE" },
    meta: { sort_field: null },
  });
  await createRelation({
    collection: COLLECTION,
    field: "member",
    related_collection: "hoa_members",
    schema: { on_delete: "CASCADE" },
    meta: { sort_field: null },
  });
  await createRelation({
    collection: COLLECTION,
    field: "submitted_by",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
    meta: { sort_field: null },
  });
  await createRelation({
    collection: COLLECTION,
    field: "reviewed_by",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
    meta: { sort_field: null },
  });

  // 4. hoa_members.mailing_address ------------------------------------------
  await createField("hoa_members", "mailing_address", {
    type: "json",
    meta: {
      interface: "input-code",
      width: "full",
      options: { language: "json" },
      note: "Separate mailing address { line1, line2, city, state, zip } (off-site owners).",
    },
  });

  console.log(`\n✓ Done.\n`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
