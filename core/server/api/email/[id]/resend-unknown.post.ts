/**
 * POST /api/email/:id/resend-unknown — "Resend to these N unknown"
 * (core/shared/email/resend-unknown.ts; docs/spec-email-send-queue.md §3.4).
 *
 * Sends nothing. It makes a NEW DRAFT of the email, same content and class,
 * addressed only to the members whose row of the latest send has been
 * `unknown` for an hour, and answers its id; the admin opens it in the
 * composer, looks, and sends it the normal way (every send rule applies
 * there). No cc/bcc: the board already had its copy.
 *
 * Same gate as sending. 409 while the send is still running, and when nobody
 * is ready yet (with when they will be).
 */
import { createItem, readItem, readItems } from "@directus/sdk";
import { planUnknownResend } from "#core/shared/email/resend-unknown";
import { emailComplianceSchema } from "../../../utils/email-compliance";
import { emailQueueSchema } from "../../../utils/email-send-queue";
import { buildUniqueWebSlug } from "../../../utils/email-branding";

const FINISHED = new Set(["sent", "failed", "scheduled"]);

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Email ID is required" });

  const directus = getTypedDirectus();
  const schema = await emailComplianceSchema(directus).catch(() => ({ members: false, emailClass: false }));
  const email = (await directus
    .request(
      readItem("hoa_emails", id, {
        fields: [
          "id",
          "organization",
          "status",
          "subject",
          "content",
          "email_type",
          "content_mode",
          "greeting",
          "salutation",
          "include_board_footer",
          "header_text",
          "footer_image",
          "send_run_key",
          ...(schema.emailClass ? ["email_class"] : []),
          { attachments: ["directus_files_id"] },
        ] as any,
      })
    )
    .catch(() => null)) as Record<string, any> | null;
  if (!email) throw createError({ statusCode: 404, message: "Email not found" });
  const organizationId = typeof email.organization === "object" ? email.organization?.id : email.organization;
  if (!organizationId) throw createError({ statusCode: 404, message: "Email not found" });
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  if (!(await emailQueueSchema(directus)) || !email.send_run_key || !FINISHED.has(email.status)) {
    throw createError({
      statusCode: 409,
      message: "This email has no finished send to resend from.",
      data: { code: "not_finished" },
    });
  }

  const rows = (await directus.request(
    readItems("hoa_email_recipients", {
      filter: { email: { _eq: id }, run_key: { _eq: email.send_run_key }, status: { _eq: "unknown" } },
      fields: ["status", "kind", "member", "claimed_at"],
      limit: -1,
    })
  )) as any[];
  const plan = planUnknownResend(rows, Date.now());
  if (!plan.memberIds.length) {
    throw createError({
      statusCode: 409,
      message: plan.waiting
        ? "These recipients are still within the hour SendGrid gets to report on them."
        : "Nobody on this send is unknown.",
      data: { code: plan.waiting ? "not_ready" : "none_unknown", readyAt: plan.readyAt },
    });
  }

  const taken = new Set(
    (
      (await directus.request(
        readItems("hoa_emails", {
          filter: { organization: { _eq: organizationId }, web_slug: { _nnull: true } },
          fields: ["web_slug"],
          limit: -1,
        })
      )) as Array<{ web_slug?: string | null }>
    )
      .map((r) => r.web_slug)
      .filter(Boolean) as string[]
  );

  const attachments = (Array.isArray(email.attachments) ? email.attachments : [])
    .map((a: any) => (typeof a?.directus_files_id === "object" ? a.directus_files_id?.id : a?.directus_files_id))
    .filter(Boolean)
    .map((fileId: string) => ({ directus_files_id: fileId }));

  const draft = (await directus.request(
    createItem("hoa_emails", {
      organization: organizationId,
      subject: email.subject,
      content: email.content,
      email_type: email.email_type,
      content_mode: email.content_mode ?? "visual",
      greeting: email.greeting ?? null,
      salutation: email.salutation ?? null,
      include_board_footer: email.include_board_footer ?? true,
      header_text: email.header_text ?? null,
      footer_image: typeof email.footer_image === "object" ? (email.footer_image?.id ?? null) : (email.footer_image ?? null),
      status: "draft",
      scheduled_at: null,
      next_run_at: null,
      recurrence_rule: "none",
      recipient_filter: "custom",
      recipient_ids: plan.memberIds,
      attachments,
      cc: null,
      bcc: null,
      web_slug: buildUniqueWebSlug(email.subject || "email", taken),
      ...(schema.emailClass && email.email_class ? { email_class: email.email_class } : {}),
    } as any)
  )) as { id: string };

  return {
    draftId: draft.id,
    members: plan.memberIds.length,
    waiting: plan.waiting,
    notResendable: plan.notResendable,
  };
});
