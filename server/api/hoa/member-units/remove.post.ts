import { readItem, deleteItem } from "@directus/sdk";

/**
 * Remove a unit assignment from a member - Admin only
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { assignmentId } = body;

  if (!assignmentId) {
    throw createError({
      statusCode: 400,
      message: "Assignment ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get the assignment to find the member and verify organization
    const assignment = await directus.request(
      readItem("hoa_member_units", assignmentId, {
        fields: ["id", "member_id.id", "member_id.organization"],
      })
    );

    if (!assignment) {
      throw createError({
        statusCode: 404,
        message: "Assignment not found",
      });
    }

    const member = assignment.member_id as any;
    if (!member) {
      throw createError({
        statusCode: 400,
        message: "Assignment has no associated member",
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

    await directus.request(deleteItem("hoa_member_units", assignmentId));

    return {
      success: true,
      message: "Unit assignment removed successfully",
    };
  } catch (error: any) {
    console.error("Remove unit assignment error:", error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to remove unit assignment",
    });
  }
});
