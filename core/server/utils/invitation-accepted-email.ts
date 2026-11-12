/**
 * "{member} has joined {community}": tells the person who sent an invitation
 * that it was accepted, as the app's own MJML email. It used to be the
 * "accepted" section of the SendGrid-hosted dynamic template
 * (SENDGRID_INVITE_EMAIL_TEMPLATE_ID), from the platform address and with none
 * of the community's branding.
 *
 * Edit the wording in core/server/emails/invitation-accepted.mjml; the
 * plain-text part and the subject are in `invitationAcceptedEmailParts` below.
 * Rendering and sending are shared with the invitation (account-email.ts).
 *
 * Its footer is the `inviter` one: whoever invited can be an App Admin with no
 * member row in this community, so "you are a member" would not always be
 * true, and no preference turns this email off.
 */
import { escapeEmailValue as esc, sendAccountEmail, type AccountEmailParts } from "./account-email";
import acceptedMjml from "../emails/invitation-accepted.mjml";

export interface InvitationAcceptedEmailInput {
  /** The person who sent the invitation. */
  to: string;
  adminName: string;
  /** The person who accepted it. */
  memberName: string;
  memberEmail: string;
  organizationName: string;
  /** The community they joined: its branding, sender and demo guard. */
  organizationId?: string | null;
}

/** Subject, plain text and the partial's (escaped) vars for one acceptance. */
export function invitationAcceptedEmailParts(
  input: Pick<InvitationAcceptedEmailInput, "organizationName" | "memberName" | "memberEmail">
): AccountEmailParts {
  const org = input.organizationName.trim() || "your community";
  const email = input.memberEmail.trim();
  const member = input.memberName.replace(/\s+/g, " ").trim() || email || "A new member";
  const heading = `${member} has joined ${org}`;

  const bodyHtml = [
    `<p>Great news! ${esc(member)} has accepted your invitation and joined ${esc(org)}.</p>`,
    `<p>Member Details<br />Name: ${esc(member)}${email ? `<br />Email: ${esc(email)}` : ""}</p>`,
    `<p>You can view and manage all members from your organization dashboard.</p>`,
  ].join("");

  return {
    subject: heading,
    heading,
    bodyHtml,
    contentPartial: {
      name: "invitation-accepted",
      source: acceptedMjml,
      vars: {
        heading: esc(heading),
        memberName: esc(member),
        memberEmail: esc(email),
        orgName: esc(org),
      },
    },
  };
}

/** Send one acceptance note. Throws when SendGrid refuses it (the caller reports that). */
export async function sendInvitationAcceptedEmail(input: InvitationAcceptedEmailInput): Promise<void> {
  await sendAccountEmail({
    to: input.to,
    firstName: input.adminName,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    reason: "inviter",
    parts: (organizationName) => invitationAcceptedEmailParts({ ...input, organizationName }),
    label: "Invitation accepted email",
  });
}
