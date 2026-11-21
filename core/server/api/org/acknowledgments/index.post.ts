/**
 * POST /api/org/acknowledgments  { orgId, announcementId, method? }
 *
 * The caller acknowledges a notice. The row is written with the admin token so
 * the route, not the browser, sets `ack_key` (the unique index: one
 * acknowledgment per member per notice) and the organization. The notice must be
 * live, ask for acknowledgment, belong to this community and reach the caller.
 * Acknowledging twice is a no-op that still answers ok.
 */
import { createItem } from "@directus/sdk";
import { ackKey, outstandingFor } from "#core/shared/home/acknowledgments";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  const announcementId = String(body?.announcementId || "");
  const method = body?.method === "button" ? "button" : "swipe";
  if (!orgId || !announcementId) throw createError({ statusCode: 400, statusMessage: "orgId and announcementId are required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const memberId = context.membershipId;

  const [notices, acks] = await Promise.all([
    readAckNotices(orgId, announcementId),
    readAcks(orgId, { member: memberId, announcement: announcementId }),
  ]);
  if (acks.length) return { ok: true, already: true };

  const who = { memberId, organization: orgId, residency: context.residency, board: context.hats.board };
  const owed = outstandingFor(who, notices, [], new Date());
  if (!owed.some((n) => n.id === announcementId)) {
    throw createError({ statusCode: 404, statusMessage: "That notice does not need your acknowledgment." });
  }

  try {
    await getTypedDirectus().request(
      createItem("hoa_acknowledgments", {
        organization: orgId,
        announcement: announcementId,
        member: memberId,
        acknowledged_at: new Date().toISOString(),
        method,
        ack_key: ackKey(announcementId, memberId),
      } as never)
    );
  } catch (e: any) {
    // The unique index caught a second tap that raced the first.
    if (e?.errors?.[0]?.extensions?.code === "RECORD_NOT_UNIQUE") return { ok: true, already: true };
    throw e;
  }
  return { ok: true, already: false };
});
