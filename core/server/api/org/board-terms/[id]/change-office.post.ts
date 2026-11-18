/**
 * POST /api/org/board-terms/[id]/change-office — the member moves to another
 * office on `effective`. The term ends the day before with `changed_office`
 * and the member's name frozen, and a term opens for the same member from
 * `effective`, keeping the planned end when it is later. Admin only. If the
 * new term cannot be opened, the end is undone.
 */
import { createItem, updateItem } from "@directus/sdk";
import { requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { idParam, loadBoardTerm, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { changeOfficeBody } from "#core/shared/responsibilities/schemas";
import { planTermChange } from "#core/shared/responsibilities/plan";
import { termPerson } from "#core/shared/responsibilities/views";
import { sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, changeOfficeBody);
  const access = await requireResponsibilitiesAdmin(event, b.orgId);
  const term = await loadBoardTerm(b.orgId, id);
  if (!term.hoa_member) throw createError({ statusCode: 409, message: "This term has no member any more." });

  const r = planTermChange(term, { kind: "change_office", effective: b.effective, office: b.office });
  if (r.ok === false) throw createError({ statusCode: r.status, message: r.error });
  const person = termPerson(term);
  const d = getTypedDirectus();
  await d.request(updateItem("hoa_board_members", id, { ...r.plan.patch, holder_name: person } as any));

  let opened: string;
  try {
    const created = (await d.request(
      createItem("hoa_board_members", { hoa_member: term.hoa_member, ...r.plan.open!, user_created: access.userId } as any)
    )) as unknown as { id: string };
    opened = created.id;
  } catch (e) {
    console.error("[board-terms] change-office open failed; undoing the end:", e);
    await d.request(
      updateItem("hoa_board_members", id, { term_end: term.term_end ?? null, end_reason: null, holder_name: term.holder_name ?? null } as any)
    );
    throw createError({ statusCode: 500, message: "Couldn't change the office. Nothing changed." });
  }

  // Seats changed: money approvals waiting on the board are asked again (docs/spec-money-approvals.md).
  await settleAfterBoardChange(event, b.orgId);
  await logRegisterActivity(event, access, {
    type: "board_term",
    collection: "hoa_board_members",
    id: opened,
    label: sentences.officeChanged(person, String(term.title), b.office),
    metadata: { action: "change_office", ended: id, opened, effective: b.effective },
  });
  return { ended: id, opened };
});
