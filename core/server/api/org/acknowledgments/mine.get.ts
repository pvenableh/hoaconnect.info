/**
 * GET /api/org/acknowledgments/mine?orgId=
 *
 * The notices the caller still owes an acknowledgment for, soonest due first.
 * The audience decision is `outstandingFor` (pure): organization, residency and
 * board hat of the caller's own membership in THIS community.
 *
 * One Directus request: the caller's role context and their rows go out as
 * one batch (getRoleContextWith). Their own signatures/acknowledgments are
 * read through their memberships here (the membership id is not known yet)
 * and narrowed to the one the context picked.
 */
import { outstandingFor } from "#core/shared/home/acknowledgments";
import { ackNoticesSpec, acksSpec, toAck, toNotice } from "#core/server/utils/acknowledgments";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = String(session.user?.id ?? "");
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed, rows } = await getRoleContextWith(event, orgId, {
    notices: ackNoticesSpec(orgId),
    acks: acksSpec(orgId, { memberOf: userId }),
  });
  if (!allowed || !context.membershipId) return { notices: [] };

  const notices = rows.notices.map(toNotice);
  const acks = rows.acks.map(toAck).filter((a) => a.member === context.membershipId);
  const who = { memberId: context.membershipId, organization: orgId, residency: context.residency, board: context.hats.board };
  return { notices: outstandingFor(who, notices, acks, new Date()) };
});
