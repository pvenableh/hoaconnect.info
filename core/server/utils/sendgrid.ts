import sgMail from "@sendgrid/mail";
import { SENDGRID_TIMEOUT_MS } from "./email-send-constants";

/**
 * The platform's own sender, used when an org has no verified white-label
 * domain and `FROM_EMAIL` is unset. One constant, one place — until 2026-10
 * five call sites fell back to a single tenant's domain (605lincolnroad.com).
 */
export const PLATFORM_FROM_EMAIL = "noreply@hoaconnect.info";

export function platformFromEmail(config: { public: { fromEmail?: string } }): string {
  return config.public.fromEmail || PLATFORM_FROM_EMAIL;
}

/** Which kind of mail a sender is resolved for (docs/spec-email-send-queue.md §7.4). */
export type SenderStream = "bulk" | "transactional" | "test";

/** The org fields `resolveSender` reads; `settings` may be a row or an unexpanded id. */
export interface SenderOrg {
  name?: string | null;
  email?: string | null;
  settings?:
    | {
        from_name?: string | null;
        from_email?: string | null;
        email_domain_verified?: boolean | null;
        reply_to?: string | null;
        /** The billing worker's spelling; neither field exists yet — both are read. */
        reply_to_email?: string | null;
      }
    | string
    | null;
}

export interface ResolvedSender {
  fromName?: string;
  /** Set only when the org's sending domain is verified; otherwise the platform sender applies. */
  fromAddress?: string;
  replyTo?: { email: string; name?: string };
}

/**
 * The org's white-label sender, one rule for every path that mails on an org's
 * behalf (the queue's render, test sends, transactional notices, the billing
 * worker): `settings.from_name` else the org's name, always; `settings.from_email`
 * only once the domain is verified (SendGrid flags an unverified one); reply-to
 * from `settings.reply_to` else the org's own address; the platform sender
 * otherwise. Before Phase 3b, scheduled and transactional sends dropped the
 * white-label sender entirely.
 *
 * `stream` is the seam per-stream senders hang on; today every stream resolves
 * the same way.
 */
export function resolveSender(org: SenderOrg | null | undefined, _stream: SenderStream = "bulk"): ResolvedSender {
  const settings = org?.settings && typeof org.settings === "object" ? org.settings : null;
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const fromName = clean(settings?.from_name) || clean(org?.name);
  const fromAddress = settings?.email_domain_verified ? clean(settings.from_email) : undefined;
  const replyEmail = clean(settings?.reply_to) || clean(settings?.reply_to_email) || clean(org?.email);
  return {
    fromName,
    fromAddress,
    replyTo: replyEmail ? { email: replyEmail, name: clean(org?.name) } : undefined,
  };
}

/**
 * `OUTBOUND_EMAIL_ONLY_TO` — a dev/staging allow-list: comma- or space-separated
 * addresses and `@domain` entries. When set, mail to anyone else is not sent
 * (logged, and reported to the caller as accepted with no message id, like the
 * demo guard), so a run against prod-shaped data can only reach named inboxes.
 * Unset in production.
 */
export function outboundAllowList(raw: string | undefined = process.env.OUTBOUND_EMAIL_ONLY_TO): string[] | null {
  const entries = (raw || "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return entries.length ? entries : null;
}

export function isOutboundAllowed(address: string, allow: string[] | null): boolean {
  if (!allow) return true;
  const a = (address || "").trim().toLowerCase();
  const domain = a.slice(a.lastIndexOf("@"));
  return allow.some((e) => (e.startsWith("@") ? domain === e : a === e));
}

/**
 * Initialize SendGrid with API key
 */
const initSendGrid = () => {
  const config = useRuntimeConfig();
  const apiKey = config.sendgridApiKey;

  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not configured in environment variables");
  }

  sgMail.setApiKey(apiKey);
  // A hung request must not hold a queue run past its budget: 8 s, then the
  // client gives up (the queue settles that row `unknown` — it may have gone).
  sgMail.setTimeout(SENDGRID_TIMEOUT_MS);
  return sgMail;
};

/**
 * Send generic email (fallback if you don't have templates set up yet)
 */
export const sendEmail = async ({
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: { email: string; name?: string } | null;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const msg = {
    to,
    from: platformFromEmail(config),
    subject,
    text,
    html: html || text,
    ...(replyTo?.email ? { replyTo } : {}),
  };

  try {
    await sg.send(msg);
    console.log(`✅ Email sent to ${to}: ${subject}`);
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("Response body:", error.response.body);
    }
    throw error;
  }
};

/**
 * Send bulk emails with personalization
 * Supports sending to multiple recipients with individual personalization
 */
export const sendBulkEmail = async ({
  recipients,
  subject,
  html,
  text,
  fromName,
}: {
  recipients: Array<{
    email: string;
    name?: string;
    substitutions?: Record<string, string>;
  }>;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const fromEmail = platformFromEmail(config);

  // SendGrid supports up to 1000 recipients per request
  const batchSize = 1000;
  const results: { success: string[]; failed: Array<{ email: string; error: string }> } = {
    success: [],
    failed: [],
  };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    // Create personalizations for each recipient
    const personalizations = batch.map((recipient) => ({
      to: [{ email: recipient.email, name: recipient.name }],
      substitutions: recipient.substitutions || {},
    }));

    const msg = {
      personalizations,
      from: { email: fromEmail, name: fromName },
      subject,
      html,
      text,
    };

    try {
      await sg.send(msg);
      results.success.push(...batch.map((r) => r.email));
      console.log(`✅ Batch email sent to ${batch.length} recipients`);
    } catch (error: any) {
      console.error("❌ SendGrid Bulk Error:", error);
      if (error.response) {
        console.error("Response body:", error.response.body);
      }
      // Mark all recipients in this batch as failed
      batch.forEach((recipient) => {
        results.failed.push({
          email: recipient.email,
          error: error.message || "Failed to send",
        });
      });
    }
  }

  return results;
};

/**
 * Email attachment type for SendGrid
 */
export interface EmailAttachment {
  content: string; // Base64 encoded content
  filename: string;
  type: string; // MIME type
  disposition?: "attachment" | "inline";
  contentId?: string; // For inline images
}

/**
 * Dynamic template data for SendGrid
 * Variable names match the Handlebars placeholders in the MJML template
 */
export interface EmailTemplateData {
  // Recipient info
  first_name: string;
  unit?: string; // Unit/suite number

  // Email content
  subject: string;
  subtitle?: string;
  content: string; // HTML content (use triple braces {{{content}}} in template)
  salutation?: string; // Closing text (use triple braces {{{salutation}}} for HTML)
  urgent?: boolean;
  category?: string; // Email type for preview text (newsletter, announcement, etc.)

  // Organization info
  org_name: string;
  org_legal_name?: string; // For copyright
  org_type?: 'residential' | 'commercial'; // For "unit" vs "suite" label
  org_logo_url?: string;
  org_url?: string; // Organization website
  org_address?: string;
  org_email?: string;
  org_phone_number?: string;
  org_header_text?: string; // Custom line under the logo (e.g. "Official Communication of …")
  org_homepage_url?: string; // Homepage link shown in footer
  footer_image_url?: string; // Full-width building photo in footer

  // Board members (each with name, title, icon)
  board_members?: Array<{ name: string; title: string; icon?: string }>;

  // Links
  Weblink?: string; // View in browser URL

  // Compliance (Phase 3a). The footer is also appended to `content`, so a
  // template that doesn't render these still carries it; a template that does
  // can place the links itself.
  unsubscribe_url?: string;
  preferences_url?: string;
  compliance_footer?: string;

  // Meta
  year?: string;
}

/**
 * Send a single organization email with HTML template
 * Returns the SendGrid message ID for tracking
 */
export const sendOrganizationEmail = async ({
  to,
  toName,
  subject,
  html,
  text,
  fromName,
  attachments,
  templateId,
  templateData,
  replyTo,
  customArgs,
  organizationId,
  cc,
  bcc,
  fromAddress,
  headers,
}: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  /** Per-org white-label from-address (only when the domain is verified). */
  fromAddress?: string;
  attachments?: EmailAttachment[];
  templateId?: string;
  templateData?: EmailTemplateData;
  replyTo?: { email: string; name?: string };
  customArgs?: Record<string, string>;
  organizationId?: string;
  /** Visible carbon-copy recipients (added to this single message). */
  cc?: Array<{ email: string; name?: string }>;
  /** Hidden blind-carbon-copy recipients. */
  bcc?: Array<{ email: string; name?: string }>;
  /**
   * Extra message headers — today the RFC 8058 pair (`List-Unsubscribe`,
   * `List-Unsubscribe-Post`) that every community send carries; see
   * core/shared/email/unsubscribe.ts.
   */
  headers?: Record<string, string>;
}): Promise<{ success: true; messageId: string | null }> => {
  const config = useRuntimeConfig();

  // Demo guardrail: never deliver real email from a public demo org (unless the
  // owner has flipped DEMO_ALLOW_EMAIL to test). Return a simulated success so
  // callers behave normally.
  if (await shouldBlockDemoEmail(organizationId)) {
    console.log(`[demo] email suppressed for demo org ${organizationId} → ${to} — "${subject}"`);
    return { success: true, messageId: null };
  }

  // Dev allow-list: one check here covers every path that sends org mail.
  const allow = outboundAllowList();
  if (!isOutboundAllowed(to, allow)) {
    console.log(`[OUTBOUND_EMAIL_ONLY_TO] not sent → ${to} — "${subject}"`);
    return { success: true, messageId: null };
  }
  if (allow) {
    cc = cc?.filter((r) => isOutboundAllowed(r.email, allow));
    bcc = bcc?.filter((r) => isOutboundAllowed(r.email, allow));
  }

  const sg = initSendGrid();

  const fromEmail = fromAddress || platformFromEmail(config);

  // Build categories array - include organization ID if provided
  const categories = ["HOA Connect"];
  if (organizationId) {
    categories.push(`org:${organizationId}`);
  }

  // Stamp the three tracking keys into custom_args so the activity webhook can
  // tie every event to its tenant, email record, and recipient — even for
  // callers (scheduled/transactional sends) that passed partial/no custom_args.
  // The webhook reads custom_args first; categories are the fallback.
  //   - organization_id : per-org isolation key
  //   - recipient_email : who the event is about (derived from `to`)
  //   - email_id        : which hoa_emails record (caller-supplied; absent for
  //                       transactional twins not tied to a record)
  const mergedCustomArgs: Record<string, string> = { ...(customArgs || {}) };
  if (organizationId && !mergedCustomArgs.organization_id) {
    mergedCustomArgs.organization_id = organizationId;
  }
  if (!mergedCustomArgs.recipient_email) {
    mergedCustomArgs.recipient_email = to;
  }
  const hasCustomArgs = Object.keys(mergedCustomArgs).length > 0;

  // SendGrid rejects a personalization where an address appears in both `to`
  // and cc/bcc — drop the primary recipient (and dupes) from the copy lists.
  const sanitizeCopies = (
    list?: Array<{ email: string; name?: string }>
  ): Array<{ email: string; name?: string }> | undefined => {
    if (!list?.length) return undefined;
    const seen = new Set([to.toLowerCase()]);
    const cleaned = list.filter((r) => {
      const e = (r.email || "").trim().toLowerCase();
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
    return cleaned.length ? cleaned : undefined;
  };
  const ccList = sanitizeCopies(cc);
  const bccList = sanitizeCopies(bcc);
  const extraHeaders = headers && Object.keys(headers).length ? headers : undefined;

  // Use dynamic template if templateId is provided
  if (templateId && templateData) {
    const dynamicMsg: {
      to: { email: string; name?: string };
      from: { email: string; name?: string };
      subject: string;
      templateId: string;
      dynamicTemplateData: EmailTemplateData;
      categories: string[];
      attachments?: EmailAttachment[];
      replyTo?: { email: string; name?: string };
      customArgs?: Record<string, string>;
      cc?: Array<{ email: string; name?: string }>;
      bcc?: Array<{ email: string; name?: string }>;
      headers?: Record<string, string>;
    } = {
      to: { email: to, name: toName },
      from: { email: fromEmail, name: fromName },
      subject,
      templateId,
      dynamicTemplateData: templateData,
      categories,
    };

    if (ccList) dynamicMsg.cc = ccList;
    if (bccList) dynamicMsg.bcc = bccList;
    if (extraHeaders) dynamicMsg.headers = extraHeaders;

    if (attachments && attachments.length > 0) {
      dynamicMsg.attachments = attachments;
      console.log(`[SendGrid] Adding ${attachments.length} attachment(s) to dynamic template email:`, attachments.map(a => ({
        filename: a.filename,
        type: a.type,
        disposition: a.disposition,
        contentId: a.contentId,
        contentLength: a.content?.length || 0
      })));
    }

    if (replyTo) {
      dynamicMsg.replyTo = replyTo;
    }

    if (hasCustomArgs) {
      dynamicMsg.customArgs = mergedCustomArgs;
    }

    console.log(`[SendGrid] Sending with dynamic template: ${templateId}`);
    console.log(`[SendGrid] Has attachments: ${attachments?.length || 0}`);
    console.log(`[SendGrid] Template data:`, JSON.stringify(templateData, null, 2));

    try {
      const [response] = await sg.send(dynamicMsg);
      const messageId = response.headers?.["x-message-id"] || null;
      console.log(`✅ Organization email sent via template to ${to}: ${subject} (ID: ${messageId})${attachments?.length ? ` with ${attachments.length} attachment(s)` : ""}`);
      return { success: true, messageId };
    } catch (error: any) {
      console.error("❌ SendGrid Template Error:", error);
      if (error.response) {
        console.error("[SendGrid] Response body:", JSON.stringify(error.response?.body, null, 2));
      }
      throw error;
    }
  }

  // Fall back to raw HTML if no template
  const msg: {
    to: { email: string; name?: string };
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
    categories: string[];
    attachments?: EmailAttachment[];
    replyTo?: { email: string; name?: string };
    customArgs?: Record<string, string>;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    headers?: Record<string, string>;
  } = {
    to: { email: to, name: toName },
    from: { email: fromEmail, name: fromName },
    subject,
    html,
    text,
    categories,
  };

  if (ccList) msg.cc = ccList;
  if (bccList) msg.bcc = bccList;
  if (extraHeaders) msg.headers = extraHeaders;

  // Add attachments if provided
  if (attachments && attachments.length > 0) {
    msg.attachments = attachments;
    console.log(`[SendGrid] Adding ${attachments.length} attachment(s):`, attachments.map(a => ({
      filename: a.filename,
      type: a.type,
      disposition: a.disposition,
      contentId: a.contentId,
      contentLength: a.content?.length || 0
    })));
  }

  // Add replyTo if provided
  if (replyTo) {
    msg.replyTo = replyTo;
  }

  // Add custom args for tracking (always includes organization_id when known)
  if (hasCustomArgs) {
    msg.customArgs = mergedCustomArgs;
  }

  // Log detailed info about the email being sent
  console.log(`[SendGrid] Preparing to send email:`);
  console.log(`[SendGrid] - To: ${to} (${toName || 'no name'})`);
  console.log(`[SendGrid] - From: ${fromEmail} (${fromName || 'no name'})`);
  console.log(`[SendGrid] - Subject: ${subject}`);
  console.log(`[SendGrid] - HTML length: ${html.length} chars`);
  console.log(`[SendGrid] - Text length: ${text.length} chars`);
  console.log(`[SendGrid] - HTML preview (first 500 chars): "${html.substring(0, 500)}..."`);

  try {
    const [response] = await sg.send(msg);
    // SendGrid returns message ID in the x-message-id header
    const messageId = response.headers?.["x-message-id"] || null;
    console.log(`✅ Organization email sent to ${to}: ${subject} (ID: ${messageId})${attachments?.length ? ` with ${attachments.length} attachment(s)` : ""}`);
    console.log(`[SendGrid] Response status: ${response.statusCode}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("[SendGrid] Response status:", error.response?.statusCode);
      console.error("[SendGrid] Response body:", JSON.stringify(error.response?.body, null, 2));
    }
    throw error;
  }
};
