/**
 * Script to create Directus collections for Slack-like Channels system
 *
 * This script creates the following collections:
 * - hoa_channels: Channel definitions
 * - hoa_channel_messages: Messages within channels
 * - hoa_channel_members: Channel membership/invitations
 * - hoa_channel_mentions: @mention tracking
 *
 * Run with: pnpm run create:channels
 *
 * Prerequisites:
 * - DIRECTUS_URL in .env file
 * - DIRECTUS_STATIC_TOKEN in .env file (admin token)
 */

import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  createItem,
  updateItem,
} from "@directus/sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const directus = createDirectus(DIRECTUS_URL)
  .with(staticToken(DIRECTUS_STATIC_TOKEN))
  .with(rest());

// Helper to make authenticated fetch requests
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

  return response.json();
}

// Check if a collection exists
async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

// Create a collection
async function createCollection(
  collection: string,
  meta: Record<string, any>
): Promise<void> {
  const exists = await collectionExists(collection);

  if (exists) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }

  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: {},
    }),
  });

  console.log(`   ✅ Created collection: ${collection}`);
}

// Create a field in a collection
async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
  try {
    // Check if field exists
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    // Field doesn't exist, create it
  }

  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({
      field,
      ...fieldConfig,
    }),
  });

  console.log(`   ✅ Created field: ${collection}.${field}`);
}

// Create a relation
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
    if (error.message.includes("already exists") || error.message.includes("409")) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

// ============================================
// Collection Definitions
// ============================================

async function createChannelsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_channels collection...");

  await createCollection("hoa_channels", {
    collection: "hoa_channels",
    icon: "forum",
    note: "Slack-like communication channels for organizations",
    display_template: "{{name}}",
    archive_field: "status",
    archive_value: "archived",
    unarchive_value: "published",
    sort_field: "sort",
  });

  // Status field
  await createField("hoa_channels", "status", {
    type: "string",
    schema: {
      default_value: "published",
    },
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

  // Sort field
  await createField("hoa_channels", "sort", {
    type: "integer",
    meta: {
      interface: "input",
      hidden: true,
    },
  });

  // Name field
  await createField("hoa_channels", "name", {
    type: "string",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "Channel name (e.g., general, announcements)",
    },
  });

  // Slug field
  await createField("hoa_channels", "slug", {
    type: "string",
    schema: {
      is_nullable: false,
      is_unique: false, // Unique per org, not globally
    },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "URL-friendly identifier",
    },
  });

  // Description field
  await createField("hoa_channels", "description", {
    type: "text",
    meta: {
      interface: "input-multiline",
      width: "full",
      note: "Channel description/purpose",
    },
  });

  // Is Private field
  await createField("hoa_channels", "is_private", {
    type: "boolean",
    schema: {
      default_value: false,
    },
    meta: {
      interface: "boolean",
      width: "half",
      note: "If true, only invited members can see this channel",
    },
  });

  // Is Default field
  await createField("hoa_channels", "is_default", {
    type: "boolean",
    schema: {
      default_value: false,
    },
    meta: {
      interface: "boolean",
      width: "half",
      note: "If true, all new members automatically join this channel",
    },
  });

  // Organization relation
  await createField("hoa_channels", "organization", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: {
        template: "{{name}}",
      },
    },
  });

  await createRelation({
    collection: "hoa_channels",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: {
      sort_field: null,
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  // User created (system field)
  await createField("hoa_channels", "user_created", {
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

  await createRelation({
    collection: "hoa_channels",
    field: "user_created",
    related_collection: "directus_users",
  });

  // Date created (system field)
  await createField("hoa_channels", "date_created", {
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

  // User updated (system field)
  await createField("hoa_channels", "user_updated", {
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

  await createRelation({
    collection: "hoa_channels",
    field: "user_updated",
    related_collection: "directus_users",
  });

  // Date updated (system field)
  await createField("hoa_channels", "date_updated", {
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

async function createChannelMessagesCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_channel_messages collection...");

  await createCollection("hoa_channel_messages", {
    collection: "hoa_channel_messages",
    icon: "chat",
    note: "Messages within channels",
    display_template: "{{content}}",
    archive_field: "status",
    archive_value: "deleted",
    unarchive_value: "published",
  });

  // Status field
  await createField("hoa_channel_messages", "status", {
    type: "string",
    schema: {
      default_value: "published",
    },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Published", value: "published", color: "var(--theme--success)" },
          { text: "Draft", value: "draft", color: "var(--theme--warning)" },
          { text: "Deleted", value: "deleted", color: "var(--theme--danger)" },
        ],
      },
    },
  });

  // Content field (rich text)
  await createField("hoa_channel_messages", "content", {
    type: "text",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "input-rich-text-html",
      required: true,
      width: "full",
      note: "Message content (HTML with mentions)",
    },
  });

  // Channel relation
  await createField("hoa_channel_messages", "channel", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: {
        template: "{{name}}",
      },
    },
  });

  await createRelation({
    collection: "hoa_channel_messages",
    field: "channel",
    related_collection: "hoa_channels",
    meta: {
      sort_field: null,
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  // Parent message (for threaded replies)
  await createField("hoa_channel_messages", "parent_message", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      note: "Parent message for threaded replies",
      display: "related-values",
    },
  });

  await createRelation({
    collection: "hoa_channel_messages",
    field: "parent_message",
    related_collection: "hoa_channel_messages",
    meta: {
      sort_field: null,
    },
    schema: {
      on_delete: "SET NULL",
    },
  });

  // Is edited flag
  await createField("hoa_channel_messages", "is_edited", {
    type: "boolean",
    schema: {
      default_value: false,
    },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Whether message has been edited",
    },
  });

  // Attachments (JSON array of file IDs)
  await createField("hoa_channel_messages", "attachments", {
    type: "json",
    meta: {
      interface: "input-code",
      width: "full",
      note: "Array of file IDs attached to the message",
      options: {
        language: "json",
      },
    },
  });

  // User created (system field)
  await createField("hoa_channel_messages", "user_created", {
    type: "uuid",
    meta: {
      special: ["user-created"],
      interface: "select-dropdown-m2o",
      display: "user",
      readonly: true,
      width: "half",
    },
  });

  await createRelation({
    collection: "hoa_channel_messages",
    field: "user_created",
    related_collection: "directus_users",
  });

  // Date created (system field)
  await createField("hoa_channel_messages", "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      width: "half",
    },
  });

  // User updated (system field)
  await createField("hoa_channel_messages", "user_updated", {
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

  await createRelation({
    collection: "hoa_channel_messages",
    field: "user_updated",
    related_collection: "directus_users",
  });

  // Date updated (system field)
  await createField("hoa_channel_messages", "date_updated", {
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

async function createChannelMembersCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_channel_members collection...");

  await createCollection("hoa_channel_members", {
    collection: "hoa_channel_members",
    icon: "group_add",
    note: "Channel membership and invitations",
    display_template: "{{user}} - {{channel}}",
  });

  // Channel relation
  await createField("hoa_channel_members", "channel", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: {
        template: "{{name}}",
      },
    },
  });

  await createRelation({
    collection: "hoa_channel_members",
    field: "channel",
    related_collection: "hoa_channels",
    meta: {
      sort_field: null,
    },
    schema: {
      on_delete: "CASCADE",
    },
  });

  // User relation
  await createField("hoa_channel_members", "user", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "user",
    },
  });

  await createRelation({
    collection: "hoa_channel_members",
    field: "user",
    related_collection: "directus_users",
    schema: {
      on_delete: "CASCADE",
    },
  });

  // HOA Member relation (for inviting hoa_members)
  await createField("hoa_channel_members", "hoa_member", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      note: "Optional reference to hoa_members for member invitations",
      display: "related-values",
      display_options: {
        template: "{{first_name}} {{last_name}}",
      },
    },
  });

  await createRelation({
    collection: "hoa_channel_members",
    field: "hoa_member",
    related_collection: "hoa_members",
    schema: {
      on_delete: "SET NULL",
    },
  });

  // Role field
  await createField("hoa_channel_members", "role", {
    type: "string",
    schema: {
      default_value: "member",
    },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      note: "Channel-specific role",
      options: {
        choices: [
          { text: "Admin", value: "admin", color: "var(--theme--primary)" },
          { text: "Member", value: "member", color: "var(--theme--success)" },
          { text: "Guest", value: "guest", color: "var(--theme--warning)" },
        ],
      },
    },
  });

  // Invited by relation
  await createField("hoa_channel_members", "invited_by", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "user",
    },
  });

  await createRelation({
    collection: "hoa_channel_members",
    field: "invited_by",
    related_collection: "directus_users",
  });

  // Last read at
  await createField("hoa_channel_members", "last_read_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      display: "datetime",
      width: "half",
      note: "Last time user read messages in this channel",
    },
  });

  // Notifications enabled
  await createField("hoa_channel_members", "notifications_enabled", {
    type: "boolean",
    schema: {
      default_value: true,
    },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Whether to send notifications for this channel",
    },
  });

  // Date created (system field)
  await createField("hoa_channel_members", "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      width: "half",
    },
  });
}

async function createChannelMentionsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_channel_mentions collection...");

  await createCollection("hoa_channel_mentions", {
    collection: "hoa_channel_mentions",
    icon: "alternate_email",
    note: "@mention tracking for notifications",
    display_template: "{{mentioned_user}} mentioned by {{mentioned_by}}",
  });

  // Message relation
  await createField("hoa_channel_mentions", "message", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
    },
  });

  await createRelation({
    collection: "hoa_channel_mentions",
    field: "message",
    related_collection: "hoa_channel_messages",
    schema: {
      on_delete: "CASCADE",
    },
  });

  // Mentioned user relation
  await createField("hoa_channel_mentions", "mentioned_user", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "user",
    },
  });

  await createRelation({
    collection: "hoa_channel_mentions",
    field: "mentioned_user",
    related_collection: "directus_users",
    schema: {
      on_delete: "CASCADE",
    },
  });

  // Mentioned by relation
  await createField("hoa_channel_mentions", "mentioned_by", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "user",
    },
  });

  await createRelation({
    collection: "hoa_channel_mentions",
    field: "mentioned_by",
    related_collection: "directus_users",
    schema: {
      on_delete: "CASCADE",
    },
  });

  // Channel relation
  await createField("hoa_channel_mentions", "channel", {
    type: "uuid",
    schema: {
      is_nullable: false,
    },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: {
        template: "{{name}}",
      },
    },
  });

  await createRelation({
    collection: "hoa_channel_mentions",
    field: "channel",
    related_collection: "hoa_channels",
    schema: {
      on_delete: "CASCADE",
    },
  });

  // Is read flag
  await createField("hoa_channel_mentions", "is_read", {
    type: "boolean",
    schema: {
      default_value: false,
    },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Whether the mention has been read",
    },
  });

  // Date created (system field)
  await createField("hoa_channel_mentions", "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      width: "half",
    },
  });
}

// ============================================
// Permissions Setup
// ============================================

interface Role {
  id: string;
  name: string;
}

async function getRoles(): Promise<Role[]> {
  try {
    const response = await directusFetch(
      `/roles?filter=${JSON.stringify({
        name: { _in: ["HOA Admin", "HOA Member"] },
      })}&fields=id,name`
    );
    return response.data as Role[];
  } catch (error) {
    console.error("Error fetching roles:", error);
    throw error;
  }
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Setting up permissions...");

  const roles = await getRoles();

  if (roles.length === 0) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions setup.");
    console.log("   ℹ️  Create 'HOA Admin' and 'HOA Member' roles, then run fix-permissions.ts");
    return;
  }

  const hoaAdmin = roles.find((r) => r.name === "HOA Admin");
  const hoaMember = roles.find((r) => r.name === "HOA Member");

  // Organization filter - users can only access items in their organization
  const orgFilter = {
    channel: {
      organization: {
        _in: "$CURRENT_USER.hoa_members.organization",
      },
    },
  };

  // Direct org filter for channels
  const directOrgFilter = {
    organization: {
      _in: "$CURRENT_USER.hoa_members.organization",
    },
  };

  // Mentioned user filter
  const mentionedUserFilter = {
    mentioned_user: {
      _eq: "$CURRENT_USER",
    },
  };

  // Own messages filter
  const ownMessageFilter = {
    user_created: {
      _eq: "$CURRENT_USER",
    },
  };

  const collections = [
    {
      collection: "hoa_channels",
      adminPermissions: {
        create: { permissions: {}, validation: directOrgFilter, fields: ["*"] },
        read: { permissions: directOrgFilter, validation: null, fields: ["*"] },
        update: { permissions: directOrgFilter, validation: directOrgFilter, fields: ["*"] },
        delete: { permissions: directOrgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        read: { permissions: directOrgFilter, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_channel_messages",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: ownMessageFilter, validation: null, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: ownMessageFilter, validation: null, fields: ["content", "is_edited"] },
        delete: { permissions: ownMessageFilter, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_channel_members",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: orgFilter, validation: null, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        read: {
          permissions: {
            _and: [orgFilter, { user: { _eq: "$CURRENT_USER" } }],
          },
          validation: null,
          fields: ["*"],
        },
        update: {
          permissions: { user: { _eq: "$CURRENT_USER" } },
          validation: null,
          fields: ["last_read_at", "notifications_enabled"],
        },
      },
    },
    {
      collection: "hoa_channel_mentions",
      adminPermissions: {
        create: { permissions: {}, validation: null, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        create: { permissions: {}, validation: null, fields: ["*"] },
        read: { permissions: mentionedUserFilter, validation: null, fields: ["*"] },
        update: { permissions: mentionedUserFilter, validation: null, fields: ["is_read"] },
      },
    },
  ];

  for (const { collection, adminPermissions, memberPermissions } of collections) {
    // HOA Admin permissions
    if (hoaAdmin) {
      console.log(`\n   📋 ${collection} permissions for HOA Admin...`);
      for (const [action, config] of Object.entries(adminPermissions)) {
        try {
          await directusFetch("/permissions", {
            method: "POST",
            body: JSON.stringify({
              role: hoaAdmin.id,
              collection,
              action,
              ...config,
            }),
          });
          console.log(`      ✅ ${action}`);
        } catch (error: any) {
          if (error.message.includes("already exists") || error.message.includes("409")) {
            console.log(`      ⏭️  ${action} (already exists)`);
          } else {
            console.log(`      ❌ ${action}: ${error.message}`);
          }
        }
      }
    }

    // HOA Member permissions
    if (hoaMember) {
      console.log(`\n   📋 ${collection} permissions for HOA Member...`);
      for (const [action, config] of Object.entries(memberPermissions)) {
        try {
          await directusFetch("/permissions", {
            method: "POST",
            body: JSON.stringify({
              role: hoaMember.id,
              collection,
              action,
              ...config,
            }),
          });
          console.log(`      ✅ ${action}`);
        } catch (error: any) {
          if (error.message.includes("already exists") || error.message.includes("409")) {
            console.log(`      ⏭️  ${action} (already exists)`);
          } else {
            console.log(`      ❌ ${action}: ${error.message}`);
          }
        }
      }
    }
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log("🚀 Creating Directus collections for Channels system...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    // Create collections in order (due to relations)
    await createChannelsCollection();
    await createChannelMessagesCollection();
    await createChannelMembersCollection();
    await createChannelMentionsCollection();

    // Set up permissions
    await setupPermissions();

    console.log("\n✅ All collections and permissions have been created!");
    console.log("\n📌 Next steps:");
    console.log("   1. Review the collections in Directus Admin");
    console.log("   2. Adjust permissions if needed for your specific use case");
    console.log("   3. Create a default 'general' channel for each organization");
    console.log("   4. Test the channel system in your application");
  } catch (error: any) {
    console.error("\n❌ Error creating collections:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
