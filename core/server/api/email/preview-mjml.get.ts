/**
 * GET /api/email/preview-mjml?org=<id|slug>&template=<type>&format=html|text|mjml
 *
 * A sample email in an org's branding (Earnest parity round 3, Phase 4),
 * rendered by the same builders the sends use (core/server/emails/ partials):
 *
 *   template  basic | alert | newsletter | announcement | reminder | notice
 *             (an organization email), or `notification` — the branded
 *             notification email (sendBrandedTransactionalEmail), with
 *             `category` = one of the notification categories (default task),
 *             or a reminder (Phase 5a): reminder-dues | reminder-meeting |
 *             reminder-violation | reminder-poll — a sample made by the real
 *             rules (core/server/utils/reminder-email.ts `sampleReminders`)
 *   format    html (default; a whole document, for the Branding card's iframe),
 *             text (the plain-text part), mjml (the composed source)
 *   primary / secondary / accent   an unsaved palette from the form (hex);
 *             `palette=none` previews the platform default
 *   headerText  the form's unsaved header line
 *
 * Renders only: nothing is sent and nothing is written. The HTML answers with
 * `Content-Security-Policy: sandbox`, so even opened on its own the org's
 * content can't run script on our origin.
 *
 * Gate: an admin of the org, or a property manager with the communications
 * grant — the people who can send in its name.
 *
 *             or `invitation` — the member invitation
 *             (core/server/utils/invitation-email.ts), with a sample inviter.
 *
 * The welcome / accepted emails are still SendGrid dynamic templates
 * (email-templates-invite.mjml is their source, not compiled here), so they
 * are not previewable from this route.
 */
import { readItems } from "@directus/sdk";
import type { BlockSetting, HoaOrganization } from "#core/types/directus";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "#core/shared/notifications/preferences";
import { recipientCompliance, orgMailingAddress } from "#core/shared/email/unsubscribe";
import { buildEmailHtml, buildEmailMjml, buildEmailText, type EmailType } from "../../utils/email-templates-mjml";
import { resolveEmailBranding } from "../../utils/email-branding";
import { partialWithCta, transactionalContent } from "../../utils/transactional-email";
import { REMINDER_EMAIL_TEMPLATES, reminderEmail, sampleReminders } from "../../utils/reminder-email";
import { INVITATION_EMAIL_TYPE, invitationEmailParts } from "../../utils/invitation-email";

export const PREVIEW_TEMPLATES = [
  "basic",
  "alert",
  "newsletter",
  "announcement",
  "reminder",
  "notice",
  "notification",
  "invitation",
  ...REMINDER_EMAIL_TEMPLATES,
] as const;
export type PreviewTemplate = (typeof PREVIEW_TEMPLATES)[number];

// The heading is load-bearing: MJML emits a web-font link only for a face it
// sees used, so a sample without an <h*> would never show the display face.
const SAMPLE_CONTENT = `
  <p>This is a preview of how your community's emails look with your branding applied.</p>
  <h2>Your headings look like this</h2>
  <p>Notices, reminders, and alerts sent from the portal all use this template —
  your logo, your header line, your typeface, and your colors.</p>`;

/** A believable notification per category: what the bell + email twin would say. */
const NOTIFICATION_SAMPLES: Record<NotificationCategory, { subject: string; body: string; cta: string; path: string }> = {
  announcement: { subject: "New announcement: Pool opens June 1", body: "The board posted a new announcement.", cta: "Read it", path: "/announcements" },
  meeting: { subject: "Board meeting on Tuesday at 7:00 PM", body: "You're invited to the monthly board meeting.", cta: "View meeting", path: "/meetings" },
  payment: { subject: "Your dues are due on the 1st", body: "Your quarterly assessment of $450.00 is due on the 1st.", cta: "Pay now", path: "/payments" },
  document: { subject: "New document: 2027 budget", body: "A new document was shared with your community.", cta: "Open document", path: "/documents" },
  request: { subject: "Your request was updated", body: "Your maintenance request is now in progress.", cta: "View request", path: "/requests" },
  task: { subject: "A task was assigned to you", body: "You were assigned “Get three bids for the roof”.", cta: "Open task", path: "/admin/projects" },
  mention: { subject: "Alex mentioned you", body: "Alex mentioned you in #landscaping.", cta: "Reply", path: "/channels" },
  channel: { subject: "3 new in #board", body: "Alex and 2 others posted in #board.", cta: "Open channel", path: "/channels" },
  comment: { subject: "New comment on your post", body: "Someone replied to your post.", cta: "View comment", path: "/channels" },
  membership: { subject: "Welcome to the community", body: "Your membership was approved.", cta: "Open the portal", path: "/" },
  ai_insight: { subject: "Two invoices are past due", body: "The assistant noticed two vendor invoices past their due date.", cta: "Review", path: "/admin" },
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v : undefined);

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgKey = typeof q.org === "string" ? q.org.trim() : "";
  if (!orgKey) throw createError({ statusCode: 400, message: "org is required" });

  const template = (typeof q.template === "string" ? q.template : "notice") as PreviewTemplate;
  if (!PREVIEW_TEMPLATES.includes(template)) {
    throw createError({ statusCode: 400, message: `Unknown template: ${template}` });
  }
  const format = typeof q.format === "string" ? q.format : "html";
  if (!["html", "text", "mjml"].includes(format)) throw createError({ statusCode: 400, message: `Unknown format: ${format}` });
  const category = (typeof q.category === "string" ? q.category : "task") as NotificationCategory;
  if (template === "notification" && !(category in NOTIFICATION_SAMPLES)) {
    throw createError({ statusCode: 400, message: `Unknown category: ${category}` });
  }

  const config = useRuntimeConfig();
  const directus = getTypedDirectus();
  const isUuid = /^[0-9a-f-]{36}$/i.test(orgKey);
  const rows = (await directus.request(
    readItems("hoa_organizations", {
      filter: isUuid ? { id: { _eq: orgKey } } : { slug: { _eq: orgKey } },
      fields: [
        "id", "name", "legal_name", "email", "phone", "slug", "external_url", "street_address", "city", "state", "zip",
        { settings: ["id", { logo: ["id", "width", "height"] }, "title", "description", "header_text", "homepage_url", "footer_image", "colors", "theme"] },
      ] as any,
      limit: 1,
    })
  )) as unknown as Array<HoaOrganization & { settings: BlockSetting | null }>;
  const organization = rows?.[0];
  if (!organization) throw createError({ statusCode: 404, message: "Organization not found" });
  await requireAdminOrManagerGrant(event, organization.id, "communications");

  // The form's unsaved palette, or none at all.
  if (q.palette === "none") {
    organization.settings = { ...(organization.settings || {}), colors: null } as BlockSetting;
  } else if (hex(q.primary) || hex(q.accent) || hex(q.secondary)) {
    organization.settings = {
      ...(organization.settings || {}),
      colors: [{ primary: hex(q.primary), secondary: hex(q.secondary), accent: hex(q.accent) }],
    } as unknown as BlockSetting;
  }

  // The form's unsaved header line (`headerText=` with nothing previews none).
  if (typeof q.headerText === "string") {
    organization.settings = { ...(organization.settings || {}), header_text: q.headerText.slice(0, 200) || null } as BlockSetting;
  }

  const appUrl = (config.public.appUrl as string) || "";
  const branding = resolveEmailBranding(organization, null, { appUrl });
  const sample = NOTIFICATION_SAMPLES[category];
  const isNotification = template === "notification";
  const slug = organization.slug || "";
  // A reminder renders exactly as sendReminder → notifyUsers → the
  // transactional email would: its partial, its CTA, its class footer.
  const reminder = (REMINDER_EMAIL_TEMPLATES as readonly string[]).includes(template)
    ? sampleReminders(organization.name || undefined)[template as (typeof REMINDER_EMAIL_TEMPLATES)[number]]
    : null;
  const reminderParts = reminder ? reminderEmail(reminder) : null;
  // The invitation renders as sendHoaInvitationEmail would, with a sample inviter.
  const invitation =
    template === "invitation"
      ? invitationEmailParts({
          organizationName: organization.name || "Your community",
          invitationUrl: `${appUrl}/${slug}/accept-invite?token=sample`,
          inviterName: "Jordan Lee",
          roleName: "Owner",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      : null;
  const emailType: EmailType = reminderParts
    ? reminderParts.emailType
    : isNotification
      ? "notice"
      : invitation
        ? INVITATION_EMAIL_TYPE
        : (template as EmailType);
  const subject = reminder
    ? reminder.subject
    : isNotification
      ? sample.subject
      : invitation
        ? invitation.subject
        : "A sample message from your community";
  const content = invitation
    ? invitation.bodyHtml
    : reminderParts
    ? transactionalContent(reminderParts, { appUrl, slug, settings: organization.settings })
    : isNotification
      ? transactionalContent(
          { heading: sample.subject, bodyHtml: `<p>${sample.body}</p>`, cta: { label: sample.cta, path: sample.path } },
          { appUrl, slug, settings: organization.settings }
        )
      : SAMPLE_CONTENT;
  // The class footer the real send would carry: notifications are essential
  // (switched off in preferences); dues and violation reminders are essential
  // and can't be unsubscribed; organization emails preview as community mail.
  const { footer: complianceFooter } = recipientCompliance({
    emailClass: isNotification || reminder || invitation ? "essential" : "community",
    org: organization,
    mailingAddress: orgMailingAddress(organization),
    appUrl,
    ...(reminder
      ? { reason: reminder.essential ? ("reminders" as const) : ("notifications" as const) }
      : isNotification
        ? { reason: "notifications" as const }
        : invitation
          ? { reason: "invitation" as const }
          : {}),
  });

  const options = {
    organization,
    subject,
    content,
    emailType,
    recipientFirstName: "Alex",
    directusUrl: config.directus.url as string,
    appUrl,
    headerText: branding.headerText,
    footerImage: branding.footerImage,
    homepageUrl: branding.homepageUrl,
    complianceFooter,
    contentPartial: invitation
      ? invitation.contentPartial
      : reminderParts
        ? partialWithCta(reminderParts.contentPartial, reminderParts.cta, { appUrl, slug })
        : null,
  };

  if (format === "mjml" || format === "text") {
    setHeader(event, "Content-Type", "text/plain; charset=utf-8");
    return format === "mjml" ? buildEmailMjml(options) : buildEmailText(options);
  }
  setHeader(event, "Content-Type", "text/html; charset=utf-8");
  setHeader(event, "Content-Security-Policy", "sandbox");
  setHeader(event, "Cache-Control", "private, no-store");
  return buildEmailHtml(options);
});
