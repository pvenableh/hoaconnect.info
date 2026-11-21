/**
 * GET /api/org/acknowledgments/mine?orgId=
 *
 * The notices the caller still owes an acknowledgment for, soonest due first.
 * The audience decision is `outstandingFor` (pure): organization, residency and
 * board hat of the caller's own membership in THIS community.
 */
import { outstandingFor } from "#core/shared/home/acknowledgments";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) return { notices: [] };

  const [notices, acks] = await Promise.all([readAckNotices(orgId), readAcks(orgId, { member: context.membershipId })]);
  const who = { memberId: context.membershipId, organization: orgId, residency: context.residency, board: context.hats.board };
  return { notices: outstandingFor(who, notices, acks, new Date()) };
});
