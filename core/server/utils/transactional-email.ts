import { readItems, readUsers } from "@directus/sdk";
import type { HoaOrganization, BlockSetting } from "#core/types/directus";
import { resolveEmailBranding } from "./email-branding";
import {
  buildEmailHtml,
  buildEmailText,
  resolveEmailFonts,
  type EmailType,
} from "./email-templates-mjml";
import { sendOrganizationEmail } from "./sendgrid";
import { scopeRecipientsToOrg } from "./org-members";
import {
  emailAllowed,
  allMuted,
  type NotificationCategory,
} from "#core/shared/notifications/preferences";

/**
 * sendBrandedTransactionalEmail — one branded, per-org email to a set of
 * Directus users, reusing the SAME render path as the bulk composer
 * (resolveEmailBranding → buildEmailHtml/buildEmailText → sendOrganizationEmail).
 *
 * This is the email twin of the in-app `project-notify.ts` notifications: when a
 * milestone needs approval or a task is assigned we ping the bell AND (here)
 * send a real, on-brand email (header line, footer building photo, legal
 * copyright) so it doesn't read like a system alert. Per-org defaults
 * (`block_settings`) flow through automatically.
 *
 * Best-effort: a send failure for one recipient never throws — callers fire
 * this with `.catch(() => {})` like the rest of the notify layer.
 */

interface BrandedCta {
  /** Button label, e.g. "Review milestone". */
  label: string;
  /** Org-relative portal path, e.g. "/admin/projects" — absolutised per send. */
  path: string;
}

export interface BrandedTransactionalOptions {
  organizationId: string;
  /** Directus user ids to email. */
  recipientUserIds: string[];
  subject: string;
  /** Lead line rendered bold above the body (optional). */
  heading?: string;
  /** Body paragraph(s) as HTML or plain text. */
  bodyHtml: string;
  cta?: BrandedCta;
  /** Visual treatment (header colour/icon). Defaults to "notice". */
  emailType?: EmailType;
  /** A user id to skip (e.g. the actor who triggered the event). */
  excludeUserId?: string | null;
  /**
   * Notification category for preference gating. When set, a recipient who has
   * opted out of this category's email (or muted everything, or turned off the
   * master email switch) is skipped. When omitted, only the master email switch
   * + global mute are honored.
   */
  category?: NotificationCategory;
}

type OrgRow = HoaOrganization & { settings?: BlockSetting | string | null };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendBrandedTransactionalEmail(opts: BrandedTransactionalOptions): Promise<void> {
  const asked = [...new Set((opts.recipientUserIds || []).filter(Boolean))].filter(
    (id) => id !== opts.excludeUserId
  );
  if (!asked.length) return;

  // Tenancy gate, same as `notifyUsers` and for a sharper reason: this channel
  // leaves the building. Everything below renders THIS org's branding — its
  // name, its logo, its footer photo, its legal line — so an id belonging to
  // another community produces a real, on-brand email from a community the
  // recipient has nothing to do with. A stray bell row is noise in an app; this
  // is a message in someone's inbox that cannot be taken back.
  const recipients = await scopeRecipientsToOrg(opts.organizationId, asked, "transactional-email");
  if (!recipients.length) return;

  const config = useRuntimeConfig();
  const appUrl = (config.public.appUrl as string) || "";
  const directusUrl = config.directus.url;
  const admin = getTypedDirectus();

  // Org (with the settings JSON that holds the branding defaults).
  let org: OrgRow | null = null;
  try {
    const rows = (await admin.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: opts.organizationId } },
        fields: ["id", "name", "legal_name", "slug", "external_url", "settings"],
        limit: 1,
      })
    )) as OrgRow[];
    org = rows?.[0] || null;
  } catch (e) {
    console.warn("[transactional-email] failed to load org", e);
  }
  if (!org) return;

  // Recipient emails + first names + notification prefs (for opt-out gating).
  let users: Array<{
    id: string;
    email?: string | null;
    first_name?: string | null;
    email_notifications?: boolean | null;
    notification_preferences?: Record<string, unknown> | null;
  }> = [];
  try {
    users = (await admin.request(
      readUsers({
        filter: { id: { _in: recipients } },
        fields: ["id", "email", "first_name", "email_notifications", "notification_preferences"],
        limit: -1,
      })
    )) as typeof users;
  } catch (e) {
    console.warn("[transactional-email] failed to load recipients", e);
    return;
  }

  const branding = resolveEmailBranding(org, null, { appUrl });
  const emailType: EmailType = opts.emailType || "notice";
  const slug = org.slug || "";
  // buildEmailHtml/Text want settings as an object (or null), never a string id.
  const orgForEmail = {
    ...org,
    settings: (org.settings && typeof org.settings === "object" ? org.settings : null) as BlockSetting | null,
  };

  // Compose the body HTML: optional bold heading, the body, then a pill CTA.
  const ctaHtml =
    opts.cta && appUrl && slug
      ? `<p style="margin:24px 0 4px"><a href="${escapeHtml(`${appUrl}/${slug}${opts.cta.path}`)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:15px">${escapeHtml(opts.cta.label)}</a></p>`
      : "";
  // The lead line is this email's heading in every sense but the tag, so it
  // takes the theme's heading face. Without this the classic and luxury display
  // fonts would go unseen in transactional mail, which never carries an <h*>.
  const fonts = resolveEmailFonts(orgForEmail.settings);
  const headingHtml = opts.heading
    ? `<p style="font-weight:600;font-size:17px;margin:0 0 12px;font-family:${fonts.heading}">${escapeHtml(opts.heading)}</p>`
    : "";
  const content = `${headingHtml}${opts.bodyHtml}${ctaHtml}`;

  for (const u of users) {
    if (!u.email) continue;
    // Respect the member's notification preferences (revives the previously
    // ignored email_notifications field + honors per-category opt-out).
    const prefs = (u.notification_preferences as any) || null;
    const allowed = opts.category
      ? emailAllowed(prefs, u.email_notifications, opts.category)
      : u.email_notifications !== false && !allMuted(prefs);
    if (!allowed) continue;
    try {
      const recipientFirstName = u.first_name || undefined;
      const html = buildEmailHtml({
        organization: orgForEmail,
        subject: opts.subject,
        content,
        emailType,
        recipientFirstName,
        directusUrl,
        appUrl,
        headerText: branding.headerText,
        footerImage: branding.footerImage,
        homepageUrl: branding.homepageUrl,
      });
      const text = buildEmailText({
        organization: orgForEmail,
        subject: opts.subject,
        content,
        emailType,
        recipientFirstName,
        directusUrl,
      });
      await sendOrganizationEmail({
        to: u.email,
        toName: u.first_name || undefined,
        subject: opts.subject,
        html,
        text,
        organizationId: opts.organizationId,
      });
    } catch (e) {
      console.warn("[transactional-email] send failed for", u.id, e);
    }
  }
}
