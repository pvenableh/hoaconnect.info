/**
 * GET /api/org/acknowledgments/pending?orgId=&announcementId=
 *
 * The "who has not" list for one notice (or every live one). Board hat or admin
 * of THIS organization only: Directus has no board read-all (the board uses the
 * Member policy), so the check is here. The list is people the notice reaches
 * in this community, computed by `unacknowledgedBy`.
 */
import { ackNotices, unacknowledgedBy } from "#core/shared/home/acknowledgments";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = String(q.orgId || "");
  const announcementId = q.announcementId ? String(q.announcementId) : undefined;
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !(context.hats.admin || context.hats.board)) {
    throw createError({ statusCode: 403, statusMessage: "Only this community's board or administrators can see who has not acknowledged." });
  }

  const [all, recipients, acks] = await Promise.all([
    readAckNotices(orgId, announcementId),
    readAckRecipients(orgId),
    readAcks(orgId, announcementId ? { announcement: announcementId } : {}),
  ]);
  const notices = ackNotices(all, orgId, new Date());
  return {
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title ?? "Notice",
      ackDue: n.ack_due ?? null,
      pending: unacknowledgedBy(n, recipients, acks).map((p) => ({
        memberId: p.memberId,
        name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Member",
        residency: p.residency,
      })),
    })),
  };
});
