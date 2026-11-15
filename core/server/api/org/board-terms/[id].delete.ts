/**
 * DELETE /api/org/board-terms/[id]?orgId= — for a term entered by mistake,
 * and only then. Refused (409) while the term is history someone relies on:
 * a register row for that office whose dates overlap it (deleting would
 * change who the register says did the job), or a meeting attendance that
 * links it. Ending a real term is End term. Admin only.
 */
import { deleteItem, readItems } from "@directus/sdk";
import { requireOrgParam, requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { idParam, loadAssignees, loadBoardTerm, loadJobs, logRegisterActivity } from "#core/server/utils/responsibilities";
import { termPerson } from "#core/shared/responsibilities/views";
import { sentences } from "#core/shared/responsibilities/activity";

/** The office rows whose dates overlap the term (both ends inclusive, open ends unbounded). */
function overlapping<T extends { office?: unknown; start_date?: string | null; end_date?: string | null }>(
  rows: readonly T[],
  office: string,
  start: string | null,
  end: string | null
): T[] {
  return rows.filter(
    (r) =>
      r.office === office &&
      (!end || !r.start_date || r.start_date <= end) &&
      (!start || !r.end_date || r.end_date >= start)
  );
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const orgId = requireOrgParam(getQuery(event).orgId);
  const access = await requireResponsibilitiesAdmin(event, orgId);
  const term = await loadBoardTerm(orgId, id);

  if (term.status === "published" && term.title) {
    const deps = overlapping(await loadAssignees(orgId), term.title, term.term_start ?? null, term.term_end ?? null);
    if (deps.length) {
      const jobs = await loadJobs(orgId);
      const titles = [...new Set(deps.map((r) => jobs.find((j) => j.id === r.responsibility)?.title).filter(Boolean))];
      throw createError({
        statusCode: 409,
        message: `The register names this office on ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` and ${titles.length - 3} more` : ""} during this term. End the term instead.`,
        data: { code: "term_in_use", jobs: titles },
      });
    }
  }
  const d = getTypedDirectus();
  const attended = (await d.request(
    readItems("hoa_meeting_attendees", { filter: { board_term: { _eq: id } } as any, fields: ["id"], limit: 1 })
  )) as unknown[];
  if (attended?.length) {
    throw createError({ statusCode: 409, message: "A meeting's attendance records this term. End the term instead.", data: { code: "term_in_use" } });
  }

  await d.request(deleteItem("hoa_board_members", id));
  await logRegisterActivity(event, access, {
    type: "board_term",
    collection: "hoa_board_members",
    id,
    label: sentences.termDeleted(termPerson(term), String(term.title)),
    metadata: { action: "delete", term: { title: term.title, term_start: term.term_start, term_end: term.term_end } },
  });
  return { id, deleted: true };
});
