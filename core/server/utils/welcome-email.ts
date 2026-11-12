/**
 * The welcome to a new HOA Admin, as the app's own MJML email. It went out at
 * signup (setup-organization) and from the operator console's "Re-send
 * welcome", and used to be the "welcome" section of the SendGrid-hosted
 * dynamic template (SENDGRID_INVITE_EMAIL_TEMPLATE_ID), from the platform
 * address and with none of the community's branding.
 *
 * Edit the wording in core/server/emails/welcome.mjml; the plain-text part and
 * the subject are in `welcomeEmailParts` below. Rendering and sending are
 * shared with the invitation (account-email.ts).
 *
 * Its footer is the membership one: the recipient is always one of the
 * community's HOA Admins, with a member row.
 */
import { escapeEmailValue as esc, sendAccountEmail, type AccountEmailParts } from "./account-email";
import welcomeMjml from "../emails/welcome.mjml";

export interface WelcomeEmailInput {
  to: string;
  firstName: string;
  lastName?: string;
  organizationName: string;
  /** The absolute link the button opens. */
  loginUrl: string;
  /** The community the account is for: its branding, sender and demo guard. */
  organizationId?: string | null;
}

/** Subject, plain text and the partial's (escaped) vars for one welcome. */
export function welcomeEmailParts(input: Pick<WelcomeEmailInput, "organizationName" | "loginUrl">): AccountEmailParts {
  const org = input.organizationName.trim() || "your community";
  const heading = `Welcome to ${org}!`;

  const bodyHtml = [
    `<p>Your account for ${esc(org)} has been successfully created. You now have administrator access to manage your community.</p>`,
    `<p>Here's what you can do:</p>`,
    // The <br /> keeps a blank line after the list in the plain-text part.
    `<ul><li>Manage members and units</li><li>Send announcements and newsletters</li><li>Track payments and dues</li><li>Access community documents</li></ul><br />`,
    `<p>Log in now: ${esc(input.loginUrl)}</p>`,
    `<p>If you have any questions, please reach out to our support team.</p>`,
  ].join("");

  return {
    subject: heading,
    heading,
    bodyHtml,
    contentPartial: {
      name: "welcome",
      source: welcomeMjml,
      vars: {
        heading: esc(heading),
        orgName: esc(org),
        ctaHref: esc(input.loginUrl),
        ctaLabel: "Log In Now",
      },
    },
  };
}

/** Send one welcome. Throws when SendGrid refuses it (the callers report that). */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  await sendAccountEmail({
    to: input.to,
    firstName: input.firstName,
    lastName: input.lastName,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    reason: "membership",
    parts: (organizationName) => welcomeEmailParts({ organizationName, loginUrl: input.loginUrl }),
    label: "Welcome email",
  });
}
