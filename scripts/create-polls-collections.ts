/**
 * Script to create hoa_polls + hoa_poll_votes — community feedback polls.
 *
 * Admins (or those with permission) create a poll with a set of options; members
 * vote. Results aggregate client-side. `is_anonymous` hides voter identity in
 * the UI (soft anonymity — not cryptographic). One vote per (poll, user) unless
 * `allow_multiple`.
 *
 * Run with: pnpm run create:polls
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

const POLL_STATUS_CHOICES = [
  { text: "Draft", value: "draft", color: "var(--theme--foreground-subdued)" },
  { text: "Open", value: "open", color: "var(--theme--success)" },
  { text: "Closed", value: "closed", color: "var(--theme--foreground-subdued)" },
];
const AUDIENCE_CHOICES = [
  { text: "Everyone", value: "all" },
  { text: "Owners", value: "owners" },
  { text: "Tenants", value: "tenants" },
  { text: "Board Members", value: "board_members" },
];

async function createPollsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_polls collection...");
  await createCollection("hoa_polls", {
    collection: "hoa_polls",
    icon: "ballot",
    note: "Community feedback polls",
    display_template: "{{title}} ({{status}})",
  });

  await createField("hoa_polls", "status", {
    type: "string",
    schema: { default_value: "open" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: POLL_STATUS_CHOICES } },
  });
  await createField("hoa_polls", "title", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "full" } });
  await createField("hoa_polls", "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });
  await createField("hoa_polls", "options", {
    type: "json",
    schema: { is_nullable: false },
    meta: { interface: "input-code", options: { language: "json" }, width: "full", required: true, note: "Array of { id, label }" },
  });
  await createField("hoa_polls", "allow_multiple", { type: "boolean", schema: { default_value: false }, meta: { interface: "boolean", width: "half" } });
  await createField("hoa_polls", "is_anonymous", { type: "boolean", schema: { default_value: false }, meta: { interface: "boolean", width: "half", note: "Hide voter identity in the UI" } });
  await createField("hoa_polls", "closes_at", { type: "timestamp", meta: { interface: "datetime", display: "datetime", width: "half" } });
  await createField("hoa_polls", "target_audience", {
    type: "string",
    schema: { default_value: "all" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: AUDIENCE_CHOICES } },
  });

  await createField("hoa_polls", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_polls", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_polls", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField("hoa_polls", "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: "hoa_polls", field: "user_created", related_collection: "directus_users" });
}

async function createPollVotesCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_poll_votes collection...");
  await createCollection("hoa_poll_votes", {
    collection: "hoa_poll_votes",
    icon: "how_to_vote",
    note: "One row per (user, option) vote",
    display_template: "{{option_id}}",
  });

  await createField("hoa_poll_votes", "poll", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_poll_votes", field: "poll", related_collection: "hoa_polls", schema: { on_delete: "CASCADE" } });

  await createField("hoa_poll_votes", "option_id", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "half" } });

  await createField("hoa_poll_votes", "user", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", width: "half", special: ["user-created"] },
  });
  await createRelation({ collection: "hoa_poll_votes", field: "user", related_collection: "directus_users", schema: { on_delete: "CASCADE" } });

  await createField("hoa_poll_votes", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_poll_votes", field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_poll_votes", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
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
  const publishedOrgFilter = { _and: [orgFilter, { status: { _in: ["open", "closed"] } }] };
  const ownVoteFilter = { _and: [orgFilter, { user: { _eq: "$CURRENT_USER" } }] };

  if (adminPolicy) {
    console.log("\n   📋 hoa_polls for HOA Admin...");
    for (const action of ["create", "read", "update", "delete"]) {
      await postPermission(adminPolicy.id, "hoa_polls", action, { permissions: orgFilter, validation: action === "create" || action === "update" ? orgFilter : null, fields: ["*"] });
    }
    console.log("\n   📋 hoa_poll_votes for HOA Admin...");
    await postPermission(adminPolicy.id, "hoa_poll_votes", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_poll_votes", "delete", { permissions: orgFilter, validation: null, fields: ["*"] });
  }
  if (memberPolicy) {
    console.log("\n   📋 hoa_polls for HOA Member (read open/closed)...");
    await postPermission(memberPolicy.id, "hoa_polls", "read", { permissions: publishedOrgFilter, validation: null, fields: ["*"] });
    console.log("\n   📋 hoa_poll_votes for HOA Member...");
    // Members can vote (own), read all votes in org for live counts, and remove
    // their own vote (to change it when the poll isn't multi-select).
    await postPermission(memberPolicy.id, "hoa_poll_votes", "create", { permissions: {}, validation: ownVoteFilter, fields: ["*"] });
    await postPermission(memberPolicy.id, "hoa_poll_votes", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
    await postPermission(memberPolicy.id, "hoa_poll_votes", "delete", { permissions: ownVoteFilter, validation: null, fields: ["*"] });
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating hoa_polls + hoa_poll_votes...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createPollsCollection();
    await createPollVotesCollection();
    await setupPermissions();
    console.log("\n✅ Polls collections + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
