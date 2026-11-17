/**
 * Restricted members (docs/spec-member-restrictions.md): one collection.
 *
 *   hoa_member_restrictions   one row per pause of a member's posting in one
 *                             community: when it started, when it ends (null
 *                             = until lifted), who imposed and lifted it, the
 *                             note the member sees and the board's own note.
 *                             Ended, never deleted: lifting sets lifted_at.
 *
 * No permissions here: scripts/setup-directus-permissions.ts gives no policy
 * any access (every read and write is a route under
 * /api/org/member-restrictions, with the admin token). A member learns of
 * their own pause through GET /api/org/member-restrictions/mine, which returns
 * the member-facing fields only.
 *
 * Run with: pnpm create:member-restrictions   (add --dry-run to report only)
 * Then:     pnpm setup:permissions:audit (expect nothing new), pnpm generate:types
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 * Idempotent: everything is created only when absent.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const would = (what: string) => console.log(`   🔎 would ${what}`);

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
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function exists(endpoint: string): Promise<boolean> {
  try {
    await directusFetch(endpoint);
    return true;
  } catch {
    return false;
  }
}

/** Collections created in this run, so a dry run knows their fields are new too. */
const plannedCollections = new Set<string>();

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await exists(`/collections/${collection}`)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping`);
    return;
  }
  plannedCollections.add(collection);
  if (DRY_RUN) return would(`create collection ${collection}`);
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } },
      ],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, config: Record<string, any>): Promise<void> {
  if (!plannedCollections.has(collection) && (await exists(`/fields/${collection}/${field}`))) {
    console.log(`   ⏭️  ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`create field ${collection}.${field} (${config.type})`);
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...config }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(config: { collection: string; field: string; related_collection: string; meta?: any; schema?: any }): Promise<void> {
  const { collection, field, related_collection } = config;
  if (!plannedCollections.has(collection) && (await exists(`/relations/${collection}/${field}`))) {
    console.log(`   ⏭️  Relation ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`relate ${collection}.${field} → ${related_collection} (${config.schema?.on_delete ?? "NO ACTION"})`);
  await directusFetch("/relations", { method: "POST", body: JSON.stringify(config) });
  console.log(`   ✅ Related ${collection}.${field} → ${related_collection}`);
}

async function addM2O(collection: string, field: string, related: string, note: string, required = false): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    // A required member is still nullable in the database: SET NULL keeps the
    // row (and its frozen holder_name) if the membership is ever deleted.
    schema: { is_nullable: true },
    meta: { interface: "select-dropdown-m2o", width: "half", note, ...(required ? { required: true } : {}) },
  });
  await createRelation({ collection, field, related_collection: related, meta: { one_field: null, sort_field: null }, schema: { on_delete: "SET NULL" } });
}

async function createRestrictions(): Promise<void> {
  const c = "hoa_member_restrictions";
  console.log(`\n⏸️  ${c}`);
  await createCollection(c, {
    collection: c,
    icon: "pause_circle",
    note: "A member's posting paused in one community (docs/spec-member-restrictions.md). Ended, never deleted. Read and written only through /api/org/member-restrictions.",
    hidden: true,
  });
  await createField(c, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: c, field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });
  await addM2O(c, "member", "hoa_members", "The membership whose posting is paused. Set by the route; kept as null if the membership is deleted.", true);
  await createField(c, "starts_at", { type: "timestamp", schema: { is_nullable: false }, meta: { interface: "datetime", required: true, width: "half", note: "Inclusive: the pause starts at this instant." } });
  await createField(c, "ends_at", { type: "timestamp", schema: { is_nullable: true }, meta: { interface: "datetime", width: "half", note: "Null = until lifted. Exclusive: posting resumes at this instant, with no write." } });
  await createField(c, "lifted_at", { type: "timestamp", schema: { is_nullable: true }, meta: { interface: "datetime", width: "half", note: "Set when an admin ends it early." } });
  await addM2O(c, "lifted_by", "directus_users", "The admin who lifted it early");
  await addM2O(c, "imposed_by", "directus_users", "The admin who paused the member's posting");
  await createField(c, "member_note", { type: "text", schema: { is_nullable: false }, meta: { interface: "input-multiline", required: true, note: "Shown to the member on every page of the community while the pause lasts." } });
  await createField(c, "internal_note", { type: "text", schema: { is_nullable: true }, meta: { interface: "input-multiline", note: "Admins only. Never shown to the member or written to the ledger." } });
  await createField(c, "holder_name", { type: "string", meta: { interface: "input", width: "half", readonly: true, note: "The member's name, frozen by the server when the row ends." } });
  await createField(c, "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField(c, "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: c, field: "user_created", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });
}

async function main(): Promise<void> {
  console.log(`🚀 Restricted members${DRY_RUN ? " (dry run)" : ""}`);
  await createRestrictions();
  console.log(DRY_RUN ? "\n✅ Dry run complete. Nothing was written." : "\n✅ Done. Next: pnpm setup:permissions:audit, then pnpm generate:types.");
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
