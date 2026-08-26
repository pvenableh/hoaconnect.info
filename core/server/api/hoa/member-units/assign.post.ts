import { readItem, readItems, createItem, updateItem } from "@directus/sdk";
import type { HoaOrganization } from "#core/types/directus";
import { normalizeResidency, isKnownNonResidency } from "#core/shared/members/residency";

/**
 * Assign a unit to a member - Admin only
 *
 * Idempotent per (member, unit): re-assigning a unit the member already has
 * UPDATES that link rather than creating a second one. Without this, editing a
 * member twice would leave two rows for the same unit and `residencyFor()`
 * would pick between duplicates.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { memberId, unitId, isPrimaryUnit = true, memberType } = body;

  if (!memberId || !unitId) {
    throw createError({
      statusCode: 400,
      message: "Member ID and Unit ID are required",
    });
  }

  // Residency ON THE LINK — "owner of THIS unit", which is the thing
  // `residencyFor()` reads first. Optional: an assignment that says nothing
  // about residency leaves the link's value alone rather than blanking it.
  //
  // ⚠️ Directus does NOT enforce the owner|tenant choices — proved on
  // production, a write of "COMPLETE-GARBAGE" was accepted. This normalization
  // is the only real guard, so a junk value is a 400 rather than a silent write
  // that later decides a mail audience.
  const normalizedMemberType = normalizeResidency(memberType);
  if (memberType !== undefined && normalizedMemberType === null && !isKnownNonResidency(memberType)) {
    throw createError({
      statusCode: 400,
      message: "memberType must be 'owner' or 'tenant'",
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
      : (member.organization as HoaOrganization | null)?.id;

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
      : (unit.organization as HoaOrganization | null)?.id;

    if (unitOrgId !== organizationId) {
      throw createError({
        statusCode: 400,
        message: "Unit does not belong to the same organization as the member",
      });
    }

    // Existing links for this member — needed both to avoid duplicating this
    // unit and to demote whatever was primary before.
    const existingLinks = await directus.request(
      readItems("hoa_member_units", {
        filter: { member_id: { _eq: memberId } },
        fields: ["id", "unit_id", "is_primary_unit"],
        limit: -1,
      })
    );

    const linkUnitId = (l: any) =>
      typeof l.unit_id === "string" ? l.unit_id : l.unit_id?.id;
    const existing = (existingLinks as any[]).find((l) => linkUnitId(l) === unitId);

    // Only one link can be the primary. Demote the others BEFORE writing this
    // one, so a failure leaves the member with no primary rather than two.
    if (isPrimaryUnit) {
      for (const link of existingLinks as any[]) {
        if (link.id !== existing?.id && link.is_primary_unit) {
          await directus.request(
            updateItem("hoa_member_units", link.id, { is_primary_unit: false })
          );
        }
      }
    }

    const assignment = existing
      ? await directus.request(
          updateItem("hoa_member_units", existing.id, {
            is_primary_unit: isPrimaryUnit,
            ...(normalizedMemberType !== null ? { member_type: normalizedMemberType } : {}),
          })
        )
      : await directus.request(
          createItem("hoa_member_units", {
            member_id: memberId,
            unit_id: unitId,
            is_primary_unit: isPrimaryUnit,
            member_type: normalizedMemberType,
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
