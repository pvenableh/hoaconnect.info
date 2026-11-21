/**
 * POST /api/org/forms/sign  { orgId, formId, signedName }
 *
 * The caller signs a form with a typed name. The row is written with the admin
 * token so the route, not the browser, sets the audit trail (time, IP, browser),
 * the organization and `sign_key` (the unique index: one signature per member
 * per form). The form must be open, in this community and address the caller.
 * Signing twice is a no-op that still answers ok.
 */
import { createItem } from "@directus/sdk";
import { cleanSignedName, outstandingFormsFor, signKey } from "#core/shared/home/forms";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  const formId = String(body?.formId || "");
  if (!orgId || !formId) throw createError({ statusCode: 400, statusMessage: "orgId and formId are required" });
  const signedName = cleanSignedName(body?.signedName);
  if (!signedName) throw createError({ statusCode: 400, statusMessage: "Type your full name to sign." });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const memberId = context.membershipId;
  await requireFormsPlan(orgId);

  const [forms, sigs] = await Promise.all([readSignForms(orgId, { onlyId: formId }), readSignatures(orgId, { member: memberId, form: formId })]);
  if (sigs.length) return { ok: true, already: true };

  const who = { memberId, organization: orgId, residency: context.residency, board: context.hats.board };
  if (!outstandingFormsFor(who, forms, []).some((f) => f.id === formId)) {
    throw createError({ statusCode: 404, statusMessage: "That form is not open for your signature." });
  }

  try {
    await getTypedDirectus().request(
      createItem("hoa_form_signatures", {
        organization: orgId,
        form: formId,
        member: memberId,
        signed_at: new Date().toISOString(),
        signed_name: signedName,
        ip: getRequestIP(event, { xForwardedFor: true }) || null,
        user_agent: (getRequestHeader(event, "user-agent") || "").slice(0, 500) || null,
        sign_key: signKey(formId, memberId),
      } as never)
    );
  } catch (e: any) {
    // The unique index caught a second submit that raced the first.
    if (e?.errors?.[0]?.extensions?.code === "RECORD_NOT_UNIQUE") return { ok: true, already: true };
    throw e;
  }
  return { ok: true, already: false };
});
