/**
 * GET /api/org/forms/mine?orgId=
 *
 * The open forms the caller still owes a signature on, soonest due first.
 * The audience decision is `outstandingFormsFor` (pure): organization,
 * residency and board hat of the caller's own membership in THIS community.
 */
import { outstandingFormsFor } from "#core/shared/home/forms";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) return { forms: [] };
  // An ungated plan owes no signatures: the row stays off the home.
  if (!(await getFormsGate(orgId)).allowed) return { forms: [] };

  const [forms, sigs] = await Promise.all([readSignForms(orgId, { onlyOpen: true }), readSignatures(orgId, { member: context.membershipId })]);
  const who = { memberId: context.membershipId, organization: orgId, residency: context.residency, board: context.hats.board };
  const owed = outstandingFormsFor(who, forms, sigs);
  return {
    forms: owed.map((f) => {
      const row = forms.find((x) => x.id === f.id)!;
      return { id: f.id, title: f.title ?? "Form", description: row.description, dueDate: f.due_date ?? null, hasDocument: !!row.document };
    }),
  };
});
