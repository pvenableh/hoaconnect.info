import { readItem, createItem } from "@directus/sdk";

/**
 * Assign a unit to a member - Admin only
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { memberId, unitId, isPrimaryUnit = true } = body;

  if (!memberId || !unitId) {
    throw createError({
      statusCode: 400,
      message: "Member ID and Unit ID are required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get the member to verify organization
    const member = await directus.request(
      readItem("hoa_members", memberId, {
        fields: ["id", "organization"],
      })
    );

    if (!member) {
      throw createError({
        statusCode: 404,
        message: "Member not found",
      });
    }

    const organizationId = typeof member.organization === "string"
      ? member.organization
      : member.organization?.id;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: "Member has no associated organization",
      });
    }

    // Verify admin access
    await requireAdminAccess(event, organizationId);

    // Verify the unit belongs to the same organization
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

    const unitOrgId = typeof unit.organization === "string"
      ? unit.organization
      : unit.organization?.id;

    if (unitOrgId !== organizationId) {
      throw createError({
        statusCode: 400,
        message: "Unit does not belong to the same organization as the member",
      });
    }

    // Create the member-unit assignment
    const assignment = await directus.request(
      createItem("hoa_member_units", {
        member_id: memberId,
        unit_id: unitId,
        is_primary_unit: isPrimaryUnit,
        status: "published",
      })
    );

    return {
      success: true,
      assignment,
    };
  } catch (error: any) {
    console.error("Assign unit error:", error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to assign unit to member",
    });
  }
});
