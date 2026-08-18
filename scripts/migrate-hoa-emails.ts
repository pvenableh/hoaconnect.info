/**
 * Migration script to create the hoa_emails collection in Directus
 *
 * Run with: npx tsx scripts/migrate-hoa-emails.ts
 *
 * Required environment variables:
 * - DIRECTUS_URL: Your Directus instance URL
 * - DIRECTUS_STATIC_TOKEN: Admin token with schema permissions
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   DIRECTUS_URL and DIRECTUS_STATIC_TOKEN are required");
  process.exit(1);
}

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

async function createHoaEmailsCollection() {
  const collectionName = "hoa_emails";

  if (await collectionExists(collectionName)) {
    console.log(
      `⏭️  Collection "${collectionName}" already exists, skipping...`
    );
    return;
  }

  console.log(`📦 Creating collection: ${collectionName}`);

  // Create the collection with base fields
  await schemaRequest("POST", "/collections", {
    collection: collectionName,
    meta: {
      collection: collectionName,
      icon: "mail",
      note: "Email campaigns and announcements sent to members",
      hidden: false,
      singleton: false,
      accountability: "all",
      display_template: "{{subject}}",
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
              { text: "Draft", value: "draft" },
              { text: "Scheduled", value: "scheduled" },
              { text: "Sending", value: "sending" },
              { text: "Sent", value: "sent" },
              { text: "Failed", value: "failed" },
            ],
          },
          display: "labels",
          display_options: {
            choices: [
              {
                text: "Draft",
                value: "draft",
                foreground: "#FFFFFF",
                background: "#6B7280",
              },
              {
                text: "Scheduled",
                value: "scheduled",
                foreground: "#FFFFFF",
                background: "#3B82F6",
              },
              {
                text: "Sending",
                value: "sending",
                foreground: "#FFFFFF",
                background: "#F59E0B",
              },
              {
                text: "Sent",
                value: "sent",
                foreground: "#FFFFFF",
                background: "#10B981",
              },
              {
                text: "Failed",
                value: "failed",
                foreground: "#FFFFFF",
                background: "#EF4444",
              },
            ],
          },
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
      // Email content fields
      {
        field: "subject",
        type: "string",
        meta: {
          interface: "input",
          required: true,
          width: "full",
          note: "Email subject line",
        },
        schema: {
          is_nullable: false,
          max_length: 255,
        },
      },
      {
        field: "content",
        type: "text",
        meta: {
          interface: "input-rich-text-html",
          required: true,
          width: "full",
          note: "Email body content (HTML supported)",
        },
        schema: {
          is_nullable: false,
        },
      },
      {
        field: "email_type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          required: true,
          options: {
            choices: [
              { text: "Basic", value: "basic" },
              { text: "Newsletter", value: "newsletter" },
              { text: "Announcement", value: "announcement" },
              { text: "Reminder", value: "reminder" },
              { text: "Notice", value: "notice" },
            ],
          },
          display: "labels",
          width: "half",
          note: "Type of email for categorization",
        },
        schema: {
          is_nullable: false,
          default_value: "basic",
        },
      },
      // Scheduling fields
      {
        field: "scheduled_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          width: "half",
          note: "When to send the email (leave empty for immediate send)",
        },
        schema: {},
      },
      {
        field: "sent_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          note: "When the email was actually sent",
        },
        schema: {},
      },
      // Personalization fields
      {
        field: "greeting",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "Greeting template with {{first_name}} placeholder (e.g., 'Hello {{first_name}},')",
          options: {
            placeholder: "Hello {{first_name}},",
          },
        },
        schema: {
          max_length: 255,
        },
      },
      {
        field: "salutation",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "Custom salutation for footer (e.g., 'Warm regards', 'Best wishes')",
          options: {
            placeholder: "Best regards,",
          },
        },
        schema: {
          max_length: 255,
        },
      },
      {
        field: "include_board_footer",
        type: "boolean",
        meta: {
          interface: "boolean",
          width: "half",
          note: "Whether to include board members in footer",
        },
        schema: {
          default_value: false,
        },
      },
      // Tracking/analytics fields
      {
        field: "recipient_count",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "third",
          note: "Total recipients count",
        },
        schema: {
          default_value: 0,
        },
      },
      {
        field: "delivered_count",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "third",
          note: "Delivered count",
        },
        schema: {
          default_value: 0,
        },
      },
      {
        field: "failed_count",
        type: "integer",
        meta: {
          interface: "input",
          readonly: true,
          width: "third",
          note: "Failed delivery count",
        },
        schema: {
          default_value: 0,
        },
      },
    ],
  });

  console.log(`🔗 Creating relations for ${collectionName}...`);

  // Create organization field
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
      required: true,
    },
    schema: {
      is_nullable: false,
    },
  });

  // Create relation to hoa_organizations
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

  // Create the O2M recipients field (alias for the relation from hoa_email_recipients)
  await schemaRequest("POST", `/fields/${collectionName}`, {
    field: "recipients",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      display: "related-values",
      display_options: {
        template: "{{recipient_email}} - {{status}}",
      },
      width: "full",
      note: "Email recipients and their delivery status",
    },
  });

  console.log(`✅ Created collection: ${collectionName}`);
}

async function updateEmailRecipientsRelation() {
  // Check if hoa_email_recipients already has the email field
  // If the relation was created before hoa_emails existed, we may need to fix it
  console.log(`🔧 Verifying hoa_email_recipients relation...`);

  try {
    // Check if the email field exists
    const fields = await schemaRequest("GET", "/fields/hoa_email_recipients");
    const emailField = fields.data?.find((f: any) => f.field === "email");

    if (!emailField) {
      console.log(`📦 Adding email field to hoa_email_recipients...`);

      // Create the email field
      await schemaRequest("POST", "/fields/hoa_email_recipients", {
        field: "email",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          special: ["m2o"],
          display: "related-values",
          display_options: {
            template: "{{subject}}",
          },
          width: "half",
        },
        schema: {},
      });

      // Create the relation
      await schemaRequest("POST", "/relations", {
        collection: "hoa_email_recipients",
        field: "email",
        related_collection: "hoa_emails",
        meta: {
          one_field: "recipients",
          sort_field: "sort",
          one_deselect_action: "nullify",
        },
        schema: {
          on_delete: "CASCADE",
        },
      });

      console.log(`✅ Added email relation to hoa_email_recipients`);
    } else {
      console.log(`⏭️  hoa_email_recipients.email field already exists`);
    }
  } catch (error: any) {
    console.log(`⚠️  Could not verify hoa_email_recipients: ${error.message}`);
    console.log(`   You may need to manually add the email relation`);
  }
}

async function main() {
  console.log("🚀 Starting hoa_emails migration...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}\n`);

  try {
    // Create the main collection
    await createHoaEmailsCollection();

    // Verify/fix the recipients relation
    await updateEmailRecipientsRelation();

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📋 Collection created:");
    console.log("   - hoa_emails (Email campaigns and announcements)");
    console.log("\n📌 Next steps:");
    console.log(
      "   1. Update your types/directus.ts with the HoaEmail interface"
    );
    console.log("   2. Set up permissions for HOA Admin and HOA Member roles");
    console.log("   3. Test creating an email in the Directus admin panel");
  } catch (error: any) {
    console.error("\n❌ Error during migration:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
