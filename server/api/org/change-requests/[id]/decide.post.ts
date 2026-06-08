import { readItem, updateItem } from "@directus/sdk";
import { applyChangeRequest } from "~~/server/utils/change-requests";

/**
 * Reviewer (admin / PM-directory) approves or rejects a pending change request.
 * On approve, the whitelisted payload is applied to the live record; on reject,
 * a note is recorded. Either way the resident is notified.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const id = getRouterParam(event, "id");
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  const decision = String(body?.decision || "");

  if (!id) throw createError({ statusCode: 400, message: "Missing request id" });
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (decision !== "approve" && decision !== "reject") {
    throw createError({ statusCode: 400, message: "decision must be approve or reject" });
  }

  await requireChangeReviewer(event, orgId);
  const admin = getTypedDirectus();

  const cr = await admin.request(
    readItem("hoa_member_change_requests", id, {
      fields: ["id", "status", "kind", "action", "target_collection", "target_id", "payload", "organization", "member", "submitted_by"],
    })
  );

  const crOrg = typeof cr.organization === "string" ? cr.organization : cr.organization?.id;
  if (!cr || crOrg !== orgId) throw createError({ statusCode: 404, message: "Request not found" });
  if (cr.status !== "pending") throw createError({ statusCode: 409, message: "Request already decided" });

  const nowIso = new Date().toISOString();

  if (decision === "approve") {
    await applyChangeRequest(admin, cr, nowIso);
    await admin.request(
      updateItem("hoa_member_change_requests", id, {
        status: "approved",
        reviewed_by: userId,
        reviewed_at: nowIso,
        review_note: typeof body?.note === "string" ? body.note.trim() || null : null,
      })
    );
  } else {
    await admin.request(
      updateItem("hoa_member_change_requests", id, {
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: nowIso,
        review_note: typeof body?.note === "string" ? body.note.trim() || null : null,
      })
    );
  }

  notifyResidentOfDecision(orgId, { ...cr, status: decision === "approve" ? "approved" : "rejected" }).catch((e) =>
    console.error("[change-requests] resident notify failed:", e)
  );

  return { success: true, status: decision === "approve" ? "approved" : "rejected" };
});
