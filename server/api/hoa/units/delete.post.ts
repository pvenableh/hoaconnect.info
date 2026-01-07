import { readItem, deleteItem } from "@directus/sdk";

/**
 * Delete a unit - Admin only
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { unitId } = body;

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

    await directus.request(deleteItem("hoa_units", unitId));

    return {
      success: true,
      message: "Unit deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete unit error:", error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to delete unit",
    });
  }
});
