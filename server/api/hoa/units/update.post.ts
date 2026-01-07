import { readItem, updateItem } from "@directus/sdk";

/**
 * Update a unit - Admin only
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { unitId, unit_number, status } = body;

  if (!unitId) {
    throw createError({
      statusCode: 400,
      message: "Unit ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get the unit to find its organization
    const unit = await directus.request(
      readItem("hoa_units", unitId, {
        fields: ["id", "organization"],
      })
    );

    if (!unit) {
      throw createError({
        statusCode: 404,
        message: "Unit not found",
      });
    }

    const organizationId = typeof unit.organization === "string"
      ? unit.organization
      : unit.organization?.id;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: "Unit has no associated organization",
      });
    }

    // Verify admin access
    await requireAdminAccess(event, organizationId);

    // Build update data
    const updateData: Record<string, any> = {};
    if (unit_number !== undefined) updateData.unit_number = unit_number;
    if (status !== undefined) updateData.status = status;

    const updatedUnit = await directus.request(
      updateItem("hoa_units", unitId, updateData)
    );

    return {
      success: true,
      unit: updatedUnit,
    };
  } catch (error: any) {
    console.error("Update unit error:", error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to update unit",
    });
  }
});
