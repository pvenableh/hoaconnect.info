/**
 * GET /api/org/forms/pending?orgId=
 *
 * The tracking list: for each open form, who has signed (with when) and who has
 * not. Board hat or admin of THIS organization only: Directus has no board
 * read-all (the board uses the Member policy), so the check is here.
 *
 * One Directus request: the caller's role context and this list's rows go out
 * as one batch (getRoleContextWith); a caller who may not see the list gets
 * its 403 before any of those rows leave the server.
 */
import { openForms, unsignedBy, formReaches } from "#core/shared/home/forms";
import { signFormsSpec, signaturesSpec, toForm, toSignature } from "#core/server/utils/forms";
import { ackRecipientSpecs, ackRecipientsFrom } from "#core/server/utils/acknowledgments";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const people = ackRecipientSpecs(orgId);
  const { context, allowed, rows } = await getRoleContextWith(event, orgId, {
    forms: signFormsSpec(orgId),
    members: people.members,
    terms: people.terms,
    sigs: signaturesSpec(orgId, {}),
  });
  if (!allowed || !(context.hats.admin || context.hats.board)) {
    throw createError({ statusCode: 403, statusMessage: "Only this community's board or administrators can see who has not signed." });
  }

  const all = rows.forms.map(toForm);
  const recipients = ackRecipientsFrom(orgId, rows.members, rows.terms);
  const sigs = rows.sigs.map(toSignature);
  const nameOf = (p: { firstName: string | null; lastName: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(" ") || "Member";
  return {
    forms: openForms(all, orgId).map((f) => {
      const unsigned = unsignedBy(f, recipients, sigs);
      const signed = sigs
        .filter((s) => s.form === f.id)
        .map((s) => {
          const p = recipients.find((r) => r.memberId === s.member);
          return { memberId: s.member, name: p ? nameOf(p) : "Former member", signedAt: s.signedAt, signedName: s.signedName };
        })
        .sort((a, b) => a.signedAt.localeCompare(b.signedAt));
      return {
        id: f.id,
        title: f.title ?? "Form",
        dueDate: f.due_date ?? null,
        reached: recipients.filter((r) => formReaches(f.audience, r)).length,
        signed,
        pending: unsigned.map((p) => ({ memberId: p.memberId, name: nameOf(p), residency: p.residency })),
      };
    }),
  };
});
