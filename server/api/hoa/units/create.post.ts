import { createItem } from "@directus/sdk";

/**
 * Create a new unit - Admin only
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId, unit_number, status = "active" } = body;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "Organization ID is required",
    });
  }

  if (!unit_number) {
    throw createError({
      statusCode: 400,
      message: "Unit number is required",
    });
  }

  // Verify admin access
  await requireAdminAccess(event, organizationId);

  try {
    const directus = getTypedDirectus();

    const newUnit = await directus.request(
      createItem("hoa_units", {
        organization: organizationId,
        unit_number,
        status,
        sort: 0,
      })
    );

    return {
      success: true,
      unit: newUnit,
    };
  } catch (error: any) {
    console.error("Create unit error:", error);
    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || "Failed to create unit",
    });
  }
});
