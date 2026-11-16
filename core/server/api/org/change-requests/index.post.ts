import { createItem } from "@directus/sdk";
import {
  CHANGE_KINDS,
  CHANGE_ACTIONS,
  KIND_TARGET,
  buildSafeChange,
  assertTargetOwnedByMember,
  type ChangeKind,
  type ChangeAction,
} from "#core/server/utils/change-requests";
import { chooseRecordUnit } from "#core/shared/units/record-writes";
import { assertPhotoInOrg, memberUnitsInOrg } from "#core/server/utils/unit-record-writes";

/**
 * Resident submits a change to their OWN household data (contact / mailing
 * address / vehicle / pet). Stored as a pending request — the live record is not
 * touched until an Admin / Property Manager approves. Org-scoped: the member is
 * resolved from the authenticated user's membership, so a resident can only ever
 * file requests against their own member record.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const body = await readBody(event);

  const orgId: string = body?.orgId;
  const kind = body?.kind as ChangeKind;
  const action = (body?.action || "update") as ChangeAction;

  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!CHANGE_KINDS.includes(kind)) throw createError({ statusCode: 400, message: "Invalid kind" });
  if (!CHANGE_ACTIONS.includes(action)) throw createError({ statusCode: 400, message: "Invalid action" });

  // Resolve THIS user's member record in the org (also enforces membership).
  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });

  const admin = getTypedDirectus();

  // For edits/removals of an existing vehicle/pet, prove ownership first.
  if ((kind === "vehicle" || kind === "pet") && (action === "update" || action === "delete")) {
    if (!body?.targetId) throw createError({ statusCode: 400, message: "targetId is required" });
    await assertTargetOwnedByMember(admin, KIND_TARGET[kind], body.targetId, memberId);
  }

  const safe = buildSafeChange({ kind, action, memberId, targetId: body?.targetId, payload: body?.payload });

  if (kind === "vehicle" || kind === "pet") {
    // A new pet or vehicle goes on a unit: the one chosen, which must be one of
    // the resident's here, or their only one. The number is kept for the reviewer.
    if (safe.action === "create") {
      const units = await memberUnitsInOrg(orgId, memberId);
      const requested = body?.payload?.unit_id;
      if (requested != null && requested !== "" && !units.some((u) => u.id === requested)) {
        throw createError({ statusCode: 400, message: "That unit isn't one of yours." });
      }
      const unitId = chooseRecordUnit(requested, units.map((u) => u.id));
      if (unitId) {
        safe.payload.unit_id = unitId;
        safe.payload.unit_number = units.find((u) => u.id === unitId)?.unit_number ?? null;
      }
    }
    // A photo must be one this community may use, as on the admin's unit page.
    await assertPhotoInOrg(orgId, safe.payload.image);
  }

  const created = await admin.request(
    createItem("hoa_member_change_requests", {
      status: "pending",
      organization: orgId,
      member: memberId,
      submitted_by: userId,
      kind,
      action: safe.action,
      target_collection: safe.target_collection,
      target_id: safe.target_id,
      payload: safe.payload,
      note: typeof body?.note === "string" ? body.note.trim() || null : null,
    })
  );

  // Tell reviewers a request is waiting. Awaited (Vercel freezes the function
  // once it answers, so a detached notify never arrived) but never fatal.
  try {
    await notifyReviewersOfChangeRequest(orgId, created, memberId);
  } catch (e) {
    console.error("[change-requests] reviewer notify failed:", e);
  }

  return { success: true, request: created };
});
