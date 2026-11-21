/**
 * GET /api/org/forms/:id/signed-copy?orgId=&memberId= — a PDF of one signature:
 * the form, who signed, the typed name and the audit trail (time, IP, browser).
 * A member gets their own; an admin or board member of this community gets
 * anyone's (pass memberId).
 */
import { renderSignedCopyPdf } from "#core/server/utils/form-signed-copy";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  const q = getQuery(event);
  const orgId = String(q.orgId || "");
  if (!id || !orgId) throw createError({ statusCode: 400, statusMessage: "id and orgId are required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const staff = context.hats.admin || context.hats.board;
  const memberId = staff && q.memberId ? String(q.memberId) : context.membershipId;

  const [forms, sigs, recipients] = await Promise.all([
    readSignForms(orgId, { onlyId: id }),
    readSignatures(orgId, { member: memberId, form: id }),
    readAckRecipients(orgId),
  ]);
  const form = forms[0];
  const sig = sigs[0];
  if (!form || !sig) throw createError({ statusCode: 404, statusMessage: "No signature found." });
  const person = recipients.find((r) => r.memberId === memberId);

  const pdf = await renderSignedCopyPdf({
    formTitle: form.title ?? "Form",
    description: form.description,
    memberName: person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "",
    signedName: sig.signedName,
    signedAt: sig.signedAt,
    ip: sig.ip,
    userAgent: sig.userAgent,
  });
  const safe = (form.title ?? "form").replace(/[^\w.-]+/g, "-").slice(0, 60);
  setResponseHeader(event, "Content-Type", "application/pdf");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="signed-${safe}.pdf"`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return pdf;
});
