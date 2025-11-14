import { readMe, readItems, readPermissions } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session || !session.user) {
      throw createError({
        statusCode: 401,
        message: "Not authenticated",
      });
    }

    const directus = await getAdminDirectus();

    // Get current user's full details
    const user = await directus.request(
      readItems("directus_users", {
        filter: {
          id: { _eq: session.user.id },
        },
        fields: ["id", "email", "first_name", "last_name", "role", "status"],
        limit: 1,
      })
    );

    if (!user || user.length === 0) {
      throw createError({
        statusCode: 404,
        message: "User not found",
      });
    }

    const userData = user[0];

    // Get role details
    const role = await directus.request(
      readItems("directus_roles", {
        filter: {
          id: { _eq: userData.role },
        },
        fields: ["id", "name", "admin_access", "app_access"],
        limit: 1,
      })
    );

    // Get permissions for this role
    const permissions = await directus.request(
      readItems("directus_permissions", {
        filter: {
          role: { _eq: userData.role },
        },
        fields: ["id", "collection", "action", "permissions", "validation", "fields"],
      })
    );

    // Filter permissions for HOA collections
    const hoaPermissions = permissions.filter((p: any) =>
      p.collection && (
        p.collection.startsWith("hoa_") ||
        p.collection === "directus_users"
      )
    );

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        role: userData.role,
        status: userData.status,
      },
      role: role && role.length > 0 ? role[0] : null,
      permissions: hoaPermissions,
      analysis: {
        canCreateUnits: permissions.some(
          (p: any) => p.collection === "hoa_units" && p.action === "create"
        ),
        canReadUnits: permissions.some(
          (p: any) => p.collection === "hoa_units" && p.action === "read"
        ),
        canUpdateUnits: permissions.some(
          (p: any) => p.collection === "hoa_units" && p.action === "update"
        ),
        canDeleteUnits: permissions.some(
          (p: any) => p.collection === "hoa_units" && p.action === "delete"
        ),
      },
    };
  } catch (error: any) {
    console.error("Permissions debug error:", error);
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to fetch permissions",
    });
  }
});
