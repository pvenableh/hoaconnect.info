/**
 * GET /api/org/responsibilities/published?orgId= — what owners and tenants
 * read (docs/spec-responsibilities.md, "What each audience reads"). Nothing
 * until the community publishes and the module is on. Then today's holders
 * of each published job: job, who, cadence, last verified, nothing else. A
 * job nobody holds appears only with "show unassigned" on, as its title and
 * the date. Never basis, notes, files, history, disputes or contact fields.
 * The owner view's `def.load`.
 */
import { requireOrgParam, requirePublishedRead } from "#core/server/utils/responsibility-access";
import { loadAssignees, loadBoardTerms, loadJobs, loadNames, loadOrgSwitches } from "#core/server/utils/responsibilities";
import { publishedRows } from "#core/shared/responsibilities/views";
import { todayUtc } from "#core/shared/roles/role-context";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgParam(getQuery(event).orgId);
  await requirePublishedRead(event, orgId);
  const org = await loadOrgSwitches(orgId);
  if (!org.published || !org.moduleOn) return { published: false, responsibilities: [] };

  const [jobs, assignees, terms] = await Promise.all([loadJobs(orgId), loadAssignees(orgId), loadBoardTerms(orgId)]);
  const names = await loadNames(orgId, assignees);
  return { published: true, responsibilities: publishedRows(jobs, assignees, names, terms, todayUtc(), org.showUnassigned) };
});
