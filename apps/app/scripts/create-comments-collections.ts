/**
 * Script to create Directus collections for the universal comments + reactions
 * rails (Phase 5).
 *
 * Creates:
 * - hoa_comments: polymorphic threaded comments (target_collection + target_id),
 *   rich-text body, attachments JSON, is_internal (board-only notes),
 *   mentioned_users JSON, soft-delete via status, organization tenancy.
 * - hoa_reactions: polymorphic emoji reactions on comments OR any entity.
 *
 * A comment is just a channel message scoped to an arbitrary entity instead of
 * a channel — this mirrors the hoa_channel_* shape so every entity in the app
 * (announcements, documents, meetings, requests, payment_requests) gets a
 * conversation + reactions for free, gated by role.
 *
 * Run with: pnpm run create:comments
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

async function directusFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
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

async function createCollection(
  collection: string,
  meta: Record<string, any>,
  collectionSchema: Record<string, any> = {}
): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection, ...collectionSchema },
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

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
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
    await directusFetch("/relations", {
      method: "POST",
      body: JSON.stringify(relationConfig),
    });
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

async function addSystemFields(collection: string): Promise<void> {
  await createField(collection, "user_created", {
    type: "uuid",
    meta: {
      special: ["user-created"],
      interface: "select-dropdown-m2o",
      display: "user",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users" });

  await createField(collection, "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });

  await createField(collection, "user_updated", {
    type: "uuid",
    meta: {
      special: ["user-updated"],
      interface: "select-dropdown-m2o",
      display: "user",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
  await createRelation({ collection, field: "user_updated", related_collection: "directus_users" });

  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: {
      special: ["date-updated"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
}

async function addOrganizationField(collection: string): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
    },
  });
  await createRelation({
    collection,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
}

const COMMENT_STATUS_CHOICES = [
  { text: "Published", value: "published", color: "var(--theme--success)" },
  { text: "Draft", value: "draft", color: "var(--theme--warning)" },
  { text: "Deleted", value: "deleted", color: "var(--theme--danger)" },
];

// ============================================
// hoa_comments
// ============================================
async function createCommentsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_comments collection...");

  await createCollection("hoa_comments", {
    collection: "hoa_comments",
    icon: "comment",
    note: "Polymorphic threaded comments on any entity (target_collection + target_id)",
    display_template: "{{target_collection}} · {{body}}",
    sort_field: "sort",
  });

  await createField("hoa_comments", "sort", {
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  await createField("hoa_comments", "status", {
    type: "string",
    schema: { default_value: "published" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: COMMENT_STATUS_CHOICES },
    },
  });

  await createField("hoa_comments", "target_collection", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "e.g. hoa_announcements, hoa_requests, hoa_documents, hoa_meetings, payment_requests",
    },
  });

  await createField("hoa_comments", "target_id", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "id of the target row (string to tolerate uuid/int pks)",
    },
  });

  // Threaded replies — self-referential M2O
  await createField("hoa_comments", "parent_comment", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      note: "Parent comment for threaded replies",
    },
  });
  await createRelation({
    collection: "hoa_comments",
    field: "parent_comment",
    related_collection: "hoa_comments",
    schema: { on_delete: "CASCADE" },
  });

  await createField("hoa_comments", "body", {
    type: "text",
    meta: {
      interface: "input-rich-text-html",
      width: "full",
      note: "HTML with @mentions (TipTap), same as channel messages",
    },
  });

  await createField("hoa_comments", "attachments", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, width: "full", note: "Array of file IDs" },
  });

  await createField("hoa_comments", "mentioned_users", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, width: "full", note: "Array of mentioned user IDs" },
  });

  await createField("hoa_comments", "is_edited", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half" },
  });

  await createField("hoa_comments", "is_internal", {
    type: "boolean",
    schema: { default_value: false },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Board/admin-only note — hidden from members",
    },
  });

  // --- Moderation fields ---
  await createField("hoa_comments", "is_hidden", {
    type: "boolean",
    schema: { default_value: false },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Hidden by a moderator — not shown to members",
    },
  });

  await createField("hoa_comments", "hidden_reason", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Why the comment was hidden" },
  });

  await createField("hoa_comments", "hidden_by", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      display: "user",
      width: "half",
      note: "Moderator who hid the comment",
    },
  });
  await createRelation({
    collection: "hoa_comments",
    field: "hidden_by",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_comments", "report_count", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", readonly: true, note: "Open report count (denormalized)" },
  });

  await addOrganizationField("hoa_comments");
  await addSystemFields("hoa_comments");
}

// ============================================
// hoa_comment_reports — member-filed reports on a comment
// ============================================
const REPORT_STATUS_CHOICES = [
  { text: "Open", value: "open", color: "var(--theme--warning)" },
  { text: "Reviewed", value: "reviewed", color: "var(--theme--primary)" },
  { text: "Dismissed", value: "dismissed", color: "var(--theme--foreground-subdued)" },
  { text: "Actioned", value: "actioned", color: "var(--theme--success)" },
];

const REPORT_REASON_CHOICES = [
  { text: "Vulgar / offensive", value: "vulgar" },
  { text: "Harassment", value: "harassment" },
  { text: "Spam", value: "spam" },
  { text: "Off-topic", value: "off_topic" },
  { text: "Other", value: "other" },
];

async function createReportsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_comment_reports collection...");

  await createCollection("hoa_comment_reports", {
    collection: "hoa_comment_reports",
    icon: "flag",
    note: "Member-filed reports on a comment, for the moderation queue",
    display_template: "{{reason}} · {{status}}",
  });

  await createField("hoa_comment_reports", "status", {
    type: "string",
    schema: { default_value: "open" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: REPORT_STATUS_CHOICES } },
  });

  await createField("hoa_comment_reports", "reason", {
    type: "string",
    schema: { is_nullable: false, default_value: "vulgar" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", required: true, options: { choices: REPORT_REASON_CHOICES } },
  });

  await createField("hoa_comment_reports", "details", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Optional context from the reporter" },
  });

  // The reported comment (M2O)
  await createField("hoa_comment_reports", "comment", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values" },
  });
  await createRelation({
    collection: "hoa_comment_reports",
    field: "comment",
    related_collection: "hoa_comments",
    schema: { on_delete: "CASCADE" },
  });

  await createField("hoa_comment_reports", "reporter", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", width: "half", special: ["user-created"] },
  });
  await createRelation({
    collection: "hoa_comment_reports",
    field: "reporter",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_comment_reports", "resolution_note", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Moderator note on resolution" },
  });

  await addOrganizationField("hoa_comment_reports");
  await addSystemFields("hoa_comment_reports");
}

// ============================================
// hoa_reactions
// ============================================
async function createReactionsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_reactions collection...");

  await createCollection("hoa_reactions", {
    collection: "hoa_reactions",
    icon: "mood",
    note: "Polymorphic emoji reactions on comments OR any entity",
    display_template: "{{emoji}} · {{target_collection}}",
  });

  await createField("hoa_reactions", "target_collection", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "hoa_comments (react to a comment) or any entity",
    },
  });

  await createField("hoa_reactions", "target_id", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half" },
  });

  await createField("hoa_reactions", "emoji", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "Unicode emoji or shortcode" },
  });

  await createField("hoa_reactions", "user", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "user",
      special: ["user-created"],
      note: "Reacting user",
    },
  });
  await createRelation({
    collection: "hoa_reactions",
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "CASCADE" },
  });

  await addOrganizationField("hoa_reactions");

  await createField("hoa_reactions", "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
}

// ============================================
// Permissions (org-scoped; is_internal board-only for members)
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
        typeof response.data[0].policy === "string"
          ? response.data[0].policy
          : response.data[0].policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
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

  // Org scoping goes through the user's memberships — directus_users has NO
  // `organization` field, so `$CURRENT_USER.organization` makes Directus 500 the
  // whole read ("permission to access field \"organization\" in collection
  // \"directus_users\""). Same idiom as setup-directus-permissions.ts.
  const orgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };
  // Members never see internal comments, and don't see others' hidden comments
  // — but the AUTHOR can still see their own comment after it's hidden.
  const memberReadFilter = {
    _and: [
      { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
      { is_internal: { _eq: false } },
      { status: { _neq: "deleted" } },
      {
        _or: [
          { is_hidden: { _neq: true } },
          { user_created: { _eq: "$CURRENT_USER" } },
        ],
      },
    ],
  };
  // Members may only edit/delete their own comments
  const memberOwnFilter = {
    _and: [
      { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
      { user_created: { _eq: "$CURRENT_USER" } },
    ],
  };

  const collections = [
    {
      collection: "hoa_comments",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: orgFilter, validation: orgFilter, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        create: { permissions: {}, validation: { _and: [orgFilter, { is_internal: { _eq: false } }] }, fields: ["*"] },
        read: { permissions: memberReadFilter, validation: null, fields: ["*"] },
        update: { permissions: memberOwnFilter, validation: memberOwnFilter, fields: ["body", "attachments", "is_edited", "status", "mentioned_users"] },
        delete: { permissions: memberOwnFilter, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_reactions",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        delete: { permissions: { _and: [orgFilter, { user: { _eq: "$CURRENT_USER" } }] }, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_comment_reports",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: orgFilter, validation: orgFilter, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        // Members may file a report and read only their own.
        create: {
          permissions: {},
          validation: { _and: [orgFilter, { reporter: { _eq: "$CURRENT_USER" } }] },
          fields: ["*"],
        },
        read: {
          permissions: { _and: [orgFilter, { reporter: { _eq: "$CURRENT_USER" } }] },
          validation: null,
          fields: ["*"],
        },
      },
    },
  ];

  for (const { collection, adminPermissions, memberPermissions } of collections) {
    if (adminPolicy) {
      console.log(`\n   📋 ${collection} permissions for HOA Admin...`);
      for (const [action, cfg] of Object.entries(adminPermissions)) {
        await postPermission(adminPolicy.id, collection, action, cfg);
      }
    }
    if (memberPolicy) {
      console.log(`\n   📋 ${collection} permissions for HOA Member...`);
      for (const [action, cfg] of Object.entries(memberPermissions)) {
        await postPermission(memberPolicy.id, collection, action, cfg);
      }
    }
  }
}

async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  // Upsert, don't skip: a row that already exists may hold a STALE filter (this
  // script shipped `$CURRENT_USER.organization` once, which 500s every read —
  // see the orgFilter note above). Skipping on conflict left prod broken and
  // un-repairable by re-running, so patch the existing row instead.
  const existing = await directusFetch(
    `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&fields=id&limit=1`
  );
  const current = existing?.data?.[0];

  try {
    if (current) {
      await directusFetch(`/permissions/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      console.log(`      ♻️  ${action} (updated)`);
      return;
    }
    await directusFetch("/permissions", {
      method: "POST",
      body: JSON.stringify({ policy, collection, action, ...config }),
    });
    console.log(`      ✅ ${action}`);
  } catch (error: any) {
    console.log(`      ❌ ${action}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Creating Directus collections for comments + reactions...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createCommentsCollection();
    await createReactionsCollection();
    await createReportsCollection();
    await setupPermissions();
    console.log("\n✅ Comments + reactions + reports collections and permissions complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. Drop CommentThread + ReactionBar onto an entity detail view");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
