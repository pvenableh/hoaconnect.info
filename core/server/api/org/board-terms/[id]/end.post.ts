/**
 * POST /api/org/board-terms/[id]/end — End term (plan §3.4, "History: end,
 * don't erase"). Sets `term_end` to the last day served and the reason
 * (term ended · resigned · removed), and freezes the member's name on the
 * term. Admin only, as the Board tab is.
 */
import { updateItem } from "@directus/sdk";
import { requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { idParam, loadBoardTerm, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { endTermBody } from "#core/shared/responsibilities/schemas";
import { planTermChange } from "#core/shared/responsibilities/plan";
import { termPerson } from "#core/shared/responsibilities/views";
import { sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, endTermBody);
  const access = await requireResponsibilitiesAdmin(event, b.orgId);
  const term = await loadBoardTerm(b.orgId, id);

  const r = planTermChange(term, { kind: "end", lastDay: b.lastDay, reason: b.reason });
  if (r.ok === false) throw createError({ statusCode: r.status, message: r.error });
  const person = termPerson(term);
  await getTypedDirectus().request(updateItem("hoa_board_members", id, { ...r.plan.patch, holder_name: person } as any));

  await logRegisterActivity(event, access, {
    type: "board_term",
    collection: "hoa_board_members",
    id,
    label: sentences.termEnded(person, String(term.title), b.reason),
    metadata: { action: "end", lastDay: b.lastDay, reason: b.reason },
  });
  return { id, term_end: b.lastDay, end_reason: b.reason };
});
