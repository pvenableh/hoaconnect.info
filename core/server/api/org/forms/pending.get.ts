/**
 * GET /api/org/forms/pending?orgId=
 *
 * The tracking list: for each open form, who has signed (with when) and who has
 * not. Board hat or admin of THIS organization only: Directus has no board
 * read-all (the board uses the Member policy), so the check is here.
 */
import { openForms, unsignedBy, formReaches } from "#core/shared/home/forms";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !(context.hats.admin || context.hats.board)) {
    throw createError({ statusCode: 403, statusMessage: "Only this community's board or administrators can see who has not signed." });
  }

  const [all, recipients, sigs] = await Promise.all([readSignForms(orgId), readAckRecipients(orgId), readSignatures(orgId, {})]);
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
