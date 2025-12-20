/**
 * Migration script to create email activity tracking collections in Directus
 *
 * Run with: npx tsx scripts/migrate-email-activity.ts
 *
 * Required environment variables:
 * - DIRECTUS_URL: Your Directus instance URL
 * - DIRECTUS_STATIC_TOKEN: Admin token with schema permissions
 */

import { createDirectus, rest, staticToken } from "@directus/sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   DIRECTUS_URL and DIRECTUS_STATIC_TOKEN are required");
  process.exit(1);
}

const directus = createDirectus(DIRECTUS_URL)
  .with(rest())
  .with(staticToken(DIRECTUS_STATIC_TOKEN));

// Helper to make schema API calls
async function schemaRequest(method: string, path: string, body?: any) {
  const url = `${DIRECTUS_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} - ${error}`);
  }

  return response.json();
}

// Check if a collection exists
async function collectionExists(collection: string): Promise<boolean> {
  try {
    await schemaRequest("GET", `/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

// Check if a field exists
async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await schemaRequest("GET", `/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function createEmailActivityCollection() {
  const collectionName = "hoa_email_activity";

  if (await collectionExists(collectionName)) {
    console.log(`⏭️  Collection "${collectionName}" already exists, skipping...`);
    return;
  }

  console.log(`📦 Creating collection: ${collectionName}`);

  // Create the collection
  await schemaRequest("POST", "/collections", {
    collection: collectionName,
    meta: {
      collection: collectionName,
      icon: "analytics",
      note: "Tracks SendGrid email activity events (opens, clicks, bounces, etc.)",
      hidden: false,
      singleton: false,
      accountability: "all",
      sort_field: null,
      archive_field: null,
      archive_value: null,
      unarchive_value: null,
    },
    schema: {
      name: collectionName,
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: {
          hidden: true,
          interface: "input",
          readonly: true,
          special: ["uuid"],
        },
        schema: {
          is_primary_key: true,
          has_auto_increment: false,
        },
      },
      {
        field: "user_created",
        type: "uuid",
        meta: {
          special: ["user-created"],
          interface: "select-dropdown-m2o",
          options: {
            template: "{{first_name}} {{last_name}}",
          },
          display: "user",
          readonly: true,
          hidden: true,
          width: "half",
        },
        schema: {},
      },
      {
        field: "date_created",
        type: "timestamp",
        meta: {
          special: ["date-created"],
          interface: "datetime",
          readonly: true,
          hidden: true,
          width: "half",
          display: "datetime",
          display_options: {
            relative: true,
          },
        },
        schema: {},
      },
      {
        field: "event",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "Processed", value: "processed" },
              { text: "Dropped", value: "dropped" },
              { text: "Delivered", value: "delivered" },
              { text: "Deferred", value: "deferred" },
              { text: "Bounce", value: "bounce" },
              { text: "Open", value: "open" },
              { text: "Click", value: "click" },
              { text: "Spam Report", value: "spam_report" },
              { text: "Unsubscribe", value: "unsubscribe" },
              { text: "Group Unsubscribe", value: "group_unsubscribe" },
              { text: "Group Resubscribe", value: "group_resubscribe" },
            ],
          },
          display: "labels",
          display_options: {
            choices: [
              { text: "Open", value: "open", foreground: "#1E40AF", background: "#DBEAFE" },
              { text: "Click", value: "click", foreground: "#7C3AED", background: "#EDE9FE" },
              { text: "Delivered", value: "delivered", foreground: "#059669", background: "#D1FAE5" },
              { text: "Bounce", value: "bounce", foreground: "#EA580C", background: "#FFEDD5" },
              { text: "Dropped", value: "dropped", foreground: "#DC2626", background: "#FEE2E2" },
            ],
          },
          required: true,
          width: "half",
        },
        schema: {
          is_nullable: false,
        },
      },
      {
        field: "email",
        type: "string",
        meta: {
          interface: "input",
          display: "formatted-value",
          width: "half",
          note: "Email address this event relates to",
        },
        schema: {
          max_length: 255,
        },
      },
      {
        field: "sg_message_id",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "SendGrid message ID for correlation",
        },
        schema: {
          max_length: 255,
        },
      },
      {
        field: "clicked_url",
        type: "text",
        meta: {
          interface: "input",
          width: "full",
          note: "URL that was clicked (for click events)",
        },
        schema: {},
      },
      {
        field: "user_agent",
        type: "text",
        meta: {
          interface: "input",
          width: "half",
          hidden: true,
        },
        schema: {},
      },
      {
        field: "ip",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          hidden: true,
        },
        schema: {
          max_length: 45,
        },
      },
      {
        field: "reason",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          note: "Bounce/drop reason",
        },
        schema: {},
      },
      {
        field: "event_timestamp",
        type: "bigInteger",
        meta: {
          interface: "input",
          width: "half",
          note: "Raw event timestamp from SendGrid (Unix timestamp)",
        },
        schema: {},
      },
    ],
  });

  // Create relations after collection is created
  console.log(`🔗 Creating relations for ${collectionName}...`);

  // Relation to hoa_email_recipients
  await schemaRequest("POST", "/relations", {
    collection: collectionName,
    field: "email_recipient",
    related_collection: "hoa_email_recipients",
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: "nullify",
    },
    schema: {
      on_delete: "SET NULL",
    },
  });

  // Create the email_recipient field
  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "email_recipient",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      display: "related-values",
      display_options: {
        template: "{{recipient_email}}",
      },
      width: "half",
    },
    schema: {},
  });

  // Relation to hoa_members
  await schemaRequest("POST", "/relations", {
    collection: collectionName,
    field: "member",
    related_collection: "hoa_members",
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: "nullify",
    },
    schema: {
      on_delete: "SET NULL",
    },
  });

  // Create the member field
  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "member",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      display: "related-values",
      display_options: {
        template: "{{first_name}} {{last_name}}",
      },
      width: "half",
    },
    schema: {},
  });

  console.log(`✅ Created collection: ${collectionName}`);
}

async function createMailingListsCollection() {
  const collectionName = "hoa_mailing_lists";

  if (await collectionExists(collectionName)) {
    console.log(`⏭️  Collection "${collectionName}" already exists, skipping...`);
    return;
  }

  console.log(`📦 Creating collection: ${collectionName}`);

  await schemaRequest("POST", "/collections", {
    collection: collectionName,
    meta: {
      collection: collectionName,
      icon: "contact_mail",
      note: "Custom mailing lists for email campaigns",
      hidden: false,
      singleton: false,
      accountability: "all",
    },
    schema: {
      name: collectionName,
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: {
          hidden: true,
          interface: "input",
          readonly: true,
          special: ["uuid"],
        },
        schema: {
          is_primary_key: true,
          has_auto_increment: false,
        },
      },
      {
        field: "status",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "Published", value: "published" },
              { text: "Draft", value: "draft" },
              { text: "Archived", value: "archived" },
            ],
          },
          display: "labels",
          display_options: {
            choices: [
              { text: "Published", value: "published", foreground: "#FFFFFF", background: "#22C55E" },
              { text: "Draft", value: "draft", foreground: "#78716C", background: "#F5F5F4" },
              { text: "Archived", value: "archived", foreground: "#FFFFFF", background: "#A8A29E" },
            ],
          },
          default_value: "draft",
          width: "half",
        },
        schema: {
          default_value: "draft",
        },
      },
      {
        field: "sort",
        type: "integer",
        meta: {
          interface: "input",
          hidden: true,
        },
        schema: {},
      },
      {
        field: "user_created",
        type: "uuid",
        meta: {
          special: ["user-created"],
          interface: "select-dropdown-m2o",
          readonly: true,
          hidden: true,
          width: "half",
        },
        schema: {},
      },
      {
        field: "date_created",
        type: "timestamp",
        meta: {
          special: ["date-created"],
          interface: "datetime",
          readonly: true,
          hidden: true,
          width: "half",
        },
        schema: {},
      },
      {
        field: "user_updated",
        type: "uuid",
        meta: {
          special: ["user-updated"],
          interface: "select-dropdown-m2o",
          readonly: true,
          hidden: true,
          width: "half",
        },
        schema: {},
      },
      {
        field: "date_updated",
        type: "timestamp",
        meta: {
          special: ["date-updated"],
          interface: "datetime",
          readonly: true,
          hidden: true,
          width: "half",
        },
        schema: {},
      },
      {
        field: "name",
        type: "string",
        meta: {
          interface: "input",
          required: true,
          width: "half",
        },
        schema: {
          is_nullable: false,
          max_length: 255,
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
        },
        schema: {},
      },
      {
        field: "filter_type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "All Members", value: "all" },
              { text: "Owners Only", value: "owners" },
              { text: "Tenants Only", value: "tenants" },
              { text: "Custom", value: "custom" },
            ],
          },
          display: "labels",
          width: "half",
          note: "Filter type for auto-populating members",
        },
        schema: {},
      },
      {
        field: "filter_criteria",
        type: "json",
        meta: {
          interface: "input-code",
          options: {
            language: "json",
          },
          width: "full",
          hidden: true,
          note: "Custom filter criteria (for custom filter type)",
        },
        schema: {},
      },
      {
        field: "member_count",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "Cached member count",
        },
        schema: {
          default_value: 0,
        },
      },
    ],
  });

  // Create relation to organization
  await schemaRequest("POST", "/relations", {
    collection: collectionName,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: "nullify",
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "organization",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      display: "related-values",
      display_options: {
        template: "{{name}}",
      },
      width: "half",
    },
    schema: {},
  });

  console.log(`✅ Created collection: ${collectionName}`);
}

async function createMailingListMembersCollection() {
  const collectionName = "hoa_mailing_list_members";

  if (await collectionExists(collectionName)) {
    console.log(`⏭️  Collection "${collectionName}" already exists, skipping...`);
    return;
  }

  console.log(`📦 Creating collection: ${collectionName}`);

  await schemaRequest("POST", "/collections", {
    collection: collectionName,
    meta: {
      collection: collectionName,
      icon: "group_add",
      note: "Junction table for mailing list membership",
      hidden: true,
      singleton: false,
      accountability: "all",
    },
    schema: {
      name: collectionName,
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: {
          hidden: true,
          interface: "input",
          readonly: true,
          special: ["uuid"],
        },
        schema: {
          is_primary_key: true,
          has_auto_increment: false,
        },
      },
      {
        field: "user_created",
        type: "uuid",
        meta: {
          special: ["user-created"],
          interface: "select-dropdown-m2o",
          readonly: true,
          hidden: true,
        },
        schema: {},
      },
      {
        field: "date_created",
        type: "timestamp",
        meta: {
          special: ["date-created"],
          interface: "datetime",
          readonly: true,
          hidden: true,
        },
        schema: {},
      },
    ],
  });

  // Create relation to mailing_list
  await schemaRequest("POST", "/relations", {
    collection: collectionName,
    field: "mailing_list",
    related_collection: "hoa_mailing_lists",
    meta: {
      one_field: "members",
      sort_field: null,
      one_deselect_action: "nullify",
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "mailing_list",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      hidden: true,
    },
    schema: {},
  });

  // Create relation to member
  await schemaRequest("POST", "/relations", {
    collection: collectionName,
    field: "member",
    related_collection: "hoa_members",
    meta: {
      one_field: null,
      sort_field: null,
      one_deselect_action: "nullify",
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "member",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      display: "related-values",
      display_options: {
        template: "{{first_name}} {{last_name}}",
      },
    },
    schema: {},
  });

  // Add O2M field to hoa_mailing_lists for the members relation
  await schemaRequest("POST", "/fields/hoa_mailing_lists", {
    field: "members",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      display: "related-values",
      display_options: {
        template: "{{member.first_name}} {{member.last_name}}",
      },
    },
  });

  console.log(`✅ Created collection: ${collectionName}`);
}

async function addSgMessageIdToRecipients() {
  const collection = "hoa_email_recipients";
  const field = "sg_message_id";

  if (await fieldExists(collection, field)) {
    console.log(`⏭️  Field "${collection}.${field}" already exists, skipping...`);
    return;
  }

  console.log(`📝 Adding field: ${collection}.${field}`);

  await schemaRequest("POST", `/fields/${collection}`, {
    field: field,
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "SendGrid message ID for tracking",
      hidden: true,
    },
    schema: {
      max_length: 255,
    },
  });

  console.log(`✅ Added field: ${collection}.${field}`);
}

async function main() {
  console.log("🚀 Starting email activity migration...\n");

  try {
    // Add sg_message_id to existing recipients collection
    await addSgMessageIdToRecipients();

    // Create new collections
    await createEmailActivityCollection();
    await createMailingListsCollection();
    await createMailingListMembersCollection();

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📋 Collections created:");
    console.log("   - hoa_email_activity (SendGrid event tracking)");
    console.log("   - hoa_mailing_lists (Custom mailing lists)");
    console.log("   - hoa_mailing_list_members (Junction table)");
    console.log("\n📝 Fields added:");
    console.log("   - hoa_email_recipients.sg_message_id");
    console.log("\n⚠️  Don't forget to:");
    console.log("   1. Set up SendGrid webhook URL: YOUR_URL/api/email/activity");
    console.log("   2. Enable event types in SendGrid: opens, clicks, bounces, delivered, etc.");
    console.log("   3. Configure permissions for new collections in Directus");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
