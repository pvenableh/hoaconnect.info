/**
 * The member invitation, as the app's own MJML email (2026-11-12, Peter: "our
 * own mjml generated email that I can edit in the repo"). It used to be a
 * SendGrid-hosted dynamic template (SENDGRID_INVITE_EMAIL_TEMPLATE_ID), which
 * nobody could change from the repo and which carried none of the community's
 * branding.
 *
 * Now it is core/server/emails/invitation.mjml in the content slot of the same
 * layout every community email uses (header line, colours, logo, footer photo),
 * rendered by buildEmailHtml and sent by sendOrganizationEmail, so the demo
 * guard and the dev allow-list apply to it like to any other email.
 *
 * Edit the wording in invitation.mjml; the plain-text part and the subject are
 * in `invitationEmailParts` below.
 */
import { readItems } from "@directus/sdk";
import type { BlockSetting, HoaOrganization } from "#core/types/directus";
import { orgMailingAddress, recipientCompliance } from "#core/shared/email/unsubscribe";
import { buildEmailHtml, buildEmailText } from "./email-templates-mjml";
import { resolveEmailBranding } from "./email-branding";
import { resolveSender, sendOrganizationEmail } from "./sendgrid";
import type { PartialVars } from "./email-partials";
import invitationMjml from "../emails/invitation.mjml";

export interface InvitationEmailInput {
  to: string;
  firstName: string;
  lastName?: string;
  organizationName: string;
  /** The absolute accept link, token included. */
  invitationUrl: string;
  inviterName: string;
  roleName: string;
  /** ISO timestamp. */
  expiresAt: string;
  /** The community the invitation is for: its branding, sender and demo guard. */
  organizationId?: string | null;
  // Accepted for the callers written against the hosted template; the
  // community's own record supplies all of these now.
  orgLogoUrl?: string;
  orgUrl?: string;
  orgPhoneNumber?: string;
  orgEmail?: string;
  orgAddress?: string;
  orgLegalName?: string;
}

export interface InvitationEmailParts {
  subject: string;
  heading: string;
  /** The plain-text part's (and preheader's) source. */
  bodyHtml: string;
  contentPartial: { name: string; source: string; vars: PartialVars };
}

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Thursday, November 19, 2026", as the hosted template printed it. */
export function invitationExpiry(expiresAt: string): string {
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Subject, plain text and the partial's (escaped) vars for one invitation. */
export function invitationEmailParts(
  input: Pick<InvitationEmailInput, "organizationName" | "invitationUrl" | "inviterName" | "roleName" | "expiresAt">
): InvitationEmailParts {
  const org = input.organizationName.trim() || "your community";
  const inviter = input.inviterName.trim() || "Someone";
  const role = input.roleName.trim() || "member";
  const article = /^[aeiou]/i.test(role) ? "an" : "a";
  const expires = invitationExpiry(input.expiresAt);
  const heading = `You're invited to join ${org}`;

  const bodyHtml = [
    `<p>${esc(inviter)} has invited you to join ${esc(org)} as ${article} ${esc(role)}.</p>`,
    `<p>Create your account and get started: ${esc(input.invitationUrl)}</p>`,
    expires ? `<p>This invitation expires on ${esc(expires)}.</p>` : "",
    `<p>If you didn't expect this invitation, you can safely ignore this email.</p>`,
  ].join("");

  return {
    subject: `You've been invited to join ${org}`,
    heading,
    bodyHtml,
    contentPartial: {
      name: "invitation",
      source: invitationMjml,
      vars: {
        heading: esc(heading),
        inviterName: esc(inviter),
        orgName: esc(org),
        roleArticle: article,
        roleName: esc(role),
        expires: esc(expires),
        ctaHref: esc(input.invitationUrl),
        ctaLabel: "Accept Invitation",
      },
    },
  };
}

type OrgRow = HoaOrganization & { settings?: BlockSetting | null };

/**
 * The layout's email type: `notice`, like the other transactional emails, so
 * the header and the button take the community's colours (`basic` opts out of
 * the palette and would send the invitation in platform blue).
 */
export const INVITATION_EMAIL_TYPE = "notice" as const;

const ORG_FIELDS = [
  "id", "name", "legal_name", "slug", "external_url", "email", "phone", "street_address", "city", "state", "zip",
  { settings: ["id", { logo: ["id", "width", "height"] }, "title", "header_text", "homepage_url", "footer_image", "colors", "theme", "from_name", "from_email", "email_domain_verified"] },
];

async function loadOrg(organizationId: string | null | undefined): Promise<OrgRow | null> {
  if (!organizationId) return null;
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", { filter: { id: { _eq: organizationId } }, fields: ORG_FIELDS as any, limit: 1 })
    )) as unknown as OrgRow[];
    return rows?.[0] ?? null;
  } catch (e) {
    console.warn("[invitation-email] failed to load the community; sending unbranded", e);
    return null;
  }
}

/** The rendered invitation: what the preview route shows and the sender sends. */
export function renderInvitationEmail(
  org: OrgRow,
  parts: InvitationEmailParts,
  opts: { firstName?: string; appUrl: string; directusUrl: string }
): { html: string; text: string } {
  const organization = { ...org, settings: org.settings && typeof org.settings === "object" ? org.settings : null } as OrgRow;
  const branding = resolveEmailBranding(organization, null, { appUrl: opts.appUrl });
  const { footer: complianceFooter } = recipientCompliance({
    emailClass: "essential",
    org: organization,
    mailingAddress: orgMailingAddress(organization),
    appUrl: opts.appUrl,
    reason: "invitation",
  });
  const common = {
    organization,
    subject: parts.subject,
    content: parts.bodyHtml,
    emailType: INVITATION_EMAIL_TYPE,
    recipientFirstName: opts.firstName || undefined,
    directusUrl: opts.directusUrl,
    complianceFooter,
  };
  return {
    html: buildEmailHtml({
      ...common,
      appUrl: opts.appUrl,
      headerText: branding.headerText,
      footerImage: branding.footerImage,
      homepageUrl: branding.homepageUrl,
      contentPartial: parts.contentPartial,
    }),
    text: buildEmailText(common),
  };
}

/** Send one invitation. Throws when SendGrid refuses it (the callers report that). */
export async function sendHoaInvitationEmail(input: InvitationEmailInput): Promise<void> {
  const config = useRuntimeConfig();
  const org: OrgRow =
    (await loadOrg(input.organizationId)) ?? ({ id: input.organizationId ?? "", name: input.organizationName, settings: null } as unknown as OrgRow);
  const parts = invitationEmailParts({ ...input, organizationName: org.name || input.organizationName });
  const { html, text } = renderInvitationEmail(org, parts, {
    firstName: input.firstName,
    appUrl: (config.public.appUrl as string) || "",
    directusUrl: (config.directus?.url as string) || "",
  });

  await sendOrganizationEmail({
    to: input.to,
    toName: [input.firstName, input.lastName].filter(Boolean).join(" ") || undefined,
    subject: parts.subject,
    html,
    text,
    ...resolveSender(org, "transactional"),
    organizationId: input.organizationId ?? undefined,
  });
  console.log(`✅ Invitation email sent to ${input.to}`);
}
