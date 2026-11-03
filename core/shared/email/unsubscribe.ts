/**
 * Unsubscribe links, the one-click headers and the compliance footer
 * (Earnest parity round 3, Phase 3a; ported from Earnest's `unsubscribe.ts`).
 *
 * A member's `hoa_members.unsubscribe_token` is the credential: 24 random bytes,
 * base64url (32 characters), minted lazily at send time
 * (server/utils/email-compliance.ts). A token names exactly one membership —
 * one member of one org — so an unsubscribe never reaches past the community
 * that sent the mail.
 *
 *   footer link       /unsubscribe?token=…&e=<email id>        → the page; one tap to confirm
 *   List-Unsubscribe  /api/email/unsubscribe/one-click?token=… → RFC 8058 POST, no session
 *
 * The send path calls `checkSendCompliance` once per send (the class, and the
 * org's postal address a community send must carry) and `recipientCompliance`
 * once per recipient (their headers and footer). Pure, so the digest worker can
 * import it by relative path and the tests can read the assembler's output
 * without sending anything.
 */

import {
  ESSENTIAL_MAIL_EXAMPLES,
  NEWSLETTER_NOT_ESSENTIAL,
  resolveEmailClass,
  type EmailClass,
} from "./email-class";

/** 24 bytes in base64url, unpadded. */
export const UNSUBSCRIBE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isUnsubscribeToken(value: unknown): value is string {
  return typeof value === "string" && UNSUBSCRIBE_TOKEN_PATTERN.test(value);
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** `token` plus, when known, `e` — the email that carried the link (for the record, never trusted). */
export function unsubscribeQuery(token: string, emailId?: string | null): string {
  const q = new URLSearchParams({ token });
  if (emailId) q.set("e", String(emailId));
  return q.toString();
}

/** The footer link: the page, where the member confirms with one tap. */
export function buildUnsubscribeUrl(appUrl: string, token?: string | null, emailId?: string | null): string {
  const base = `${trimSlash(appUrl)}/unsubscribe`;
  return token ? `${base}?${unsubscribeQuery(token, emailId)}` : base;
}

/**
 * The `List-Unsubscribe` target (RFC 8058). A mailbox provider POSTs
 * `List-Unsubscribe=One-Click` here with no session and expects a 200; a person
 * who opens it in a browser (GET) is redirected to the page.
 */
export function buildOneClickUnsubscribeUrl(appUrl: string, token: string, emailId?: string | null): string {
  return `${trimSlash(appUrl)}/api/email/unsubscribe/one-click?${unsubscribeQuery(token, emailId)}`;
}

/**
 * The headers every community send carries. Gmail and Yahoo require both of
 * bulk senders and draw their "Unsubscribe" button from them. HTTPS only: there
 * is no inbound parse on the SendGrid account, so a `mailto:` would land in a
 * box nobody reads.
 */
export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Where a member manages their email: the Email section of their household page. */
export function buildPreferencesUrl(appUrl: string, orgSlug?: string | null): string {
  const base = trimSlash(appUrl);
  return orgSlug ? `${base}/${orgSlug}/profile#email` : `${base}/account`;
}

// ── The org's postal address ────────────────────────────────────────────────

export const SENDER_ADDRESS_MISSING = "sender_address_missing";

export interface OrgPostalFields {
  name?: string | null;
  legal_name?: string | null;
  slug?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The org's mailing address as one line, or null when it is not complete enough
 * to be a postal address: a street, and a city or a ZIP. CAN-SPAM asks for a
 * valid physical postal address on commercial mail; "Springfield" is not one.
 */
export function orgMailingAddress(org: OrgPostalFields | null | undefined): string | null {
  const street = clean(org?.street_address);
  const city = clean(org?.city);
  const zip = clean(org?.zip);
  if (!street || (!city && !zip)) return null;
  const stateZip = [clean(org?.state), zip].filter(Boolean).join(" ");
  return [street, city, stateZip].filter(Boolean).join(", ");
}

// ── Footer ──────────────────────────────────────────────────────────────────

export interface ComplianceFooter {
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LINK_STYLE = "color:inherit;text-decoration:underline;";

export interface ComplianceFooterInput {
  emailClass: EmailClass;
  orgName: string;
  /** The org's postal address (required for community; shown on essential when known). */
  mailingAddress?: string | null;
  /** Community only. Absent on a test send or before the schema exists: the generic page. */
  unsubscribeUrl?: string | null;
  preferencesUrl?: string | null;
  /**
   * `notifications`: a per-user notification (task assigned, approval decided),
   * which the member controls through their notification preferences rather
   * than an unsubscribe. Defaults to `membership`.
   */
  reason?: "membership" | "notifications";
}

/**
 * The footer every member email ends with — Unsubscribe · Preferences · the
 * org's address on community mail; the reason it can't be unsubscribed on
 * essential mail. HTML for the MJML/dynamic/raw bodies, text for the plain part.
 */
export function buildComplianceFooter(input: ComplianceFooterInput): ComplianceFooter {
  const org = input.orgName.trim() || "your community";
  const address = clean(input.mailingAddress);
  const prefs = clean(input.preferencesUrl);
  const unsub = clean(input.unsubscribeUrl);

  let lead: string;
  const links: Array<{ label: string; url: string }> = [];
  if (input.emailClass === "community") {
    lead = `You're receiving this because you're a member of ${org}.`;
    if (unsub) links.push({ label: "Unsubscribe", url: unsub });
  } else if (input.reason === "notifications") {
    lead = `You receive this because you are a member of ${org} and these notifications are on.`;
  } else {
    lead = `You receive this because you are a member of ${org}; it cannot be unsubscribed.`;
  }
  if (prefs) links.push({ label: "Preferences", url: prefs });

  const htmlParts = [`<span>${esc(lead)}</span>`];
  if (links.length) {
    htmlParts.push(
      links.map((l) => `<a href="${esc(l.url)}" style="${LINK_STYLE}">${esc(l.label)}</a>`).join(" &middot; ")
    );
  }
  if (address) htmlParts.push(`<span>${esc(address)}</span>`);
  const html = `<div class="email-compliance-footer" style="font-size:11px;line-height:1.6;color:#6b7280;text-align:center;">${htmlParts.join("<br />")}</div>`;

  const textLines = [lead];
  for (const l of links) textLines.push(`${l.label}: ${l.url}`);
  if (address) textLines.push(address);

  return { html, text: textLines.join("\n") };
}

// ── The assembler ───────────────────────────────────────────────────────────

export type SendComplianceCheck =
  | { ok: true; emailClass: EmailClass; mailingAddress: string | null }
  | {
      ok: false;
      statusCode: 400;
      code: typeof NEWSLETTER_NOT_ESSENTIAL | typeof SENDER_ADDRESS_MISSING;
      message: string;
    };

/**
 * Once per send: the class it goes out as, and — for community mail — the
 * org's postal address, without which the send is refused (Earnest's
 * `SENDER_ADDRESS_MISSING`). Essential mail goes out with or without one.
 */
export function checkSendCompliance(input: {
  emailType: string | null | undefined;
  requestedClass?: unknown;
  org: OrgPostalFields;
}): SendComplianceCheck {
  const resolved = resolveEmailClass(input.emailType, input.requestedClass);
  if (resolved.ok === false) return { ok: false, statusCode: 400, code: resolved.code, message: resolved.message };

  const mailingAddress = orgMailingAddress(input.org);
  if (resolved.emailClass === "community" && !mailingAddress) {
    const name = clean(input.org.name) || "This community";
    return {
      ok: false,
      statusCode: 400,
      code: SENDER_ADDRESS_MISSING,
      message: `${name} has no mailing address. Community email must carry the association's postal address — add a street address with a city or ZIP in Settings → Organization, then send again.`,
    };
  }
  return { ok: true, emailClass: resolved.emailClass, mailingAddress };
}

export interface RecipientCompliance {
  /** `List-Unsubscribe` + `List-Unsubscribe-Post` on community mail with a token; empty otherwise. */
  headers: Record<string, string>;
  footer: ComplianceFooter;
  unsubscribeUrl: string | null;
  preferencesUrl: string;
}

/** Once per recipient: their headers and their footer. */
export function recipientCompliance(input: {
  emailClass: EmailClass;
  org: OrgPostalFields;
  mailingAddress: string | null;
  appUrl: string;
  emailId?: string | null;
  /** The member's token. Null for a CC copy, a test send, or before the schema exists. */
  token?: string | null;
  reason?: ComplianceFooterInput["reason"];
}): RecipientCompliance {
  const token = isUnsubscribeToken(input.token) ? input.token : null;
  const preferencesUrl = buildPreferencesUrl(input.appUrl, input.org.slug);
  const unsubscribeUrl =
    input.emailClass === "community" ? buildUnsubscribeUrl(input.appUrl, token, input.emailId) : null;
  const headers =
    input.emailClass === "community" && token
      ? listUnsubscribeHeaders(buildOneClickUnsubscribeUrl(input.appUrl, token, input.emailId))
      : {};
  const footer = buildComplianceFooter({
    emailClass: input.emailClass,
    orgName: clean(input.org.name) || "",
    mailingAddress: input.mailingAddress,
    unsubscribeUrl,
    preferencesUrl,
    reason: input.reason,
  });
  return { headers, footer, unsubscribeUrl, preferencesUrl };
}

/** `peter@example.com` → `p•••r@example.com` — enough for someone to recognise their own address. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 2) return `${local[0] ?? ""}•••@${domain}`;
  return `${local[0]}•••${local[local.length - 1]}@${domain}`;
}

/** Re-exported for the unsubscribe page ("you'll still receive…"). */
export { ESSENTIAL_MAIL_EXAMPLES };
