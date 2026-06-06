/**
 * Property Manager role + inquiry-notification routing setup.
 *
 * Creates everything the "Property management" feature needs, idempotently:
 *
 *  1. The **Property Manager** Directus role + linked policy (fixed UUIDs so
 *     nuxt.config / setup-directus-permissions can reference them). app_access:true,
 *     admin_access:false — a real login role with a SCOPED policy. The policy's
 *     collection permissions are filled in by scripts/setup-directus-permissions.ts
 *     (the role appears in its rolesToProcess); the hoa_requests / hoa_comments
 *     permissions a manager needs are NOT in that script's COLLECTION_CONFIGS, so
 *     they're granted here (mirrors create-requests / create-comments).
 *
 *  2. `hoa_management_contacts` — the external property-management company's
 *     notification contacts (rental/sales, violations, general). M2O org. These
 *     are notification targets; they may optionally link to a `user`/`hoa_member`.
 *
 *  3. `hoa_organizations.inquiry_routing` (JSON) — per-org map of inquiry type →
 *     contact kind, plus a board-default toggle. Admin-editable from the UI.
 *     Shape: { board_default: true, map: { maintenance, arc, complaint, violation } }
 *
 *  4. `hoa_members.manager_permissions` (JSON) — per-manager grant flags the admin
 *     toggles: { inquiries, violations, directory, documents, communications }.
 *     The Directus policy is the org-scoped CEILING shared by all managers; these
 *     flags are enforced per-manager in the app UI and (for sends / violation
 *     writes) in elevated server routes — the same "board access via server routes"
 *     pattern used elsewhere.
 *
 * Run with: pnpm run create:property-mgmt
 * Then:     pnpm run setup:permissions   (fills the PM policy's collection perms)
 *           pnpm run generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing role/policy/collection/fields/permissions are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

// Fixed UUIDs — keep in sync with scripts/setup-directus-permissions.ts and
// nuxt.config.ts (directusRolePropertyManager).
const PROPERTY_MANAGER_ROLE = "b3c5a96f-ca24-41f1-8c1f-5683db384844";
const PROPERTY_MANAGER_POLICY = "e3459a90-725a-4861-82c4-c0047d961420";

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

// ============================================================================
// Generic helpers (mirrors create-requests-collections.ts)
// ============================================================================

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

// ============================================================================
// 1. Property Manager role + policy
// ============================================================================

async function createRoleAndPolicy(): Promise<void> {
  console.log("\n🎭 Property Manager role + policy...");

  // Policy first (role references it).
  let policyExists = false;
  try {
    await directusFetch(`/policies/${PROPERTY_MANAGER_POLICY}`);
    policyExists = true;
  } catch {
    /* create below */
  }
  if (policyExists) {
    console.log("   ⏭️  Policy already exists, skipping...");
  } else {
    await directusFetch("/policies", {
      method: "POST",
      body: JSON.stringify({
        id: PROPERTY_MANAGER_POLICY,
        name: "Property Manager Policy",
        icon: "manage_accounts",
        description: "Scoped access for external property-management staff (granted per-manager by the org admin).",
        admin_access: false,
        app_access: true,
      }),
    });
    console.log(`   ✅ Created policy: ${PROPERTY_MANAGER_POLICY}`);
  }

  let roleExists = false;
  try {
    await directusFetch(`/roles/${PROPERTY_MANAGER_ROLE}`);
    roleExists = true;
  } catch {
    /* create below */
  }
  if (roleExists) {
    console.log("   ⏭️  Role already exists, skipping...");
  } else {
    await directusFetch("/roles", {
      method: "POST",
      body: JSON.stringify({
        id: PROPERTY_MANAGER_ROLE,
        name: "Property Manager",
        icon: "manage_accounts",
        description: "External property-management company staff with admin-granted, org-scoped access.",
      }),
    });
    console.log(`   ✅ Created role: ${PROPERTY_MANAGER_ROLE}`);
  }

  // Link the policy to the role via the directus_access junction (the canonical,
  // token-friendly path — PATCHing the role's `policies` M2M alias is forbidden
  // for non-admin tokens). Idempotent: skip if a link already exists.
  const existingAccess = await directusFetch(
    `/access?filter=${encodeURIComponent(JSON.stringify({ role: { _eq: PROPERTY_MANAGER_ROLE }, policy: { _eq: PROPERTY_MANAGER_POLICY } }))}&fields=id&limit=1`
  );
  if (existingAccess?.data?.length) {
    console.log("   ⏭️  Policy already linked to role");
  } else {
    await directusFetch("/access", {
      method: "POST",
      body: JSON.stringify({ role: PROPERTY_MANAGER_ROLE, policy: PROPERTY_MANAGER_POLICY }),
    });
    console.log("   🔗 Linked policy to role");
  }
}

// ============================================================================
// 2. hoa_management_contacts collection
// ============================================================================

const KIND_CHOICES = [
  { text: "Rental / Sales", value: "rental_sales" },
  { text: "Violations / Management", value: "violations" },
  { text: "General", value: "general" },
];

async function createContactsCollection(): Promise<void> {
  console.log("\n📁 hoa_management_contacts collection...");

  await createCollection("hoa_management_contacts", {
    collection: "hoa_management_contacts",
    icon: "contact_phone",
    note: "External property-management company notification contacts (rental/sales, violations, general)",
    display_template: "{{name}} ({{kind}})",
  });

  await createField("hoa_management_contacts", "kind", {
    type: "string",
    schema: { default_value: "general", is_nullable: false },
    meta: { interface: "select-dropdown", display: "labels", width: "half", required: true, options: { choices: KIND_CHOICES }, note: "Which inquiries route to this contact" },
  });

  await createField("hoa_management_contacts", "status", {
    type: "string",
    schema: { default_value: "active" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: [{ text: "Active", value: "active" }, { text: "Inactive", value: "inactive" }] },
    },
  });

  await createField("hoa_management_contacts", "name", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half" },
  });

  await createField("hoa_management_contacts", "company", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });

  await createField("hoa_management_contacts", "email", {
    type: "string",
    meta: { interface: "input", width: "half", options: { placeholder: "name@company.com" } },
  });

  await createField("hoa_management_contacts", "phone", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });

  await createField("hoa_management_contacts", "notify_email", {
    type: "boolean",
    schema: { default_value: true },
    meta: { interface: "boolean", width: "half", note: "Send an email when a routed inquiry is submitted" },
  });

  await createField("hoa_management_contacts", "notify_inapp", {
    type: "boolean",
    schema: { default_value: true },
    meta: { interface: "boolean", width: "half", note: "Create an in-app notification (only if a user is linked)" },
  });

  await createField("hoa_management_contacts", "sort", {
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  // Optional links to a login user / member row (a contact may be a Property
  // Manager login, or just an email address with no account).
  await createField("hoa_management_contacts", "user", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user", note: "Optional: linked login user (for in-app notifications)" },
  });
  await createRelation({ collection: "hoa_management_contacts", field: "user", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });

  await createField("hoa_management_contacts", "hoa_member", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" }, note: "Optional: linked member row" },
  });
  await createRelation({ collection: "hoa_management_contacts", field: "hoa_member", related_collection: "hoa_members", schema: { on_delete: "SET NULL" } });

  // Organization (M2O, required, cascade)
  await createField("hoa_management_contacts", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({
    collection: "hoa_management_contacts",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await addSystemFields("hoa_management_contacts");
}

// ============================================================================
// 3 & 4. JSON config fields on existing collections
// ============================================================================

const DEFAULT_INQUIRY_ROUTING = {
  board_default: true,
  map: {
    maintenance: "general",
    arc: "rental_sales",
    complaint: "violations",
    violation: "violations",
  },
};

const DEFAULT_MANAGER_PERMISSIONS = {
  inquiries: false,
  violations: false,
  directory: false,
  documents: false,
  communications: false,
};

async function addConfigFields(): Promise<void> {
  console.log("\n🧩 Config fields...");

  await createField("hoa_organizations", "inquiry_routing", {
    type: "json",
    schema: { default_value: DEFAULT_INQUIRY_ROUTING },
    meta: {
      interface: "input-code",
      special: ["cast-json"],
      width: "full",
      note: "Inquiry → management-contact routing (managed from Settings → Property management). board_default notifies the board on every inquiry.",
      options: { language: "json" },
    },
  });

  await createField("hoa_members", "manager_permissions", {
    type: "json",
    schema: { default_value: DEFAULT_MANAGER_PERMISSIONS },
    meta: {
      interface: "input-code",
      special: ["cast-json"],
      width: "full",
      note: "Per-manager grant flags for Property Manager members (inquiries, violations, directory, documents, communications). Enforced app-side + in server routes.",
      options: { language: "json" },
    },
  });
}

// ============================================================================
// 5. Property Manager permissions for hoa_requests + hoa_comments
//    (these collections are NOT in setup-directus-permissions COLLECTION_CONFIGS)
// ============================================================================

async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  // Skip if a permission for this policy+collection+action already exists.
  try {
    const existing = await directusFetch(
      `/permissions?filter=${encodeURIComponent(JSON.stringify({ policy: { _eq: policy }, collection: { _eq: collection }, action: { _eq: action } }))}&fields=id&limit=1`
    );
    if (existing?.data?.length) {
      console.log(`      ⏭️  ${collection}.${action} (already exists)`);
      return;
    }
  } catch {
    /* fall through to create */
  }
  try {
    await directusFetch("/permissions", {
      method: "POST",
      body: JSON.stringify({ policy, collection, action, ...config }),
    });
    console.log(`      ✅ ${collection}.${action}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("409") || error.message.includes("unique")) {
      console.log(`      ⏭️  ${collection}.${action} (already exists)`);
    } else {
      console.log(`      ❌ ${collection}.${action}: ${error.message}`);
    }
  }
}

async function deletePermissionIfExists(policy: string, collection: string, action: string): Promise<void> {
  try {
    const existing = await directusFetch(
      `/permissions?filter=${encodeURIComponent(JSON.stringify({ policy: { _eq: policy }, collection: { _eq: collection }, action: { _eq: action } }))}&fields=id&limit=1`
    );
    const id = existing?.data?.[0]?.id;
    if (id) {
      await directusFetch(`/permissions/${id}`, { method: "DELETE" });
      console.log(`      🗑️  removed ${collection}.${action}`);
    }
  } catch {
    /* nothing to remove */
  }
}

async function setupManagerRequestPermissions(): Promise<void> {
  console.log("\n🔐 Property Manager permissions for hoa_requests / hoa_comments...");

  // Org-scoped ceiling: a manager sees/acts on requests in any org they are an
  // active member of. Per-manager grants (inquiries vs violations) are enforced
  // app-side + in server routes, not here.
  const orgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };

  // hoa_requests: read all org + update (respond to / progress inquiries).
  // Managers do NOT get direct create — creating a violation is a gated action
  // routed through /api/hoa/requests/manager-create (checks the per-manager
  // "violations" grant). Remove any stale create perm from earlier runs.
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_requests", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_requests", "update", { permissions: orgFilter, validation: orgFilter, fields: ["*"] });
  await deletePermissionIfExists(PROPERTY_MANAGER_POLICY, "hoa_requests", "create");

  // hoa_comments: respond to inquiries — read org thread, create, edit own. No delete.
  const commentOrgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };
  const commentOwnFilter = {
    _and: [commentOrgFilter, { user_created: { _eq: "$CURRENT_USER" } }],
  };
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_comments", "read", { permissions: { _and: [commentOrgFilter, { status: { _neq: "deleted" } }] }, validation: null, fields: ["*"] });
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_comments", "create", { permissions: {}, validation: commentOrgFilter, fields: ["*"] });
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_comments", "update", {
    permissions: commentOwnFilter,
    validation: commentOwnFilter,
    fields: ["body", "attachments", "is_edited", "status", "mentioned_users"],
  });

  // hoa_reactions: react in threads (org-scoped read/create, delete own).
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_reactions", "read", { permissions: commentOrgFilter, validation: null, fields: ["*"] });
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_reactions", "create", { permissions: {}, validation: commentOrgFilter, fields: ["*"] });
  await postPermission(PROPERTY_MANAGER_POLICY, "hoa_reactions", "delete", { permissions: { _and: [commentOrgFilter, { user: { _eq: "$CURRENT_USER" } }] }, validation: null, fields: ["*"] });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("🚀 Property management setup (role, contacts, routing, grants)...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createRoleAndPolicy();
    await createContactsCollection();
    await addConfigFields();
    await setupManagerRequestPermissions();
    console.log("\n✅ Property management setup complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm run setup:permissions` (fills the PM policy's collection perms)");
    console.log("   2. Run `pnpm generate:types` to refresh types/directus.ts");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
