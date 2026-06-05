/**
 * Script to create the hoa_requests collection — the generic requests/tickets
 * system (Phase 5, Tier 1). The conversation/audit trail is NOT columns here;
 * it's the hoa_comments thread targeting (hoa_requests, id). Type-specific
 * fields live in `metadata` JSON, driven by app/config/requestWorkflows.ts
 * (Tier 2 — no per-type tables).
 *
 * Request types: maintenance / arc / violation / complaint / task.
 *
 * Run with: pnpm run create:requests
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations are skipped.
 *
 * Row-level read scope (required before launch — especially for violations):
 * a member reads only requests where they are submitted_by OR member.user;
 * admins read all requests in their organization.
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

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
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

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
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

async function addSystemFields(collection: string): Promise<void> {
  await createField(collection, "user_created", {
    type: "uuid",
    meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users" });
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
  await createField(collection, "user_updated", {
    type: "uuid",
    meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_updated", related_collection: "directus_users" });
  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
}

const TYPE_CHOICES = [
  { text: "Maintenance", value: "maintenance" },
  { text: "ARC (Architectural Review)", value: "arc" },
  { text: "Violation", value: "violation" },
  { text: "Complaint", value: "complaint" },
  { text: "Task", value: "task" },
];

const STATUS_CHOICES = [
  { text: "Open", value: "open", color: "var(--theme--primary)" },
  { text: "In Progress", value: "in_progress", color: "var(--theme--warning)" },
  { text: "Waiting", value: "waiting", color: "var(--theme--foreground-subdued)" },
  { text: "Resolved", value: "resolved", color: "var(--theme--success)" },
  { text: "Closed", value: "closed", color: "var(--theme--foreground-subdued)" },
];

const PRIORITY_CHOICES = [
  { text: "Low", value: "low" },
  { text: "Normal", value: "normal" },
  { text: "High", value: "high" },
  { text: "Urgent", value: "urgent", color: "var(--theme--danger)" },
];

async function createRequestsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_requests collection...");

  await createCollection("hoa_requests", {
    collection: "hoa_requests",
    icon: "assignment",
    note: "Generic requests/tickets — maintenance / arc / violation / complaint / task",
    display_template: "{{title}} ({{type}})",
  });

  await createField("hoa_requests", "status", {
    type: "string",
    schema: { default_value: "open" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: STATUS_CHOICES } },
  });

  await createField("hoa_requests", "type", {
    type: "string",
    schema: { default_value: "maintenance", is_nullable: false },
    meta: { interface: "select-dropdown", display: "labels", width: "half", required: true, options: { choices: TYPE_CHOICES } },
  });

  await createField("hoa_requests", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });

  await createField("hoa_requests", "description", {
    type: "text",
    meta: { interface: "input-rich-text-html", width: "full" },
  });

  await createField("hoa_requests", "priority", {
    type: "string",
    schema: { default_value: "normal" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: PRIORITY_CHOICES } },
  });

  await createField("hoa_requests", "category", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Optional subcategory per type" },
  });

  await createField("hoa_requests", "submitted_by", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user", note: "Reporter" },
  });
  await createRelation({ collection: "hoa_requests", field: "submitted_by", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });

  await createField("hoa_requests", "assigned_to", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user", note: "Owner (board/manager/committee)" },
  });
  await createRelation({ collection: "hoa_requests", field: "assigned_to", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });

  await createField("hoa_requests", "unit", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", note: "Unit/property the request concerns" },
  });
  await createRelation({ collection: "hoa_requests", field: "unit", related_collection: "hoa_units", schema: { on_delete: "SET NULL" } });

  await createField("hoa_requests", "member", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" }, note: "Subject member (violator, requester)" },
  });
  await createRelation({ collection: "hoa_requests", field: "member", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  await createField("hoa_requests", "due_date", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half" },
  });

  await createField("hoa_requests", "attachments", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, width: "full", note: "Array of file IDs (photos for maintenance/violations)" },
  });

  await createField("hoa_requests", "metadata", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, width: "full", note: "Type-specific fields (Tier 2 — see requestWorkflows.ts)" },
  });

  // Organization (M2O, required)
  await createField("hoa_requests", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({
    collection: "hoa_requests",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await addSystemFields("hoa_requests");
}

// ============================================
// Permissions
// ============================================
interface Role { id: string; name: string; }
interface Policy { id: string; name: string; }

async function getRoles(): Promise<Role[]> {
  const response = await directusFetch(
    `/roles?filter=${JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })}&fields=id,name`
  );
  return response.data as Role[];
}

async function getRolePolicy(roleId: string, roleName: string): Promise<Policy | null> {
  try {
    const response = await directusFetch(
      `/access?filter=${JSON.stringify({ role: { _eq: roleId } })}&fields=id,policy&limit=1`
    );
    if (response.data && response.data.length > 0) {
      const policyId =
        typeof response.data[0].policy === "string" ? response.data[0].policy : response.data[0].policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
  }
}

async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  try {
    await directusFetch("/permissions", {
      method: "POST",
      body: JSON.stringify({ policy, collection, action, ...config }),
    });
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
  if (roles.length === 0) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions setup.");
    return;
  }

  const adminRole = roles.find((r) => r.name === "HOA Admin");
  const memberRole = roles.find((r) => r.name === "HOA Member");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;
  const memberPolicy = memberRole ? await getRolePolicy(memberRole.id, memberRole.name) : null;

  const orgFilter = { organization: { _eq: "$CURRENT_USER.organization" } };
  // Members read only their own requests (submitted_by or subject member.user)
  const memberReadFilter = {
    _and: [
      orgFilter,
      {
        _or: [
          { submitted_by: { _eq: "$CURRENT_USER" } },
          { member: { user: { _eq: "$CURRENT_USER" } } },
        ],
      },
    ],
  };

  if (adminPolicy) {
    console.log("\n   📋 hoa_requests permissions for HOA Admin...");
    await postPermission(adminPolicy.id, "hoa_requests", "create", { permissions: {}, validation: orgFilter, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_requests", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_requests", "update", { permissions: orgFilter, validation: orgFilter, fields: ["*"] });
    await postPermission(adminPolicy.id, "hoa_requests", "delete", { permissions: orgFilter, validation: null, fields: ["*"] });
  }
  if (memberPolicy) {
    console.log("\n   📋 hoa_requests permissions for HOA Member...");
    // Members may submit maintenance/arc/complaint requests for their org; they
    // must not self-create violations (board → member direction).
    await postPermission(memberPolicy.id, "hoa_requests", "create", {
      permissions: {},
      validation: { _and: [orgFilter, { type: { _in: ["maintenance", "arc", "complaint"] } }, { submitted_by: { _eq: "$CURRENT_USER" } }] },
      fields: ["*"],
    });
    await postPermission(memberPolicy.id, "hoa_requests", "read", { permissions: memberReadFilter, validation: null, fields: ["*"] });
    // Members may update only their own non-violation requests, limited fields.
    await postPermission(memberPolicy.id, "hoa_requests", "update", {
      permissions: { _and: [orgFilter, { submitted_by: { _eq: "$CURRENT_USER" } }, { type: { _neq: "violation" } }] },
      validation: null,
      fields: ["title", "description", "priority", "category", "attachments", "status"],
    });
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating Directus collection for requests/tickets...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createRequestsCollection();
    await setupPermissions();
    console.log("\n✅ Requests collection and permissions complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. Ensure comments collections exist (pnpm create:comments)");
    console.log("   3. Build the Requests admin queue + member pages + detail view");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
