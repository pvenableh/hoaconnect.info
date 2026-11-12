/**
 * POST /api/email/:id/retry-failed — "Retry the N that failed"
 * (core/shared/email/failed-sends.ts).
 *
 * Sends nothing. Like resend-unknown, it makes a NEW DRAFT of the email, same
 * content and class, addressed only to the members whose row of the latest
 * send is `failed`, and answers its id; the admin opens it in the composer and
 * sends it the normal way (every send rule applies there). No cc/bcc.
 *
 * Same gate as sending. 409 while the send is still running, and when no
 * member's row failed.
 */
import { readItem, readItems } from "@directus/sdk";
import { planFailedRetry } from "#core/shared/email/failed-sends";
import { emailComplianceSchema } from "../../../utils/email-compliance";
import { emailQueueSchema } from "../../../utils/email-send-queue";
import { RESEND_DRAFT_SOURCE_FIELDS, createResendDraft } from "../../../utils/email-resend-draft";

const FINISHED = new Set(["sent", "failed", "scheduled"]);

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Email ID is required" });

  const directus = getTypedDirectus();
  const schema = await emailComplianceSchema(directus).catch(() => ({ members: false, emailClass: false }));
  const queue = await emailQueueSchema(directus).catch(() => false);
  const email = (await directus
    .request(
      readItem("hoa_emails", id, {
        fields: [
          "id",
          "organization",
          "status",
          ...RESEND_DRAFT_SOURCE_FIELDS,
          ...(queue ? ["send_run_key"] : []),
          ...(schema.emailClass ? ["email_class"] : []),
        ] as any,
      })
    )
    .catch(() => null)) as Record<string, any> | null;
  if (!email) throw createError({ statusCode: 404, message: "Email not found" });
  const organizationId = typeof email.organization === "object" ? email.organization?.id : email.organization;
  if (!organizationId) throw createError({ statusCode: 404, message: "Email not found" });
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  if (!FINISHED.has(email.status)) {
    throw createError({
      statusCode: 409,
      message: "This email has no finished send to retry.",
      data: { code: "not_finished" },
    });
  }

  // The latest occurrence's rows with the send queue; every row before it.
  const rows = (await directus.request(
    readItems("hoa_email_recipients", {
      filter: {
        email: { _eq: id },
        status: { _eq: "failed" },
        ...(email.send_run_key ? { run_key: { _eq: email.send_run_key } } : {}),
      },
      fields: ["status", "member", ...(queue ? ["kind"] : [])],
      limit: -1,
    } as any)
  )) as any[];
  const plan = planFailedRetry(rows);
  if (!plan.memberIds.length) {
    throw createError({
      statusCode: 409,
      message: "Nobody on this send failed.",
      data: { code: "none_failed" },
    });
  }

  const draft = await createResendDraft(directus, email, organizationId, plan.memberIds, { emailClass: schema.emailClass });

  return { draftId: draft.id, members: plan.memberIds.length, notRetryable: plan.notRetryable };
});
