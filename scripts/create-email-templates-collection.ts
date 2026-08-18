/**
 * Phase 9 (Stage B) — create the reusable email template library.
 *
 * Creates:
 * - hoa_email_templates: saved, reusable email templates (per-org, or global
 *   when `organization` is null). Used by the Communications composer to
 *   "start from a template" and "save as template".
 *
 * Also adds:
 * - hoa_emails.template: optional M2O provenance link to the template an email
 *   was created from.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Run with: pnpm run create:email-templates
 *
 * Prerequisites:
 * - DIRECTUS_URL in .env
 * - DIRECTUS_STATIC_TOKEN in .env (admin token)
 */

import { createDirectus, rest, staticToken } from "@directus/sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

createDirectus(DIRECTUS_URL).with(staticToken(DIRECTUS_STATIC_TOKEN)).with(rest());

// Email type choices (kept in sync with server/utils/email-templates-mjml.ts)
const EMAIL_TYPE_CHOICES = [
  { text: "Basic", value: "basic" },
  { text: "Alert", value: "alert", color: "var(--theme--danger)" },
  { text: "Newsletter", value: "newsletter" },
  { text: "Announcement", value: "announcement" },
  { text: "Reminder", value: "reminder" },
  { text: "Notice", value: "notice" },
];

// ---------------------------------------------------------------------------
// Low-level helpers (mirrors scripts/create-channels-collections.ts)
// ---------------------------------------------------------------------------

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
  // DELETE / empty responses
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
    // doesn't exist — create
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

// System audit fields shared by most collections
async function addAuditFields(collection: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// hoa_email_templates
// ---------------------------------------------------------------------------

async function createEmailTemplatesCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_email_templates collection...");

  await createCollection("hoa_email_templates", {
    collection: "hoa_email_templates",
    icon: "drafts",
    note: "Reusable email templates for the Communications composer (org-scoped, or global when organization is empty)",
    display_template: "{{name}}",
    archive_field: "status",
    archive_value: "archived",
    unarchive_value: "published",
    sort_field: "sort",
  });

  await createField("hoa_email_templates", "status", {
    type: "string",
    schema: { default_value: "published" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Published", value: "published", color: "var(--theme--success)" },
          { text: "Draft", value: "draft", color: "var(--theme--warning)" },
          { text: "Archived", value: "archived", color: "var(--theme--danger)" },
        ],
      },
    },
  });

  await createField("hoa_email_templates", "sort", {
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  await createField("hoa_email_templates", "name", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "Template name shown in the picker" },
  });

  await createField("hoa_email_templates", "email_type", {
    type: "string",
    schema: { default_value: "basic" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: EMAIL_TYPE_CHOICES },
      note: "Which email type this template seeds",
    },
  });

  await createField("hoa_email_templates", "description", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Short description shown in the template library" },
  });

  await createField("hoa_email_templates", "subject", {
    type: "string",
    meta: { interface: "input", width: "full", note: "Default subject (merge fields like {{first_name}} allowed)" },
  });

  await createField("hoa_email_templates", "content_mode", {
    type: "string",
    schema: { default_value: "visual" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Visual", value: "visual" },
          { text: "MJML / HTML", value: "mjml" },
        ],
      },
      note: "How `content` should be interpreted by the renderer",
    },
  });

  await createField("hoa_email_templates", "include_board_footer", {
    type: "boolean",
    schema: { default_value: true },
    meta: { interface: "boolean", width: "half", note: "Default board-footer toggle" },
  });

  await createField("hoa_email_templates", "content", {
    type: "text",
    meta: { interface: "input-rich-text-html", width: "full", note: "Template body (HTML, or raw MJML when content_mode = mjml)" },
  });

  await createField("hoa_email_templates", "greeting", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Default greeting, e.g. Hello {{first_name}}," },
  });

  await createField("hoa_email_templates", "salutation", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Default closing salutation" },
  });

  // Organization relation — NULLABLE: a null org means a global/system template.
  await createField("hoa_email_templates", "organization", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
      note: "Owning organization (leave empty for a global template)",
    },
  });
  await createRelation({
    collection: "hoa_email_templates",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await addAuditFields("hoa_email_templates");
}

// ---------------------------------------------------------------------------
// hoa_emails.template (provenance link)
// ---------------------------------------------------------------------------

async function addTemplateLinkToEmails(): Promise<void> {
  console.log("\n📁 Adding hoa_emails.template provenance link...");
  await createField("hoa_emails", "template", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
      note: "Template this email was created from (optional)",
    },
  });
  await createRelation({
    collection: "hoa_emails",
    field: "template",
    related_collection: "hoa_email_templates",
    meta: { sort_field: null },
    schema: { on_delete: "SET NULL" },
  });
}

// ---------------------------------------------------------------------------
// Permissions (policy-based — mirrors create-channels-collections.ts)
// ---------------------------------------------------------------------------

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
      const accessEntry = response.data[0];
      const policyId = typeof accessEntry.policy === "string" ? accessEntry.policy : accessEntry.policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    const byName = await directusFetch(
      `/policies?filter=${JSON.stringify({ name: { _icontains: roleName } })}&fields=id,name&limit=1`
    );
    if (byName.data && byName.data.length > 0) return byName.data[0] as Policy;
    return null;
  } catch (error: any) {
    console.log(`   ⚠️  Error looking up policy for ${roleName}:`, error.message);
    return null;
  }
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Setting up permissions for hoa_email_templates...");

  const roles = await getRoles();
  if (roles.length === 0) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions — set them up manually.");
    return;
  }

  const adminRole = roles.find((r) => r.name === "HOA Admin");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;

  if (!adminPolicy) {
    console.log("   ⚠️  No HOA Admin policy found. Set template permissions manually in Directus.");
    return;
  }

  // Org admins manage their own org's templates; global (null-org) templates are read-only to them.
  const ownOrgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };
  const readFilter = { _or: [ownOrgFilter, { organization: { _null: true } }] };

  // Members never author communications → no template permissions.
  const adminPermissions: Record<string, any> = {
    create: { permissions: {}, validation: ownOrgFilter, fields: ["*"] },
    read: { permissions: readFilter, validation: null, fields: ["*"] },
    update: { permissions: ownOrgFilter, validation: null, fields: ["*"] },
    delete: { permissions: ownOrgFilter, validation: null, fields: ["*"] },
  };

  console.log(`\n   📋 hoa_email_templates permissions for HOA Admin...`);
  for (const [action, config] of Object.entries(adminPermissions)) {
    try {
      await directusFetch("/permissions", {
        method: "POST",
        body: JSON.stringify({ policy: adminPolicy.id, collection: "hoa_email_templates", action, ...config }),
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
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🚀 Creating Directus collection: hoa_email_templates\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    await createEmailTemplatesCollection();
    await addTemplateLinkToEmails();
    await setupPermissions();

    console.log("\n✅ Done.");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. Review hoa_email_templates in Directus Admin");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
