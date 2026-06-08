import { createItem } from "@directus/sdk";
import {
  CHANGE_KINDS,
  CHANGE_ACTIONS,
  KIND_TARGET,
  buildSafeChange,
  assertTargetOwnedByMember,
  type ChangeKind,
  type ChangeAction,
} from "~~/server/utils/change-requests";

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

  // Fire-and-forget: tell reviewers a request is waiting (never block the submit).
  notifyReviewersOfChangeRequest(orgId, created, memberId).catch((e) =>
    console.error("[change-requests] reviewer notify failed:", e)
  );

  return { success: true, request: created };
});
