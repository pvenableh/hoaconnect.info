/**
 * Script to create hoa_teams + hoa_team_members — named, admin-created teams
 * (a.k.a. committees) so a NON-board member can be empowered to manage a
 * specific domain without full board access.
 *
 * Each team has a free-text NAME (e.g. "Violations Committee", "Landscaping
 * Crew") and an optional DOMAIN that maps to a request type. A team member gets
 * board-style controls on requests of the team's domain: transition status,
 * assign, and see/post internal comments — scoped to that domain.
 *
 *   domain: none | violations | arc | maintenance | finance | general
 *   maps to request types: violations↔violation, arc↔arc,
 *   maintenance↔maintenance, general↔(complaint|task), finance↔payments.
 *
 * Run with: pnpm run create:teams
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations are skipped.
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

const DOMAIN_CHOICES = [
  { text: "— none —", value: "none" },
  { text: "Violations", value: "violations" },
  { text: "ARC (Architectural)", value: "arc" },
  { text: "Maintenance", value: "maintenance" },
  { text: "Finance", value: "finance" },
  { text: "General", value: "general" },
];

const ROLE_CHOICES = [
  { text: "Member", value: "member" },
  { text: "Lead", value: "lead" },
];

async function createTeamsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_teams collection...");

  await createCollection("hoa_teams", {
    collection: "hoa_teams",
    icon: "groups",
    note: "Named teams/committees. domain (optional) grants manager rights on that request type.",
    display_template: "{{name}}",
    sort_field: "sort",
  });

  await createField("hoa_teams", "sort", { type: "integer", meta: { interface: "input", hidden: true } });

  await createField("hoa_teams", "status", {
    type: "string",
    schema: { default_value: "active" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: [
        { text: "Active", value: "active", color: "var(--theme--success)" },
        { text: "Archived", value: "archived", color: "var(--theme--foreground-subdued)" },
      ] },
    },
  });

  await createField("hoa_teams", "name", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full", note: "Free-text team name" },
  });

  await createField("hoa_teams", "domain", {
    type: "string",
    schema: { default_value: "none" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: DOMAIN_CHOICES },
      note: "Optional — grants manager rights on the matching request type",
    },
  });

  await createField("hoa_teams", "color", { type: "string", meta: { interface: "select-color", width: "half" } });
  await createField("hoa_teams", "icon", { type: "string", meta: { interface: "select-icon", width: "half" } });
  await createField("hoa_teams", "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });

  await createField("hoa_teams", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_teams", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_teams", "members", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{user.first_name}} {{user.last_name}}" } },
  });

  await createField("hoa_teams", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_teams", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_teams", field: "user_created", related_collection: "directus_users" });
}

async function createTeamMembersCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_team_members collection...");

  await createCollection("hoa_team_members", {
    collection: "hoa_team_members",
    icon: "person",
    note: "Junction: a user's membership in a team",
    display_template: "{{user.first_name}} {{user.last_name}} — {{role}}",
  });

  await createField("hoa_team_members", "team", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({
    collection: "hoa_team_members",
    field: "team",
    related_collection: "hoa_teams",
    meta: { one_field: "members", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await createField("hoa_team_members", "user", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "user" },
  });
  await createRelation({ collection: "hoa_team_members", field: "user", related_collection: "directus_users", schema: { on_delete: "CASCADE" } });

  await createField("hoa_team_members", "member", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: "hoa_team_members", field: "member", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  await createField("hoa_team_members", "role", {
    type: "string",
    schema: { default_value: "member" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: ROLE_CHOICES } },
  });

  await createField("hoa_team_members", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_team_members", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_team_members", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_team_members", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_team_members", field: "user_created", related_collection: "directus_users" });
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

  for (const collection of ["hoa_teams", "hoa_team_members"]) {
    if (adminPolicy) {
      console.log(`\n   📋 ${collection} for HOA Admin...`);
      await postPermission(adminPolicy.id, collection, "create", { permissions: {}, validation: orgFilter, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "read", { permissions: orgFilter, validation: null, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "update", { permissions: orgFilter, validation: orgFilter, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "delete", { permissions: orgFilter, validation: null, fields: ["*"] });
    }
    if (memberPolicy) {
      console.log(`\n   📋 ${collection} for HOA Member (read-only)...`);
      await postPermission(memberPolicy.id, collection, "read", { permissions: orgFilter, validation: null, fields: ["*"] });
    }
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating hoa_teams + hoa_team_members...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createTeamsCollection();
    await createTeamMembersCollection();
    await setupPermissions();
    console.log("\n✅ Teams collections + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
    console.log("   (Follow-up) To let team members LIST all requests in their");
    console.log("   domain via the API, extend the hoa_requests read filter.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
