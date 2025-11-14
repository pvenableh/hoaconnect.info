/**
 * Script to fix Directus permissions for HOA roles
 *
 * This script ensures that HOA Admin and HOA Member roles have proper permissions
 * to create, read, update, and delete items in the hoa_units collection.
 *
 * Run with: npx tsx scripts/fix-permissions.ts
 */

import { createDirectus, rest, staticToken, readItems, createItem, updateItem, deleteItems } from "@directus/sdk";

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

interface Role {
  id: string;
  name: string;
}

interface Permission {
  id?: string;
  role: string;
  collection: string;
  action: string;
  permissions: any;
  validation: any;
  fields: string[];
}

async function getRoles(): Promise<Role[]> {
  try {
    const roles = await directus.request(
      readItems("directus_roles", {
        filter: {
          name: { _in: ["HOA Admin", "HOA Member"] },
        },
        fields: ["id", "name"],
      })
    );
    return roles as Role[];
  } catch (error) {
    console.error("Error fetching roles:", error);
    throw error;
  }
}

async function getExistingPermissions(roleId: string, collection: string) {
  try {
    const permissions = await directus.request(
      readItems("directus_permissions", {
        filter: {
          role: { _eq: roleId },
          collection: { _eq: collection },
        },
        fields: ["id", "action", "permissions", "validation", "fields"],
      })
    );
    return permissions;
  } catch (error) {
    console.error(`Error fetching existing permissions for ${collection}:`, error);
    return [];
  }
}

async function createOrUpdatePermission(permission: Permission, existingPermissions: any[]) {
  const existing = existingPermissions.find((p: any) => p.action === permission.action);

  try {
    if (existing) {
      // Update existing permission
      await directus.request(
        updateItem("directus_permissions", existing.id, {
          permissions: permission.permissions,
          validation: permission.validation,
          fields: permission.fields,
        })
      );
      console.log(`   ✅ Updated ${permission.action} permission for ${permission.collection}`);
    } else {
      // Create new permission
      await directus.request(
        createItem("directus_permissions", permission)
      );
      console.log(`   ✅ Created ${permission.action} permission for ${permission.collection}`);
    }
  } catch (error: any) {
    console.error(`   ❌ Failed to ${existing ? 'update' : 'create'} ${permission.action} permission:`, error.message);
  }
}

async function setupPermissions(roleId: string, roleName: string, collection: string) {
  console.log(`\n📋 Setting up permissions for ${roleName} on ${collection}...`);

  const existingPermissions = await getExistingPermissions(roleId, collection);

  // Define permissions for the collection
  // Users should only access items in their organization
  // This uses a special filter that checks if the item's organization matches
  // any of the organizations the user is a member of (via hoa_members)
  const orgFilter = {
    organization: {
      _in: "$CURRENT_USER.hoa_members.organization",
    },
  };

  const permissions: Permission[] = [
    {
      role: roleId,
      collection,
      action: "create",
      permissions: {},  // Allow create with validation
      validation: orgFilter,  // Validate organization on create
      fields: ["*"],
    },
    {
      role: roleId,
      collection,
      action: "read",
      permissions: orgFilter,
      validation: null,
      fields: ["*"],
    },
    {
      role: roleId,
      collection,
      action: "update",
      permissions: orgFilter,
      validation: orgFilter,
      fields: ["*"],
    },
    {
      role: roleId,
      collection,
      action: "delete",
      permissions: orgFilter,
      validation: null,
      fields: ["*"],
    },
  ];

  for (const permission of permissions) {
    await createOrUpdatePermission(permission, existingPermissions);
  }
}

async function setupMembershipPermissions(roleId: string, roleName: string) {
  console.log(`\n📋 Setting up permissions for ${roleName} on hoa_members...`);

  const existingPermissions = await getExistingPermissions(roleId, "hoa_members");

  // Users should see all members in their organization
  const orgFilter = {
    organization: {
      _in: "$CURRENT_USER.hoa_members.organization",
    },
  };

  const permissions: Permission[] = [
    {
      role: roleId,
      collection: "hoa_members",
      action: "read",
      permissions: orgFilter,
      validation: null,
      fields: ["*"],
    },
  ];

  // HOA Admin should be able to create/update/delete members
  if (roleName === "HOA Admin") {
    permissions.push(
      {
        role: roleId,
        collection: "hoa_members",
        action: "create",
        permissions: {},
        validation: orgFilter,
        fields: ["*"],
      },
      {
        role: roleId,
        collection: "hoa_members",
        action: "update",
        permissions: orgFilter,
        validation: orgFilter,
        fields: ["*"],
      },
      {
        role: roleId,
        collection: "hoa_members",
        action: "delete",
        permissions: orgFilter,
        validation: null,
        fields: ["*"],
      }
    );
  }

  for (const permission of permissions) {
    await createOrUpdatePermission(permission, existingPermissions);
  }
}

async function main() {
  console.log("🚀 Starting Directus permissions fix...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    // Get HOA roles
    const roles = await getRoles();

    if (roles.length === 0) {
      console.error("❌ No HOA roles found. Please create 'HOA Admin' and 'HOA Member' roles first.");
      process.exit(1);
    }

    console.log(`\n✅ Found ${roles.length} roles:`);
    roles.forEach((role) => {
      console.log(`   - ${role.name} (${role.id})`);
    });

    // Collections to set up permissions for
    const collections = ["hoa_units", "hoa_organizations", "hoa_documents", "hoa_invitations"];

    for (const role of roles) {
      // Set up permissions for each collection
      for (const collection of collections) {
        await setupPermissions(role.id, role.name, collection);
      }

      // Set up membership permissions
      await setupMembershipPermissions(role.id, role.name);
    }

    console.log("\n✅ All permissions have been set up successfully!");
    console.log("\n📌 Next steps:");
    console.log("   1. Test creating a unit in the application");
    console.log("   2. Verify that users can only see items in their organization");
    console.log("   3. Check that dashboard data loads correctly");

  } catch (error: any) {
    console.error("\n❌ Error setting up permissions:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
