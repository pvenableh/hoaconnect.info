/**
 * Script to create hoa_governance — by-laws, CC&Rs, rules & policies entered per
 * org and searchable (Phase 6, Track 2).
 *
 * Each row is one governing document/section: a title, optional section_number
 * (e.g. "4.2.1"), a short plain-text summary that powers search snippets, and a
 * rich-text content body (TipTap / input-rich-text-html). Sections can nest via
 * a self-referential `parent`. Members read only PUBLISHED rows in their org.
 *
 * Run with: pnpm run create:governance
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

const STATUS_CHOICES = [
  { text: "Published", value: "published", color: "var(--theme--success)" },
  { text: "Draft", value: "draft", color: "var(--theme--foreground-subdued)" },
  { text: "Archived", value: "archived", color: "var(--theme--foreground-subdued)" },
];
const CATEGORY_CHOICES = [
  { text: "By-law", value: "bylaw" },
  { text: "Rule", value: "rule" },
  { text: "CC&R", value: "ccr" },
  { text: "Policy", value: "policy" },
  { text: "Guideline", value: "guideline" },
];

async function createGovernanceCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_governance collection...");
  await createCollection("hoa_governance", {
    collection: "hoa_governance",
    icon: "gavel",
    note: "By-laws, CC&Rs, rules & policies (searchable)",
    display_template: "{{section_number}} {{title}}",
    sort_field: "sort",
  });

  await createField("hoa_governance", "status", {
    type: "string",
    schema: { default_value: "draft" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: STATUS_CHOICES } },
  });
  await createField("hoa_governance", "category", {
    type: "string",
    schema: { default_value: "rule" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: CATEGORY_CHOICES } },
  });
  await createField("hoa_governance", "title", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "full" } });
  await createField("hoa_governance", "section_number", { type: "string", meta: { interface: "input", width: "half", note: 'e.g. "4.2.1" (sortable)' } });
  await createField("hoa_governance", "effective_date", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("hoa_governance", "summary", { type: "text", meta: { interface: "input-multiline", width: "full", note: "Short plain-text blurb (powers search snippets)" } });
  await createField("hoa_governance", "content", { type: "text", meta: { interface: "input-rich-text-html", width: "full", note: "The rule body" } });
  await createField("hoa_governance", "tags", { type: "json", meta: { interface: "tags", special: ["cast-json"], width: "full", note: "Keyword list" } });

  // Self-referential section hierarchy.
  await createField("hoa_governance", "parent", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{section_number}} {{title}}" }, note: "Parent section" },
  });
  await createRelation({ collection: "hoa_governance", field: "parent", related_collection: "hoa_governance", schema: { on_delete: "SET NULL" } });

  await createField("hoa_governance", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_governance", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  // System fields.
  await createField("hoa_governance", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("hoa_governance", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_governance", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_governance", field: "user_created", related_collection: "directus_users" });
  await createField("hoa_governance", "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_governance", "user_updated", { type: "uuid", meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_governance", field: "user_updated", related_collection: "directus_users" });
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
  const publishedOrgFilter = { _and: [orgFilter, { status: { _eq: "published" } }] };

  if (adminPolicy) {
    console.log("\n   📋 hoa_governance for HOA Admin...");
    for (const action of ["create", "read", "update", "delete"]) {
      await postPermission(adminPolicy.id, "hoa_governance", action, {
        permissions: orgFilter,
        validation: action === "create" || action === "update" ? orgFilter : null,
        fields: ["*"],
      });
    }
  }
  if (memberPolicy) {
    console.log("\n   📋 hoa_governance for HOA Member (read published)...");
    await postPermission(memberPolicy.id, "hoa_governance", "read", { permissions: publishedOrgFilter, validation: null, fields: ["*"] });
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating hoa_governance + permissions...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createGovernanceCollection();
    await setupPermissions();
    console.log("\n✅ Governance collection + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
