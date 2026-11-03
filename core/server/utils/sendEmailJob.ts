/**
 * Phase 9 (Stage C) — the scheduled-email send job; since Phase 3b a client of
 * the send queue (docs/spec-email-send-queue.md §7.4).
 *
 * Once `pnpm add:email-send-queue` has run, `sendEmailJob(id)` only ENQUEUES:
 * it snapshots the email's audience as `queued` rows (email-send-enqueue.ts)
 * and returns once `total_recipients` is set; the tick
 * (`/api/email/cron/continue-sends`) does the sending. Before the script runs
 * it keeps today's synchronous loop (`legacySendEmailJob`), so a deploy ahead
 * of the script changes nothing.
 */
import { readItem, readItems, createItem, updateItem } from "@directus/sdk";
import { sendOrganizationEmail, resolveSender } from "./sendgrid";
import {
  appendComplianceFooterHtml,
  buildEmailHtml,
  buildEmailText,
  buildRawEmailHtml,
  type EmailType,
} from "./email-templates-mjml";
import { resolveMergeFields, applyMergeFields } from "./email-merge";
import { partitionAudience } from "#core/shared/email/email-class";
import { checkSendCompliance, recipientCompliance } from "#core/shared/email/unsubscribe";
import { emailComplianceSchema, ensureUnsubscribeTokens } from "./email-compliance";
import { directusRecipientStore, emailQueueSchema } from "./email-send-queue";
import { EmailComplianceRefusal, enqueueScheduled, resolveScheduledAudience } from "./email-send-enqueue";
import type {
  HoaBoardMember,
  HoaEmailRecipient,
  HoaMember,
  HoaOrganization,
  BlockSetting,
} from "#core/types/directus";

export interface SendJobResult {
  emailId: string;
  /** True when the email was enqueued (the tick sends it); delivered/failed are then 0. */
  queued?: boolean;
  total: number;
  delivered: number;
  failed: number;
  /** Left out by the class rules: bounced (every class), opted out (community). */
  suppressed: { bounced: number; optedOut: number };
}

/**
 * Enqueue a saved scheduled email for the tick to send. Throws
 * EmailComplianceRefusal for what retrying can't fix (the caller marks the
 * email failed) and SendInProgress when another scheduler got there first.
 * Before the queue's schema exists, sends synchronously as before.
 */
export async function sendEmailJob(emailId: string): Promise<SendJobResult> {
  const directus = getTypedDirectus();
  if (await emailQueueSchema(directus)) {
    const r = await enqueueScheduled(directus, directusRecipientStore(directus), emailId, { now: () => Date.now() });
    return { emailId, queued: true, total: r.total, delivered: 0, failed: 0, suppressed: r.suppressed };
  }
  return legacySendEmailJob(emailId);
}

/**
 * Before `pnpm add:email-send-queue`: send to every recipient inside the
 * caller's request, one at a time. Updates the email's delivered/failed counts
 * but NOT its status/recurrence — the caller decides.
 */
export async function legacySendEmailJob(emailId: string): Promise<SendJobResult> {
  const config = useRuntimeConfig();
  const directus = getTypedDirectus();
  // Before `pnpm add:email-compliance` runs, neither the class nor the member
  // flags exist: the job sends as it always did, by the type's default class.
  const schema = await emailComplianceSchema(directus);

  const email = (await directus.request(
    readItem("hoa_emails", emailId, {
      fields: [
        ...(schema.emailClass ? (["email_class"] as const) : []),
        "id", "organization", "subject", "subtitle", "content", "email_type",
        "content_mode", "greeting", "salutation", "include_board_footer", "urgent",
        "recipient_filter", "recipient_ids", "web_slug", "header_text", "footer_image",
      ],
    })
  )) as any;

  if (!email) throw new Error(`Email ${emailId} not found`);

  const organizationId =
    typeof email.organization === "string" ? email.organization : email.organization?.id;

  const organization = (await directus.request(
    readItem("hoa_organizations", organizationId, {
      fields: ["id", "name", "legal_name", "type", "email", "phone", "street_address", "city", "state", "zip", "slug", "external_url",
        { settings: ["id", "logo", "title", "description", "header_text", "homepage_url", "footer_image", "colors", "theme", "from_name", "from_email", "email_domain_verified"] }],
    })
  )) as HoaOrganization & { settings: BlockSetting | null };

  const compliance = checkSendCompliance({
    emailType: email.email_type,
    requestedClass: email.email_class,
    org: organization,
  });
  if (compliance.ok === false) throw new EmailComplianceRefusal(compliance.code, compliance.message);
  const { emailClass, mailingAddress } = compliance;

  const includeBoardFooter = email.include_board_footer ?? true;
  let boardMembers: Array<{ name: string; title: string; icon?: string }> = [];
  if (includeBoardFooter) {
    const records = (await directus.request(
      readItems("hoa_board_members", {
        filter: {
          hoa_member: { organization: { _eq: organizationId }, status: { _eq: "active" } },
          status: { _eq: "published" },
        },
        fields: ["id", "title", "icon", { hoa_member: ["id", "first_name", "last_name"] }],
        sort: ["sort"],
      })
    )) as Array<HoaBoardMember & { hoa_member: HoaMember }>;
    boardMembers = records
      .filter((bm) => bm.hoa_member)
      .map((bm) => ({
        name: `${bm.hoa_member.first_name || ""} ${bm.hoa_member.last_name || ""}`.trim() || "Board Member",
        title: bm.title || "Board Member",
        icon: bm.icon || "",
      }));
  }

  const audience = (await resolveScheduledAudience(
    directus,
    organizationId,
    email.recipient_filter || "all",
    Array.isArray(email.recipient_ids) ? email.recipient_ids : null,
    schema.members
  )) as any[];
  const { recipients, suppressed } = partitionAudience(audience, emailClass);
  const suppressedStats = {
    bounced: suppressed.filter((s) => s.reason === "bounced").length,
    optedOut: suppressed.filter((s) => s.reason === "opted_out").length,
  };
  const members =
    emailClass === "community" && schema.members
      ? await ensureUnsubscribeTokens(directus, recipients)
      : recipients;

  const emailType = (email.email_type || "basic") as EmailType;
  const contentMode = email.content_mode === "mjml" ? "mjml" : "visual";
  const greeting = email.greeting || undefined;
  const salutation = email.salutation || undefined;

  // Resolve branding (per-send overrides over org defaults) and a friendly
  // web-view slug for this scheduled email.
  const branding = resolveEmailBranding(organization, email, {
    appUrl: config.public.appUrl as string,
  });

  let webSlug: string | null = email.web_slug || null;
  if (!webSlug) {
    const slugRows = (await directus.request(
      readItems("hoa_emails", {
        filter: {
          organization: { _eq: organizationId },
          web_slug: { _nnull: true },
          id: { _neq: email.id },
        },
        fields: ["web_slug"],
        limit: -1,
      })
    )) as Array<{ web_slug?: string | null }>;
    const taken = new Set(slugRows.map((r) => r.web_slug).filter(Boolean) as string[]);
    webSlug = buildUniqueWebSlug(email.subject || "", taken);
    await directus.request(updateItem("hoa_emails", email.id, { web_slug: webSlug }));
  }

  const webViewUrl = organization.slug
    ? `${config.public.appUrl}/${organization.slug}/announcements/email/${webSlug || email.id}`
    : `${config.public.appUrl}/api/email/view/${email.id}`;

  const sender = resolveSender(organization, "bulk");
  let delivered = 0;
  let failed = 0;

  for (const member of members) {
    if (!member.email) { failed++; continue; }

    const recipientName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
    const recipientFirstName = member.first_name || undefined;
    const mergeValues = resolveMergeFields(member, organization);
    const recipientContent = applyMergeFields(email.content || "", mergeValues);
    const recipientSubject = applyMergeFields(email.subject || "", mergeValues) || email.subject || "";
    const rc = recipientCompliance({
      emailClass, org: organization, mailingAddress,
      appUrl: config.public.appUrl as string, emailId: String(email.id),
      token: member.unsubscribe_token ?? null,
    });

    const text = buildEmailText({
      organization, subject: recipientSubject, content: recipientContent, emailType,
      greeting, salutation, boardMembers: includeBoardFooter ? boardMembers : undefined,
      recipientFirstName, directusUrl: config.directus.url, complianceFooter: rc.footer,
    });

    const html =
      contentMode === "mjml"
        ? appendComplianceFooterHtml(buildRawEmailHtml(recipientContent), rc.footer)
        : buildEmailHtml({
            organization, subject: recipientSubject, content: recipientContent, emailType,
            greeting, salutation, boardMembers: includeBoardFooter ? boardMembers : undefined,
            recipientFirstName, directusUrl: config.directus.url,
            emailId: email.id, appUrl: config.public.appUrl as string,
            headerText: branding.headerText, footerImage: branding.footerImage,
            homepageUrl: branding.homepageUrl, webViewUrl, complianceFooter: rc.footer,
          });

    try {
      const result = await sendOrganizationEmail({
        to: member.email,
        toName: recipientName || undefined,
        subject: recipientSubject,
        html,
        text,
        ...sender,
        customArgs: { email_id: String(email.id), recipient_email: member.email, organization_id: organizationId },
        organizationId,
        headers: rc.headers,
      });
      delivered++;
      await directus.request(
        createItem("hoa_email_recipients", {
          email: email.id, member: member.id, recipient_email: member.email,
          recipient_name: recipientName || null, status: "sent",
          sent_at: new Date().toISOString(), sg_message_id: result.messageId || null,
        } as Partial<HoaEmailRecipient> & { member: string })
      );
    } catch (err: any) {
      failed++;
      await directus.request(
        createItem("hoa_email_recipients", {
          email: email.id, member: member.id, recipient_email: member.email,
          recipient_name: recipientName || null, status: "failed",
          error_message: err.message || "Failed to send",
        } as Partial<HoaEmailRecipient> & { member: string })
      );
    }
  }

  await directus.request(
    updateItem("hoa_emails", email.id, {
      recipient_count: members.length,
      ...(schema.emailClass ? { email_class: emailClass } : {}),
      delivered_count: delivered,
      failed_count: failed,
      last_run_at: new Date().toISOString(),
    })
  );

  return { emailId: email.id, total: members.length, delivered, failed, suppressed: suppressedStats };
}
