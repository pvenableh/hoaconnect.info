/**
 * Phase 4 schema: `org_audit_log` + `hoa_organizations.grace_ends_at`.
 *
 * ── org_audit_log ──────────────────────────────────────────────────────────
 * The append-only record of things that happened TO a community rather than
 * inside it. A management transition is its first writer (Phase 4); the
 * Community Ledger (Phase 5) adds the rest — payments, document publishes, poll
 * outcomes, executed AI actions, grant changes.
 *
 *   organization    — M2O hoa_organizations (CASCADE; an audit trail for a
 *                     deleted community describes nothing)
 *   event_type      — management_transition | manager_onboarded | admin_promoted.
 *                     A string, not an enum column: Phase 5 adds values, and a
 *                     reader that meets an unknown one should render it
 *                     generically rather than fail.
 *   occurred_at     — when the thing happened, which is not always when the row
 *                     was written
 *   actor_user      — M2O directus_users (SET NULL)
 *   actor_name /
 *   actor_email     — denormalized ON PURPOSE. The row has to still read
 *                     correctly after the account is deleted; "someone removed
 *                     your manager in March" is not an audit trail.
 *   visibility      — owners | board. Carried per-row; Phase 5's central
 *                     visibility-policy module decides it from then on.
 *   summary         — the human sentence
 *   payload         — the machine record
 *   schema_version  — so a later reader knows which shape it is holding
 *
 * **Append-only is enforced in three places, and only two of them exist yet.**
 * 1. No role permissions are created here, so no client can touch the table.
 * 2. The app exposes no update or delete path — `writeAuditEntry` is the only
 *    writer, and there is deliberately no counterpart.
 * 3. A database trigger, which this script CANNOT install (Directus's API has no
 *    endpoint for one). Until an operator runs the SQL in
 *    `docs/go-live-checklist.md`, the admin token could still rewrite history.
 *    VISION says "no mutable audit log, ever" — until step 3 is done that is a
 *    property of our code, not of the database, and it should be described that
 *    way rather than overclaimed.
 *
 * ── hoa_organizations.grace_ends_at ────────────────────────────────────────
 * The 60-day window a detached community keeps working in. `isEntitledFrom`
 * passes while this is in the future, WITHOUT the status pretending to be
 * active — see the comment there for why the cheaper trick (status: "trial")
 * was rejected.
 *
 * Run with: pnpm run create:transition
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Additive + idempotent: existing collection/fields/relations are skipped.
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
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("📦 Phase 4 — management transition schema\n");

  console.log("1. org_audit_log");
  await createCollection("org_audit_log", {
    icon: "history",
    note: "Append-only record of what happened to a community. Written only by writeAuditEntry. Never updated, never deleted.",
    display_template: "{{occurred_at}} — {{summary}}",
    hidden: false,
    sort_field: "occurred_at",
  });

  await createField("org_audit_log", "organization", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      required: true,
      width: "half",
      note: "The community this happened to.",
    },
    schema: { is_nullable: false },
  });

  await createField("org_audit_log", "event_type", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      required: true,
      note: "A string, not an enum: Phase 5 adds values and old readers must not break.",
      options: {
        allowOther: true,
        choices: [
          { text: "Management transition", value: "management_transition" },
          { text: "Manager onboarded", value: "manager_onboarded" },
          { text: "Admin promoted", value: "admin_promoted" },
        ],
      },
    },
    schema: { is_nullable: false, max_length: 64 },
  });

  await createField("org_audit_log", "occurred_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      width: "half",
      required: true,
      note: "When it happened — not necessarily when the row was written.",
    },
    schema: { is_nullable: false },
  });

  await createField("org_audit_log", "actor_user", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      width: "half",
      note: "Who did it. SET NULL on delete — the entry outlives the account.",
    },
    schema: { is_nullable: true },
  });

  await createField("org_audit_log", "actor_name", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Denormalized on purpose: the row must still read correctly once the account is gone.",
    },
    schema: { is_nullable: true, max_length: 255 },
  });

  await createField("org_audit_log", "actor_email", {
    type: "string",
    meta: { interface: "input", width: "half" },
    schema: { is_nullable: true, max_length: 255 },
  });

  await createField("org_audit_log", "visibility", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      required: true,
      note: "Who may see it. Phase 5's visibility-policy module decides this centrally.",
      options: {
        choices: [
          { text: "Owners", value: "owners" },
          { text: "Board only", value: "board" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "board", max_length: 20 },
  });

  await createField("org_audit_log", "summary", {
    type: "text",
    meta: {
      interface: "input-multiline",
      width: "full",
      note: "The human sentence. Must make sense without this codebase.",
    },
    schema: { is_nullable: false },
  });

  await createField("org_audit_log", "payload", {
    type: "json",
    meta: {
      interface: "input-code",
      width: "full",
      note: "The structured record of what changed.",
      options: { language: "json" },
    },
    schema: { is_nullable: true },
  });

  await createField("org_audit_log", "schema_version", {
    type: "integer",
    meta: {
      interface: "input",
      width: "half",
      readonly: true,
      note: "Which payload shape this row holds.",
    },
    schema: { is_nullable: false, default_value: 1 },
  });

  await createField("org_audit_log", "date_created", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      special: ["date-created"],
      readonly: true,
      hidden: true,
      width: "half",
    },
    schema: { is_nullable: true },
  });

  // CASCADE: an audit trail for a deleted community describes nothing.
  await createRelation({
    collection: "org_audit_log",
    field: "organization",
    related_collection: "hoa_organizations",
    schema: { on_delete: "CASCADE" },
    meta: { sort_field: null },
  });

  // SET NULL: the entry outlives the person. actor_name carries the identity.
  await createRelation({
    collection: "org_audit_log",
    field: "actor_user",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
    meta: { sort_field: null },
  });

  console.log("\n2. hoa_organizations.grace_ends_at");
  await createField("hoa_organizations", "grace_ends_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      width: "half",
      note: "Management-transition grace window. While this is in the future the community keeps working even though its subscription status says otherwise.",
    },
    schema: { is_nullable: true },
  });

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
  console.log("   No role permissions were granted for org_audit_log — the server");
  console.log("   routes use the admin token and there is no update/delete path.");
  console.log("\n⚠️  Immutability is enforced by CODE until the database trigger in");
  console.log("   docs/go-live-checklist.md §3c is installed on the droplet.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
