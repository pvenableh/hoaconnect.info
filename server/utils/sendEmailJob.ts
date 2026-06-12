/**
 * Phase 9 (Stage C) — headless send job for scheduled emails.
 *
 * Sends an already-saved hoa_emails record to its targeted recipients without a
 * user session (the Directus scheduled Flow calls process-scheduled, which calls
 * this). It reuses the same rendering + merge utilities as the interactive
 * send.post.ts so output matches; it does NOT re-embed images as CID (scheduled
 * emails keep absolute Directus asset URLs, which load in most clients).
 *
 * Returns delivery stats; the caller handles status + recurrence.
 */
import { readItem, readItems, createItem, updateItem } from "@directus/sdk";
import { sendOrganizationEmail } from "./sendgrid";
import {
  buildEmailHtml,
  buildEmailText,
  buildRawEmailHtml,
  type EmailType,
} from "./email-templates-mjml";
import { resolveMergeFields, applyMergeFields } from "./email-merge";
import type {
  HoaBoardMember,
  HoaEmailRecipient,
  HoaMember,
  HoaOrganization,
  BlockSetting,
} from "~~/types/directus";

export interface SendJobResult {
  emailId: string;
  total: number;
  delivered: number;
  failed: number;
}

/**
 * Resolve the recipient members for an email based on its stored targeting.
 */
async function resolveRecipients(
  directus: ReturnType<typeof getTypedDirectus>,
  organizationId: string,
  recipientFilter: string,
  recipientIds: string[] | null
): Promise<any[]> {
  const baseFilter: Record<string, any> = {
    organization: { _eq: organizationId },
    status: { _eq: "active" },
    email: { _nnull: true },
  };

  if (recipientFilter === "owners") baseFilter.member_type = { _eq: "owner" };
  else if (recipientFilter === "tenants") baseFilter.member_type = { _eq: "tenant" };
  else if (recipientFilter === "custom") {
    if (!recipientIds || recipientIds.length === 0) return [];
    baseFilter.id = { _in: recipientIds };
  }

  return (await directus.request(
    readItems("hoa_members", {
      filter: baseFilter,
      fields: [
        "id", "first_name", "last_name", "email", "phone", "member_type", "company",
        "outstanding_balance", "payment_status", "last_payment_amount", "last_payment_date",
        { units: ["id", "is_primary_unit", { unit_id: ["id", "unit_number"] }] },
        { vehicles: ["id", "make", "model", "year", "license_plate", "parking_spot"] },
        { pets: ["id", "name", "type", "breed"] },
      ],
      limit: -1,
    })
  )) as any[];
}

/**
 * Send a saved email (by id) to its targeted recipients. Updates the email's
 * delivered/failed counts but NOT its status/recurrence — the caller decides
 * whether to mark it sent or reschedule.
 */
export async function sendEmailJob(emailId: string): Promise<SendJobResult> {
  const config = useRuntimeConfig();
  const directus = getTypedDirectus();

  const email = (await directus.request(
    readItem("hoa_emails", emailId, {
      fields: [
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
        { settings: ["id", "logo", "title", "description", "header_text", "homepage_url", "footer_image"] }],
    })
  )) as HoaOrganization & { settings: BlockSetting | null };

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

  const members = await resolveRecipients(
    directus,
    organizationId,
    email.recipient_filter || "all",
    Array.isArray(email.recipient_ids) ? email.recipient_ids : null
  );

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

  let delivered = 0;
  let failed = 0;

  for (const member of members) {
    if (!member.email) { failed++; continue; }

    const recipientName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
    const recipientFirstName = member.first_name || undefined;
    const mergeValues = resolveMergeFields(member, organization);
    const recipientContent = applyMergeFields(email.content || "", mergeValues);
    const recipientSubject = applyMergeFields(email.subject || "", mergeValues) || email.subject || "";

    const text = buildEmailText({
      organization, subject: recipientSubject, content: recipientContent, emailType,
      greeting, salutation, boardMembers: includeBoardFooter ? boardMembers : undefined,
      recipientFirstName, directusUrl: config.directus.url,
    });

    const html =
      contentMode === "mjml"
        ? buildRawEmailHtml(recipientContent)
        : buildEmailHtml({
            organization, subject: recipientSubject, content: recipientContent, emailType,
            greeting, salutation, boardMembers: includeBoardFooter ? boardMembers : undefined,
            recipientFirstName, directusUrl: config.directus.url,
            emailId: email.id, appUrl: config.public.appUrl as string,
            headerText: branding.headerText, footerImage: branding.footerImage,
            homepageUrl: branding.homepageUrl, webViewUrl,
          });

    try {
      const result = await sendOrganizationEmail({
        to: member.email,
        toName: recipientName || undefined,
        subject: recipientSubject,
        html,
        text,
        fromName: organization.name || undefined,
        replyTo: organization.email ? { email: organization.email, name: organization.name || undefined } : undefined,
        customArgs: { email_id: String(email.id), recipient_email: member.email, organization_id: organizationId },
        organizationId,
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
      delivered_count: delivered,
      failed_count: failed,
      last_run_at: new Date().toISOString(),
    })
  );

  return { emailId: email.id, total: members.length, delivered, failed };
}
