/**
 * GET /api/org/forms/mine?orgId=
 *
 * The open forms the caller still owes a signature on, soonest due first.
 * The audience decision is `outstandingFormsFor` (pure): organization,
 * residency and board hat of the caller's own membership in THIS community.
 *
 * One Directus request: the caller's role context and their rows go out as
 * one batch (getRoleContextWith). Their own signatures/acknowledgments are
 * read through their memberships here (the membership id is not known yet)
 * and narrowed to the one the context picked.
 */
import { outstandingFormsFor } from "#core/shared/home/forms";
import { formsGate } from "#core/shared/billing/forms-plan";
import { signFormsSpec, signaturesSpec, toForm, toSignature } from "#core/server/utils/forms";
import { formsGateSpec } from "#core/server/utils/forms-gate";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = String(session.user?.id ?? "");
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed, rows } = await getRoleContextWith(event, orgId, {
    plan: formsGateSpec(orgId),
    forms: signFormsSpec(orgId, { onlyOpen: true }),
    sigs: signaturesSpec(orgId, { memberOf: userId }),
  });
  if (!allowed || !context.membershipId) return { forms: [] };
  // An ungated plan owes no signatures: the row stays off the home.
  const gate = rows.plan[0] ? formsGate(rows.plan[0]) : await getFormsGate(orgId);
  if (!gate.allowed) return { forms: [] };

  const forms = rows.forms.map(toForm);
  const sigs = rows.sigs.map(toSignature).filter((s) => s.member === context.membershipId);
  const who = { memberId: context.membershipId, organization: orgId, residency: context.residency, board: context.hats.board };
  const owed = outstandingFormsFor(who, forms, sigs);
  return {
    forms: owed.map((f) => {
      const row = forms.find((x) => x.id === f.id)!;
      return { id: f.id, title: f.title ?? "Form", description: row.description, dueDate: f.due_date ?? null, hasDocument: !!row.document };
    }),
  };
});
