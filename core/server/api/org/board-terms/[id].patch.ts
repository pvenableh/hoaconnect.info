/**
 * PATCH /api/org/board-terms/[id] — Correct: fix a typo in place (office,
 * dates, message, icon, status, end reason). The only in-place edit, and
 * never the member: a different person is a different term. Admin only. The
 * activity row carries what it was and what it became.
 */
import { updateItem } from "@directus/sdk";
import { requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { idParam, loadBoardTerm, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { correctTermBody } from "#core/shared/responsibilities/schemas";
import { planTermChange } from "#core/shared/responsibilities/plan";
import { termPerson } from "#core/shared/responsibilities/views";
import { fieldWords, sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const { orgId, ...patch } = await readBodyWith(event, correctTermBody);
  const access = await requireResponsibilitiesAdmin(event, orgId);
  const term = await loadBoardTerm(orgId, id);

  const r = planTermChange(term, { kind: "correct", patch });
  if (r.ok === false) throw createError({ statusCode: r.status, message: r.error });
  const changed = Object.keys(r.plan.patch).filter((k) => (term as unknown as Record<string, unknown>)[k] !== r.plan.patch[k]);
  if (!changed.length) return { id, changed: [] };
  const after = Object.fromEntries(changed.map((k) => [k, r.plan.patch[k]]));
  const before = Object.fromEntries(changed.map((k) => [k, (term as unknown as Record<string, unknown>)[k] ?? null]));
  await getTypedDirectus().request(updateItem("hoa_board_members", id, after as any));

  // Seats changed: money approvals waiting on the board are asked again (docs/spec-money-approvals.md).
  await settleAfterBoardChange(event, orgId);
  await logRegisterActivity(event, access, {
    type: "board_term",
    collection: "hoa_board_members",
    id,
    label: sentences.termCorrected(termPerson(term), String(after.title ?? term.title), fieldWords(changed)),
    metadata: { action: "correct", before, after },
  });
  return { id, changed };
});
