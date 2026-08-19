/**
 * Script to create hoa_leases — tenant leases attached to a unit, historically
 * accurate (Phase 6, Track 1).
 *
 * A lease ties a UNIT to a tenant (and optionally an owner/landlord) over a
 * term. On turnover set status=expired/terminated + end_date rather than
 * deleting, so a unit's leasing history is always answerable. Adds an O2M alias
 * `leases` on hoa_units.
 *
 * Run with: pnpm run create:leases
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

const LEASE_STATUS_CHOICES = [
  { text: "Active", value: "active", color: "var(--theme--success)" },
  { text: "Expired", value: "expired", color: "var(--theme--foreground-subdued)" },
  { text: "Terminated", value: "terminated", color: "var(--theme--danger)" },
];

async function createLeasesCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_leases collection...");
  await createCollection("hoa_leases", {
    collection: "hoa_leases",
    icon: "description",
    note: "Tenant leases attached to a unit (historical)",
    display_template: "{{unit.unit_number}} — {{status}}",
    sort_field: "sort",
  });

  await createField("hoa_leases", "status", {
    type: "string",
    schema: { default_value: "active" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: LEASE_STATUS_CHOICES } },
  });

  // Unit (required) — the persistent thing the lease attaches to.
  await createField("hoa_leases", "unit", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{unit_number}}" } },
  });
  await createRelation({ collection: "hoa_leases", field: "unit", related_collection: "hoa_units", meta: { one_field: "leases", sort_field: null }, schema: { on_delete: "CASCADE" } });

  // Tenant (lessee) + owner (landlord, optional).
  await createField("hoa_leases", "tenant", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" }, note: "The lessee" },
  });
  await createRelation({ collection: "hoa_leases", field: "tenant", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  await createField("hoa_leases", "owner", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" }, note: "Landlord / owner (optional)" },
  });
  await createRelation({ collection: "hoa_leases", field: "owner", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  // Term.
  await createField("hoa_leases", "start_date", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("hoa_leases", "end_date", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });

  // Money.
  await createField("hoa_leases", "rent_amount", { type: "decimal", schema: { numeric_precision: 12, numeric_scale: 2 }, meta: { interface: "input", width: "half", options: { iconLeft: "attach_money" } } });
  await createField("hoa_leases", "deposit_amount", { type: "decimal", schema: { numeric_precision: 12, numeric_scale: 2 }, meta: { interface: "input", width: "half", options: { iconLeft: "attach_money" } } });

  // Signed lease document (single file M2O).
  await createField("hoa_leases", "document", {
    type: "uuid",
    meta: { interface: "file", special: ["file"], width: "half", note: "Signed lease PDF" },
  });
  await createRelation({ collection: "hoa_leases", field: "document", related_collection: "directus_files", schema: { on_delete: "SET NULL" } });

  await createField("hoa_leases", "notes", { type: "text", meta: { interface: "input-multiline", width: "full" } });

  await createField("hoa_leases", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_leases", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  // System fields.
  await createField("hoa_leases", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("hoa_leases", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_leases", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_leases", field: "user_created", related_collection: "directus_users" });
  await createField("hoa_leases", "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_leases", "user_updated", { type: "uuid", meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_leases", field: "user_updated", related_collection: "directus_users" });
}

// O2M alias on hoa_units so a unit lists its leases.
async function addUnitsLeasesAlias(): Promise<void> {
  console.log("\n📁 Adding hoa_units.leases (O2M alias)...");
  await createField("hoa_units", "leases", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{status}} — {{start_date}}" } },
  });
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
  // Upsert, don't skip: a row that already exists may hold a STALE filter (this
  // script shipped `$CURRENT_USER.organization` once, which 500s every read for
  // the whole policy — see the orgFilter note above). Skipping on conflict left
  // prod broken and un-repairable by re-running, so patch the existing row.
  const existing = await directusFetch(
    `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&fields=id&limit=1`
  );
  const current = existing?.data?.[0];

  try {
    if (current) {
      await directusFetch(`/permissions/${current.id}`, { method: "PATCH", body: JSON.stringify(config) });
      console.log(`      ♻️  ${action} (updated)`);
      return;
    }
    await directusFetch("/permissions", { method: "POST", body: JSON.stringify({ policy, collection, action, ...config }) });
    console.log(`      ✅ ${action}`);
  } catch (error: any) {
    console.log(`      ❌ ${action}: ${error.message}`);
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
  const memberRole = roles.find((r) => r.name === "HOA Member");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;
  const memberPolicy = memberRole ? await getRolePolicy(memberRole.id, memberRole.name) : null;

  // `directus_users` has NO `organization` field — membership lives in
  // hoa_members. `$CURRENT_USER.organization` therefore resolves to nothing and
  // Directus 500s, and because it resolves dynamic variables per POLICY (not per
  // collection) one bad path breaks EVERY read for the role. Always use the
  // reverse relation. See scripts/fix-org-filter-permissions.ts.
  const orgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };
  // A member reads a lease in their org where they are the tenant or owner
  // (matched by the member record linked to the current user).
  const ownLeaseFilter = {
    _and: [
      orgFilter,
      { _or: [{ tenant: { user: { _eq: "$CURRENT_USER" } } }, { owner: { user: { _eq: "$CURRENT_USER" } } }] },
    ],
  };

  if (adminPolicy) {
    console.log("\n   📋 hoa_leases for HOA Admin...");
    for (const action of ["create", "read", "update", "delete"]) {
      await postPermission(adminPolicy.id, "hoa_leases", action, {
        permissions: orgFilter,
        validation: action === "create" || action === "update" ? orgFilter : null,
        fields: ["*"],
      });
    }
  }
  if (memberPolicy) {
    console.log("\n   📋 hoa_leases for HOA Member (read own lease)...");
    await postPermission(memberPolicy.id, "hoa_leases", "read", { permissions: ownLeaseFilter, validation: null, fields: ["*"] });
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating hoa_leases + units alias + permissions...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createLeasesCollection();
    await addUnitsLeasesAlias();
    await setupPermissions();
    console.log("\n✅ Leases collection + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
