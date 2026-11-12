/**
 * The community's account emails, in one shape: the member invitation
 * (invitation-email.ts), the welcome to a new HOA Admin (welcome-email.ts) and
 * the note that tells an inviter their invitation was accepted
 * (invitation-accepted-email.ts). All three used to be one SendGrid-hosted
 * dynamic template (SENDGRID_INVITE_EMAIL_TEMPLATE_ID) that nobody could edit
 * from the repo and that carried none of the community's branding.
 *
 * Each is now a content partial in core/server/emails/, in the content slot of
 * the layout every community email uses (logo, header line, colours, footer
 * photo), rendered by buildEmailHtml as a "notice" so it takes the community's
 * palette, with an essential-mail footer that says why this address got it.
 * sendOrganizationEmail sends it as the community, so the demo guard and the
 * dev allow-list apply as for any other email.
 *
 * The wording lives in each email's partial and its parts builder; this file
 * is the part they share.
 */
import { readItems } from "@directus/sdk";
import type { BlockSetting, HoaOrganization } from "#core/types/directus";
import { orgMailingAddress, recipientCompliance, type ComplianceFooterInput } from "#core/shared/email/unsubscribe";
import { buildEmailHtml, buildEmailText } from "./email-templates-mjml";
import { resolveEmailBranding } from "./email-branding";
import { resolveSender, sendOrganizationEmail } from "./sendgrid";
import type { PartialVars } from "./email-partials";

export interface AccountEmailParts {
  subject: string;
  heading: string;
  /** The plain-text part's (and preheader's) source. */
  bodyHtml: string;
  contentPartial: { name: string; source: string; vars: PartialVars };
}

/** Why this address got the email: the compliance footer's lead line. */
export type AccountEmailReason = NonNullable<ComplianceFooterInput["reason"]>;

/**
 * The layout's email type: `notice`, like the other transactional emails, so
 * the header and the button take the community's colours (`basic` opts out of
 * the palette and would send these in platform blue).
 */
export const ACCOUNT_EMAIL_TYPE = "notice" as const;

/** Escape a value for the partial or the HTML body. */
export const escapeEmailValue = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type AccountEmailOrg = HoaOrganization & { settings?: BlockSetting | null };

const ORG_FIELDS = [
  "id", "name", "legal_name", "slug", "external_url", "email", "phone", "street_address", "city", "state", "zip",
  { settings: ["id", { logo: ["id", "width", "height"] }, "title", "header_text", "homepage_url", "footer_image", "colors", "theme", "from_name", "from_email", "email_domain_verified"] },
];

async function loadOrg(organizationId: string | null | undefined): Promise<AccountEmailOrg | null> {
  if (!organizationId) return null;
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", { filter: { id: { _eq: organizationId } }, fields: ORG_FIELDS as any, limit: 1 })
    )) as unknown as AccountEmailOrg[];
    return rows?.[0] ?? null;
  } catch (e) {
    console.warn("[account-email] failed to load the community; sending unbranded", e);
    return null;
  }
}

/** The rendered email: what the preview route shows and the sender sends. */
export function renderAccountEmail(
  org: AccountEmailOrg,
  parts: AccountEmailParts,
  opts: { reason: AccountEmailReason; firstName?: string; appUrl: string; directusUrl: string }
): { html: string; text: string } {
  const organization = { ...org, settings: org.settings && typeof org.settings === "object" ? org.settings : null } as AccountEmailOrg;
  const branding = resolveEmailBranding(organization, null, { appUrl: opts.appUrl });
  const { footer: complianceFooter } = recipientCompliance({
    emailClass: "essential",
    org: organization,
    mailingAddress: orgMailingAddress(organization),
    appUrl: opts.appUrl,
    reason: opts.reason,
  });
  const common = {
    organization,
    subject: parts.subject,
    content: parts.bodyHtml,
    emailType: ACCOUNT_EMAIL_TYPE,
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

/**
 * Load the community, build the parts with its current name, render and send
 * as the community. Still sends, unbranded, when the community can't be read.
 * Throws when SendGrid refuses it (the callers report that).
 */
export async function sendAccountEmail(input: {
  to: string;
  firstName?: string;
  lastName?: string;
  organizationId?: string | null;
  /** The caller's name for the community, used when its record can't be read. */
  organizationName: string;
  reason: AccountEmailReason;
  parts: (organizationName: string) => AccountEmailParts;
  /** For the log line: "Welcome email", "Invitation email"… */
  label: string;
}): Promise<void> {
  const config = useRuntimeConfig();
  const org: AccountEmailOrg =
    (await loadOrg(input.organizationId)) ??
    ({ id: input.organizationId ?? "", name: input.organizationName, settings: null } as unknown as AccountEmailOrg);
  const parts = input.parts(org.name || input.organizationName);
  const { html, text } = renderAccountEmail(org, parts, {
    reason: input.reason,
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
  console.log(`✅ ${input.label} sent to ${input.to}`);
}
