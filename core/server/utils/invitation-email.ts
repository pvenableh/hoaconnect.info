/**
 * The member invitation, as the app's own MJML email (2026-11-12, Peter: "our
 * own mjml generated email that I can edit in the repo"). It used to be a
 * SendGrid-hosted dynamic template (SENDGRID_INVITE_EMAIL_TEMPLATE_ID).
 *
 * Edit the wording in core/server/emails/invitation.mjml; the plain-text part
 * and the subject are in `invitationEmailParts` below. Rendering and sending
 * are shared with the welcome and accepted emails (account-email.ts).
 */
import { escapeEmailValue as esc, sendAccountEmail, type AccountEmailParts } from "./account-email";
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

export type InvitationEmailParts = AccountEmailParts;

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

/** Send one invitation. Throws when SendGrid refuses it (the callers report that). */
export async function sendHoaInvitationEmail(input: InvitationEmailInput): Promise<void> {
  await sendAccountEmail({
    to: input.to,
    firstName: input.firstName,
    lastName: input.lastName,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    reason: "invitation",
    parts: (organizationName) => invitationEmailParts({ ...input, organizationName }),
    label: "Invitation email",
  });
}
