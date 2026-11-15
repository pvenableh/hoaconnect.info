/**
 * GET /api/org/responsibilities/service-history?orgId=&member= — one member's
 * offices held and jobs held, with dates (plan §3.4), for the member detail.
 * Editors and the board, as the register is: owners see the present only.
 */
import { readItems } from "@directus/sdk";
import { requireOrgParam, requireResponsibilitiesRead } from "#core/server/utils/responsibility-access";
import { loadAssignees, loadBoardTerms, loadJobs } from "#core/server/utils/responsibilities";
import { serviceHistory } from "#core/shared/responsibilities/history";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = requireOrgParam(q.orgId);
  const memberId = typeof q.member === "string" ? q.member.trim() : "";
  if (!memberId) throw createError({ statusCode: 400, message: "member is required" });
  await requireResponsibilitiesRead(event, orgId);

  const rows = (await getTypedDirectus().request(
    readItems("hoa_members", { filter: { id: { _eq: memberId }, organization: { _eq: orgId } }, fields: ["id", "user"], limit: 1 })
  )) as { id: string; user?: unknown }[];
  const member = rows?.[0];
  if (!member) throw createError({ statusCode: 404, message: "Member not found" });
  const user = typeof member.user === "string" ? member.user : ((member.user as { id?: string } | null)?.id ?? null);

  const [jobs, assignees, terms] = await Promise.all([loadJobs(orgId), loadAssignees(orgId), loadBoardTerms(orgId)]);
  return serviceHistory({ id: member.id, user }, terms, assignees, jobs);
});
