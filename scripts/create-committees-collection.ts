/**
 * Script to create hoa_committee_members — lightweight committee/assignment
 * roles so a NON-board member can be empowered to manage a specific domain
 * (violations, ARC, maintenance, finance) without being a full board member.
 *
 * A committee member gets "manager" capability for their domain: on requests of
 * the matching type they can transition status, assign, and see/post internal
 * comments — the same affordances the board has, scoped to that domain.
 *
 * Maps to request types: violations↔violation, arc↔arc, maintenance↔maintenance,
 * general↔complaint/task. finance is reserved for the payments domain.
 *
 * Run with: pnpm run create:committees
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
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } },
      ],
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

const COMMITTEE_CHOICES = [
  { text: "Violations", value: "violations" },
  { text: "ARC (Architectural)", value: "arc" },
  { text: "Maintenance", value: "maintenance" },
  { text: "Finance", value: "finance" },
  { text: "General", value: "general" },
];

const ROLE_CHOICES = [
  { text: "Member", value: "member" },
  { text: "Chair", value: "chair" },
];

async function createCommitteeMembersCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_committee_members collection...");

  await createCollection("hoa_committee_members", {
    collection: "hoa_committee_members",
    icon: "groups",
    note: "Assigns a member to a committee domain (violations/arc/maintenance/finance/general)",
    display_template: "{{committee}} — {{user.first_name}} {{user.last_name}}",
  });

  await createField("hoa_committee_members", "committee", {
    type: "string",
    schema: { is_nullable: false, default_value: "general" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", required: true, options: { choices: COMMITTEE_CHOICES } },
  });

  await createField("hoa_committee_members", "role", {
    type: "string",
    schema: { default_value: "member" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: ROLE_CHOICES } },
  });

  await createField("hoa_committee_members", "user", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "user" },
  });
  await createRelation({ collection: "hoa_committee_members", field: "user", related_collection: "directus_users", schema: { on_delete: "CASCADE" } });

  // Optional display link to the hoa_members row
  await createField("hoa_committee_members", "member", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: "hoa_committee_members", field: "member", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  // Organization (required, tenancy)
  await createField("hoa_committee_members", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_committee_members", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_committee_members", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
  await createField("hoa_committee_members", "user_created", {
    type: "uuid",
    meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection: "hoa_committee_members", field: "user_created", related_collection: "directus_users" });
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
  const memberRole = roles.find((r) => r.name === "HOA Member");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;
  const memberPolicy = memberRole ? await getRolePolicy(memberRole.id, memberRole.name) : null;

  const orgFilter = { organization: { _eq: "$CURRENT_USER.organization" } };

  if (adminPolicy) {
    console.log("\n   📋 hoa_committee_members for HOA Admin...");
    await postPermission(adminPolicy.id, "hoa_committee_members", "create", { permissions: {}, validation: orgFilter, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_committee_members", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_committee_members", "update", { permissions: orgFilter, validation: orgFilter, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_committee_members", "delete", { permissions: orgFilter, validation: null, fields: ["*"] });
  }
  if (memberPolicy) {
    console.log("\n   📋 hoa_committee_members for HOA Member (read-only)...");
    // Members can read rosters in their org (so the UI knows their committees).
    await postPermission(memberPolicy.id, "hoa_committee_members", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating hoa_committee_members...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createCommitteeMembersCollection();
    await setupPermissions();
    console.log("\n✅ Committee members collection + permissions complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. (Follow-up) To let committee members LIST all requests in");
    console.log("      their domain via the API, extend the hoa_requests read");
    console.log("      filter — see docs. The UI capability is already code-first.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
