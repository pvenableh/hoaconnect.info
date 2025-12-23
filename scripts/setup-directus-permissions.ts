/**
 * Comprehensive Directus Roles & Policies Setup Script
 *
 * This script ensures that HOA Admin and HOA Member roles have proper permissions
 * for all collections defined in types/directus.ts. It supports:
 * - Organization-scoped access (users only see data in their org)
 * - Role-based permissions (Admin has full CRUD, Member has limited access)
 * - File/folder access for organization assets
 * - Audit mode to check current permissions without making changes
 *
 * NOTE: Directus 10.10+ uses a policy-based permission model where permissions
 * are assigned to policies, and policies are assigned to roles.
 *
 * Run with: dotenv -- tsx scripts/setup-directus-permissions.ts
 * Audit mode: dotenv -- tsx scripts/setup-directus-permissions.ts --audit
 *
 * Or use npm scripts:
 *   npm run setup:permissions
 *   npm run setup:permissions:audit
 */

// ============================================================================
// Configuration
// ============================================================================

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

// Role UUIDs - these must match your Directus instance
const ROLES = {
  HOA_ADMIN: "38494e81-9b49-4c64-a197-fcb8097cd433",
  HOA_MEMBER: "558b04ed-fdcc-48c2-9cd0-977cccf988b9",
  APP_ADMIN: "c4903b32-db6f-4479-a627-55be7f328321", // Global admin (has all permissions)
} as const;

// Permission levels
type PermissionLevel = "full" | "read_only" | "member_specific" | "none";

interface CollectionConfig {
  collection: string;
  adminLevel: PermissionLevel;
  memberLevel: PermissionLevel;
  filterType: "organization" | "member" | "channel" | "email" | "none";
  description: string;
}

// ============================================================================
// Collection Configurations
// ============================================================================

/**
 * Collection permission configurations
 *
 * filterType determines how organization scoping is applied:
 * - "organization": Direct organization field on collection
 * - "member": Filter through member relationship (e.g., pets, vehicles)
 * - "channel": Filter through channel -> organization path
 * - "email": Filter through email -> organization path
 * - "none": No organization filter (e.g., system settings)
 */
const COLLECTION_CONFIGS: CollectionConfig[] = [
  // ========== Core HOA Collections ==========
  {
    collection: "hoa_organizations",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "none", // Special: filtered by membership
    description: "Organization profiles",
  },
  {
    collection: "hoa_members",
    adminLevel: "full",
    memberLevel: "read_only", // Members can see other members in their org
    filterType: "organization",
    description: "Organization members",
  },
  {
    collection: "hoa_units",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Property units",
  },
  {
    collection: "hoa_member_units",
    adminLevel: "full",
    memberLevel: "member_specific", // Members can update their own unit assignments
    filterType: "none", // Filtered through member -> organization
    description: "Member-unit relationships",
  },

  // ========== Board Members ==========
  {
    collection: "hoa_board_members",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "none", // Filtered through hoa_member -> organization
    description: "Board member terms and roles",
  },

  // ========== Content Collections ==========
  {
    collection: "hoa_amenities",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Organization amenities",
  },
  {
    collection: "hoa_announcements",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Announcements and notices",
  },
  {
    collection: "hoa_documents",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Document storage",
  },
  {
    collection: "hoa_document_categories",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Document categories",
  },

  // ========== Communication - Channels ==========
  {
    collection: "hoa_channels",
    adminLevel: "full",
    memberLevel: "read_only", // Members can read channels in their org
    filterType: "organization",
    description: "Communication channels",
  },
  {
    collection: "hoa_channel_members",
    adminLevel: "full",
    memberLevel: "member_specific", // Members can update their own channel membership
    filterType: "channel",
    description: "Channel membership",
  },
  {
    collection: "hoa_channel_messages",
    adminLevel: "full",
    memberLevel: "full", // Members can create/edit their own messages
    filterType: "channel",
    description: "Channel messages",
  },
  {
    collection: "hoa_channel_mentions",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "channel",
    description: "Message mentions",
  },

  // ========== Email System ==========
  {
    collection: "hoa_emails",
    adminLevel: "full",
    memberLevel: "none", // Only admins can manage emails
    filterType: "organization",
    description: "Email campaigns",
  },
  {
    collection: "hoa_email_recipients",
    adminLevel: "full",
    memberLevel: "none",
    filterType: "email",
    description: "Email recipients",
  },
  {
    collection: "hoa_email_activity",
    adminLevel: "full",
    memberLevel: "none",
    filterType: "none", // Filtered through email_recipient -> email -> organization
    description: "Email activity tracking",
  },

  // ========== Mailing Lists ==========
  {
    collection: "hoa_mailing_lists",
    adminLevel: "full",
    memberLevel: "none", // Only admins can manage mailing lists
    filterType: "organization",
    description: "Mailing lists",
  },
  {
    collection: "hoa_mailing_list_members",
    adminLevel: "full",
    memberLevel: "none",
    filterType: "none", // Filtered through mailing_list -> organization
    description: "Mailing list members",
  },

  // ========== Invitations ==========
  {
    collection: "hoa_invitations",
    adminLevel: "full",
    memberLevel: "none", // Only admins can manage invitations
    filterType: "organization",
    description: "Member invitations",
  },

  // ========== Pets & Vehicles ==========
  {
    collection: "hoa_pets",
    adminLevel: "full",
    memberLevel: "member_specific", // Members can manage their own pets
    filterType: "member",
    description: "Member pets",
  },
  {
    collection: "hoa_vehicles",
    adminLevel: "full",
    memberLevel: "member_specific", // Members can manage their own vehicles
    filterType: "member",
    description: "Member vehicles",
  },

  // ========== Payment System ==========
  {
    collection: "payment_requests",
    adminLevel: "full",
    memberLevel: "read_only", // Members can see their payment requests
    filterType: "organization",
    description: "Payment requests",
  },
  {
    collection: "payment_schedules",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "organization",
    description: "Payment schedules",
  },
  {
    collection: "payment_transactions",
    adminLevel: "full",
    memberLevel: "read_only", // Members can see their transactions
    filterType: "organization",
    description: "Payment transactions",
  },

  // ========== Settings & Branding ==========
  {
    collection: "block_settings",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "none", // Filtered through organization relationship
    description: "Organization branding settings",
  },
  {
    collection: "block_hero",
    adminLevel: "full",
    memberLevel: "read_only",
    filterType: "none", // Filtered through organization -> hero
    description: "Hero block settings",
  },

  // ========== Subscription (Admin only for security) ==========
  {
    collection: "subscription_plans",
    adminLevel: "read_only", // Even admins shouldn't modify plans
    memberLevel: "read_only",
    filterType: "none",
    description: "Subscription plans",
  },
  {
    collection: "coupons",
    adminLevel: "none", // App admin only
    memberLevel: "none",
    filterType: "none",
    description: "Discount coupons",
  },
  {
    collection: "coupon_usage",
    adminLevel: "none", // App admin only
    memberLevel: "none",
    filterType: "none",
    description: "Coupon usage tracking",
  },
  {
    collection: "coupons_subscription_plans",
    adminLevel: "none",
    memberLevel: "none",
    filterType: "none",
    description: "Coupon-plan relationships",
  },
];

// ============================================================================
// Filter Builders
// ============================================================================

/**
 * Build organization filter based on collection type
 * Uses $CURRENT_USER.hoa_members.organization for org-scoped access
 */
function buildOrgFilter(filterType: CollectionConfig["filterType"]): any {
  const currentUserOrgs = "$CURRENT_USER.hoa_members.organization";

  switch (filterType) {
    case "organization":
      // Direct organization field on the collection
      return {
        organization: {
          _in: currentUserOrgs,
        },
      };

    case "member":
      // Filter through member_id -> organization
      return {
        member_id: {
          organization: {
            _in: currentUserOrgs,
          },
        },
      };

    case "channel":
      // Filter through channel -> organization
      return {
        channel: {
          organization: {
            _in: currentUserOrgs,
          },
        },
      };

    case "email":
      // Filter through email -> organization
      return {
        email: {
          organization: {
            _in: currentUserOrgs,
          },
        },
      };

    case "none":
      return null;
  }
}

/**
 * Build member-specific filter for collections where members
 * can only access their own data
 */
function buildMemberSpecificFilter(collection: string): any {
  const currentUserMembers = "$CURRENT_USER.hoa_members.id";

  switch (collection) {
    case "hoa_pets":
    case "hoa_vehicles":
      return {
        member_id: {
          _in: currentUserMembers,
        },
      };

    case "hoa_member_units":
      return {
        member_id: {
          _in: currentUserMembers,
        },
      };

    case "hoa_channel_members":
      return {
        hoa_member: {
          _in: currentUserMembers,
        },
      };

    default:
      return null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface Role {
  id: string;
  name: string;
}

interface Policy {
  id: string;
  name: string;
  roles: string[];
}

interface Permission {
  id?: number;
  policy: string;  // Directus 10.10+ uses policy instead of role
  collection: string;
  action: "create" | "read" | "update" | "delete";
  permissions: any;
  validation: any;
  fields: string[];
}

interface ExistingPermission {
  id: number;
  action: string;
  permissions: any;
  validation: any;
  fields: string[];
}

// ============================================================================
// Directus Client & API Helpers
// ============================================================================

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

/**
 * Make authenticated API requests to Directus
 * Using fetch directly for policy/permission operations since SDK doesn't support all policy operations
 */
async function directusApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${DIRECTUS_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `API Error ${response.status}: ${JSON.stringify(errorData)}`
    );
  }

  const data = await response.json();
  return data.data as T;
}

/**
 * Get or create a policy for a role
 * In Directus 10.10+, permissions are assigned to policies, not directly to roles
 */
async function getOrCreatePolicyForRole(
  roleId: string,
  roleName: string
): Promise<string> {
  const policyName = `${roleName} Policy`;

  // First, check if a policy already exists for this role
  try {
    const policies = await directusApi<Policy[]>(
      `/policies?filter=${encodeURIComponent(JSON.stringify({ name: { _eq: policyName } }))}&fields=id,name,roles`
    );

    if (policies && policies.length > 0) {
      const policy = policies[0];
      console.log(`   📋 Found existing policy: ${policy.name} (${policy.id})`);
      return policy.id;
    }
  } catch (error: any) {
    console.log(`   ⚠️  Error checking for existing policy: ${error.message}`);
  }

  // Create a new policy for this role
  try {
    console.log(`   🆕 Creating new policy: ${policyName}`);
    const newPolicy = await directusApi<Policy>("/policies", {
      method: "POST",
      body: JSON.stringify({
        name: policyName,
        admin_access: false,
        app_access: true,
      }),
    });

    // Link the policy to the role
    await directusApi(`/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        policies: [newPolicy.id],
      }),
    });

    console.log(`   ✅ Created and linked policy: ${newPolicy.id}`);
    return newPolicy.id;
  } catch (error: any) {
    throw new Error(`Failed to create policy for ${roleName}: ${error.message}`);
  }
}

// ============================================================================
// Permission Management Functions
// ============================================================================

async function getExistingPermissions(
  policyId: string,
  collection: string
): Promise<ExistingPermission[]> {
  try {
    const filter = {
      policy: { _eq: policyId },
      collection: { _eq: collection },
    };
    const permissions = await directusApi<ExistingPermission[]>(
      `/permissions?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=id,action,permissions,validation,fields`
    );
    return permissions || [];
  } catch (error: any) {
    console.error(
      `   ⚠️  Error fetching permissions for ${collection}:`,
      error.message
    );
    return [];
  }
}

async function createOrUpdatePermission(
  permission: Permission,
  existingPermissions: ExistingPermission[],
  auditMode: boolean
): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
  const existing = existingPermissions.find(
    (p) => p.action === permission.action
  );

  if (auditMode) {
    if (existing) {
      const hasChanges =
        JSON.stringify(existing.permissions) !==
          JSON.stringify(permission.permissions) ||
        JSON.stringify(existing.validation) !==
          JSON.stringify(permission.validation);

      if (hasChanges) {
        console.log(
          `   📋 Would update ${permission.action}: permissions/validation differ`
        );
        return { created: false, updated: true, skipped: false };
      } else {
        return { created: false, updated: false, skipped: true };
      }
    } else {
      console.log(`   📋 Would create ${permission.action} permission`);
      return { created: true, updated: false, skipped: false };
    }
  }

  try {
    if (existing) {
      await directusApi(`/permissions/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          permissions: permission.permissions,
          validation: permission.validation,
          fields: permission.fields,
        }),
      });
      console.log(`   ✅ Updated ${permission.action}`);
      return { created: false, updated: true, skipped: false };
    } else {
      await directusApi("/permissions", {
        method: "POST",
        body: JSON.stringify(permission),
      });
      console.log(`   ✅ Created ${permission.action}`);
      return { created: true, updated: false, skipped: false };
    }
  } catch (error: any) {
    console.error(
      `   ❌ Failed ${permission.action}: ${error.message || error}`
    );
    return { created: false, updated: false, skipped: true };
  }
}

async function removePermissions(
  existingPermissions: ExistingPermission[],
  auditMode: boolean
): Promise<number> {
  if (existingPermissions.length === 0) return 0;

  if (auditMode) {
    console.log(`   📋 Would remove ${existingPermissions.length} permissions`);
    return existingPermissions.length;
  }

  try {
    const ids = existingPermissions.map((p) => p.id);
    // Delete permissions one by one (bulk delete may not be supported)
    for (const id of ids) {
      await directusApi(`/permissions/${id}`, {
        method: "DELETE",
      });
    }
    console.log(`   🗑️  Removed ${ids.length} permissions`);
    return ids.length;
  } catch (error: any) {
    console.error(`   ❌ Failed to remove permissions: ${error.message}`);
    return 0;
  }
}

// ============================================================================
// Permission Setup Functions
// ============================================================================

function buildPermissionsForLevel(
  policyId: string,
  collection: string,
  level: PermissionLevel,
  config: CollectionConfig
): Permission[] {
  if (level === "none") {
    return [];
  }

  const orgFilter = buildOrgFilter(config.filterType);
  const permissions: Permission[] = [];

  // Special handling for hoa_organizations - uses membership filter
  const effectiveFilter =
    collection === "hoa_organizations"
      ? { id: { _in: "$CURRENT_USER.hoa_members.organization" } }
      : orgFilter;

  // Special handling for board members - filter through hoa_member
  const boardMemberFilter =
    collection === "hoa_board_members"
      ? {
          hoa_member: {
            organization: {
              _in: "$CURRENT_USER.hoa_members.organization",
            },
          },
        }
      : null;

  // Special handling for block_settings - filter through organization relation
  const blockSettingsFilter =
    collection === "block_settings"
      ? {
          organization: {
            _in: "$CURRENT_USER.hoa_members.organization",
          },
        }
      : null;

  // Special handling for mailing list members
  const mailingListMemberFilter =
    collection === "hoa_mailing_list_members"
      ? {
          mailing_list: {
            organization: {
              _in: "$CURRENT_USER.hoa_members.organization",
            },
          },
        }
      : null;

  // Special handling for email activity
  const emailActivityFilter =
    collection === "hoa_email_activity"
      ? {
          email_recipient: {
            email: {
              organization: {
                _in: "$CURRENT_USER.hoa_members.organization",
              },
            },
          },
        }
      : null;

  // Special handling for hoa_member_units
  const memberUnitsFilter =
    collection === "hoa_member_units"
      ? {
          member_id: {
            organization: {
              _in: "$CURRENT_USER.hoa_members.organization",
            },
          },
        }
      : null;

  // Determine the filter to use
  const filter =
    boardMemberFilter ||
    blockSettingsFilter ||
    mailingListMemberFilter ||
    emailActivityFilter ||
    memberUnitsFilter ||
    effectiveFilter;

  switch (level) {
    case "read_only":
      permissions.push({
        policy: policyId,
        collection,
        action: "read",
        permissions: filter || {},
        validation: null,
        fields: ["*"],
      });
      break;

    case "member_specific":
      // Members can read all in their org, but only create/update/delete their own
      const memberFilter = buildMemberSpecificFilter(collection);

      permissions.push(
        {
          policy: policyId,
          collection,
          action: "read",
          permissions: filter || {},
          validation: null,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "create",
          permissions: {},
          validation: memberFilter,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "update",
          permissions: memberFilter,
          validation: memberFilter,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "delete",
          permissions: memberFilter,
          validation: null,
          fields: ["*"],
        }
      );
      break;

    case "full":
      permissions.push(
        {
          policy: policyId,
          collection,
          action: "create",
          permissions: {},
          validation: filter,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "read",
          permissions: filter || {},
          validation: null,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "update",
          permissions: filter || {},
          validation: filter,
          fields: ["*"],
        },
        {
          policy: policyId,
          collection,
          action: "delete",
          permissions: filter || {},
          validation: null,
          fields: ["*"],
        }
      );
      break;
  }

  return permissions;
}

async function setupCollectionPermissions(
  policyId: string,
  roleName: string,
  config: CollectionConfig,
  auditMode: boolean
): Promise<{ created: number; updated: number; removed: number }> {
  const level =
    roleName === "HOA Admin" ? config.adminLevel : config.memberLevel;

  console.log(`\n📦 ${config.collection} (${config.description})`);
  console.log(`   Level: ${level}`);

  const existingPermissions = await getExistingPermissions(
    policyId,
    config.collection
  );

  let stats = { created: 0, updated: 0, removed: 0 };

  if (level === "none") {
    // Remove all existing permissions for this collection
    if (existingPermissions.length > 0) {
      stats.removed = await removePermissions(
        existingPermissions,
        auditMode
      );
    } else {
      console.log(`   ⏭️  No permissions (as expected)`);
    }
    return stats;
  }

  const desiredPermissions = buildPermissionsForLevel(
    policyId,
    config.collection,
    level,
    config
  );

  for (const permission of desiredPermissions) {
    const result = await createOrUpdatePermission(
      permission,
      existingPermissions,
      auditMode
    );
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  // Remove permissions that shouldn't exist
  const desiredActions = desiredPermissions.map((p) => p.action);
  const extraPermissions = existingPermissions.filter(
    (p) => !desiredActions.includes(p.action as any)
  );

  if (extraPermissions.length > 0) {
    stats.removed = await removePermissions(
      extraPermissions,
      auditMode
    );
  }

  return stats;
}

// ============================================================================
// File System Permissions
// ============================================================================

async function setupFilePermissions(
  policyId: string,
  roleName: string,
  auditMode: boolean
): Promise<{ created: number; updated: number }> {
  console.log(`\n📁 Setting up file system permissions for ${roleName}...`);

  const existingFilePerms = await getExistingPermissions(
    policyId,
    "directus_files"
  );
  const existingFolderPerms = await getExistingPermissions(
    policyId,
    "directus_folders"
  );

  let stats = { created: 0, updated: 0 };

  // File permissions - users can access files in their organization's folder
  const fileFilter = {
    folder: {
      _in: "$CURRENT_USER.hoa_members.organization.folder",
    },
  };

  const isAdmin = roleName === "HOA Admin";

  const filePermissions: Permission[] = [
    {
      policy: policyId,
      collection: "directus_files",
      action: "read",
      permissions: fileFilter,
      validation: null,
      fields: ["*"],
    },
  ];

  // Only admins can upload/modify files
  if (isAdmin) {
    filePermissions.push(
      {
        policy: policyId,
        collection: "directus_files",
        action: "create",
        permissions: {},
        validation: fileFilter,
        fields: ["*"],
      },
      {
        policy: policyId,
        collection: "directus_files",
        action: "update",
        permissions: fileFilter,
        validation: fileFilter,
        fields: ["*"],
      },
      {
        policy: policyId,
        collection: "directus_files",
        action: "delete",
        permissions: fileFilter,
        validation: null,
        fields: ["*"],
      }
    );
  }

  for (const permission of filePermissions) {
    const result = await createOrUpdatePermission(
      permission,
      existingFilePerms,
      auditMode
    );
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  // Folder permissions
  const folderFilter = {
    id: {
      _in: "$CURRENT_USER.hoa_members.organization.folder",
    },
  };

  const folderPermissions: Permission[] = [
    {
      policy: policyId,
      collection: "directus_folders",
      action: "read",
      permissions: folderFilter,
      validation: null,
      fields: ["*"],
    },
  ];

  if (isAdmin) {
    folderPermissions.push({
      policy: policyId,
      collection: "directus_folders",
      action: "update",
      permissions: folderFilter,
      validation: null,
      fields: ["*"],
    });
  }

  for (const permission of folderPermissions) {
    const result = await createOrUpdatePermission(
      permission,
      existingFolderPerms,
      auditMode
    );
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  return stats;
}

// ============================================================================
// User Permissions (self-read)
// ============================================================================

async function setupUserPermissions(
  policyId: string,
  roleName: string,
  auditMode: boolean
): Promise<{ created: number; updated: number }> {
  console.log(`\n👤 Setting up user self-access for ${roleName}...`);

  const existingPerms = await getExistingPermissions(policyId, "directus_users");
  let stats = { created: 0, updated: 0 };

  // Users can read their own user record
  const selfFilter = {
    id: {
      _eq: "$CURRENT_USER.id",
    },
  };

  const permissions: Permission[] = [
    {
      policy: policyId,
      collection: "directus_users",
      action: "read",
      permissions: selfFilter,
      validation: null,
      fields: [
        "id",
        "first_name",
        "last_name",
        "email",
        "avatar",
        "role",
        "status",
      ],
    },
    {
      policy: policyId,
      collection: "directus_users",
      action: "update",
      permissions: selfFilter,
      validation: selfFilter,
      fields: ["first_name", "last_name", "avatar", "password"],
    },
  ];

  for (const permission of permissions) {
    const result = await createOrUpdatePermission(
      permission,
      existingPerms,
      auditMode
    );
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  return stats;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const auditMode = process.argv.includes("--audit");

  console.log(
    "╔══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║       Directus Roles & Policies Setup Script                 ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝"
  );
  console.log();

  if (auditMode) {
    console.log("🔍 AUDIT MODE - No changes will be made");
    console.log("   This will show what would be created/updated/removed\n");
  } else {
    console.log("⚡ APPLY MODE - Changes will be made to Directus\n");
  }

  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  console.log();

  const totalStats = {
    created: 0,
    updated: 0,
    removed: 0,
    errors: 0,
  };

  try {
    // Process each role
    const rolesToProcess = [
      { id: ROLES.HOA_ADMIN, name: "HOA Admin" },
      { id: ROLES.HOA_MEMBER, name: "HOA Member" },
    ];

    for (const role of rolesToProcess) {
      console.log("\n" + "═".repeat(60));
      console.log(`🎭 Processing role: ${role.name}`);
      console.log(`   Role ID: ${role.id}`);
      console.log("═".repeat(60));

      // Get or create policy for this role (Directus 10.10+ requires policies)
      let policyId: string;
      try {
        policyId = await getOrCreatePolicyForRole(role.id, role.name);
        console.log(`   Policy ID: ${policyId}`);
      } catch (error: any) {
        console.error(`   ❌ Failed to get/create policy: ${error.message}`);
        totalStats.errors++;
        continue; // Skip this role if we can't get/create a policy
      }

      // Setup collection permissions
      for (const config of COLLECTION_CONFIGS) {
        try {
          const stats = await setupCollectionPermissions(
            policyId,
            role.name,
            config,
            auditMode
          );
          totalStats.created += stats.created;
          totalStats.updated += stats.updated;
          totalStats.removed += stats.removed;
        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
          totalStats.errors++;
        }
      }

      // Setup file permissions
      try {
        const fileStats = await setupFilePermissions(
          policyId,
          role.name,
          auditMode
        );
        totalStats.created += fileStats.created;
        totalStats.updated += fileStats.updated;
      } catch (error: any) {
        console.error(
          `   ❌ Error setting up file permissions: ${error.message}`
        );
        totalStats.errors++;
      }

      // Setup user self-access
      try {
        const userStats = await setupUserPermissions(
          policyId,
          role.name,
          auditMode
        );
        totalStats.created += userStats.created;
        totalStats.updated += userStats.updated;
      } catch (error: any) {
        console.error(
          `   ❌ Error setting up user permissions: ${error.message}`
        );
        totalStats.errors++;
      }
    }

    // Summary
    console.log("\n" + "═".repeat(60));
    console.log("📊 SUMMARY");
    console.log("═".repeat(60));

    if (auditMode) {
      console.log(`   Would create: ${totalStats.created} permissions`);
      console.log(`   Would update: ${totalStats.updated} permissions`);
      console.log(`   Would remove: ${totalStats.removed} permissions`);
    } else {
      console.log(`   Created: ${totalStats.created} permissions`);
      console.log(`   Updated: ${totalStats.updated} permissions`);
      console.log(`   Removed: ${totalStats.removed} permissions`);
    }

    if (totalStats.errors > 0) {
      console.log(`   Errors: ${totalStats.errors}`);
    }

    console.log();

    if (auditMode) {
      console.log("💡 To apply changes, run without --audit flag:");
      console.log("   npx tsx scripts/setup-directus-permissions.ts");
    } else {
      console.log("✅ All permissions have been configured!");
      console.log("\n📌 Next steps:");
      console.log("   1. Test with an HOA Admin account");
      console.log("   2. Test with an HOA Member account");
      console.log("   3. Verify organization isolation is working");
    }
  } catch (error: any) {
    console.error("\n❌ Fatal error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
