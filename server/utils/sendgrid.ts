import sgMail from "@sendgrid/mail";

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
  return sgMail;
};

/**
 * Unified invite email template data
 * Used for invitation, welcome, and accepted notification emails
 */
export interface InviteEmailTemplateData {
  // Email type (determines content displayed)
  email_type: 'invitation' | 'welcome' | 'accepted';

  // Recipient info
  first_name: string;
  last_name?: string;

  // For invitation emails
  inviter_name?: string;
  role_name?: string;
  expiration_date?: string;
  invitation_url?: string;

  // For accepted notification emails
  member_name?: string;
  member_email?: string;

  // For welcome emails
  login_url?: string;

  // Organization info (shared across all types)
  org_name: string;
  org_legal_name?: string;
  org_logo_url?: string;
  org_url?: string;
  org_phone_number?: string;
  org_email?: string;
  org_address?: string;

  // Email metadata
  subject: string;
  year?: string;
}

/**
 * Send HOA invitation email
 */
export const sendHoaInvitationEmail = async ({
  to,
  firstName,
  lastName,
  organizationName,
  invitationUrl,
  inviterName,
  roleName,
  expiresAt,
  // New organization fields
  orgLogoUrl,
  orgUrl,
  orgPhoneNumber,
  orgEmail,
  orgAddress,
  orgLegalName,
}: {
  to: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  invitationUrl: string;
  inviterName: string;
  roleName: string;
  expiresAt: string;
  // New optional organization fields
  orgLogoUrl?: string;
  orgUrl?: string;
  orgPhoneNumber?: string;
  orgEmail?: string;
  orgAddress?: string;
  orgLegalName?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  // Format expiration date
  const expirationDate = new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const templateData: InviteEmailTemplateData = {
    email_type: 'invitation',
    first_name: firstName,
    last_name: lastName,
    inviter_name: inviterName,
    role_name: roleName,
    expiration_date: expirationDate,
    invitation_url: invitationUrl,
    org_name: organizationName,
    org_legal_name: orgLegalName,
    org_logo_url: orgLogoUrl,
    org_url: orgUrl,
    org_phone_number: orgPhoneNumber,
    org_email: orgEmail,
    org_address: orgAddress,
    subject: `You've been invited to join ${organizationName}`,
    year: new Date().getFullYear().toString(),
  };

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridInviteEmailTemplateId,
    dynamicTemplateData: templateData,
  };

  try {
    await sg.send(msg);
    console.log(`✅ Invitation email sent to ${to}`);
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("Response body:", error.response.body);
    }
    throw error;
  }
};

/**
 * Send welcome email to new organization admin
 */
export const sendWelcomeEmail = async ({
  to,
  firstName,
  lastName,
  organizationName,
  loginUrl,
  // New organization fields
  orgLogoUrl,
  orgUrl,
  orgPhoneNumber,
  orgEmail,
  orgAddress,
  orgLegalName,
}: {
  to: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  loginUrl: string;
  // New optional organization fields
  orgLogoUrl?: string;
  orgUrl?: string;
  orgPhoneNumber?: string;
  orgEmail?: string;
  orgAddress?: string;
  orgLegalName?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const templateData: InviteEmailTemplateData = {
    email_type: 'welcome',
    first_name: firstName,
    last_name: lastName,
    login_url: loginUrl,
    org_name: organizationName,
    org_legal_name: orgLegalName,
    org_logo_url: orgLogoUrl,
    org_url: orgUrl,
    org_phone_number: orgPhoneNumber,
    org_email: orgEmail,
    org_address: orgAddress,
    subject: `Welcome to ${organizationName}!`,
    year: new Date().getFullYear().toString(),
  };

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridInviteEmailTemplateId,
    dynamicTemplateData: templateData,
  };

  try {
    await sg.send(msg);
    console.log(`✅ Welcome email sent to ${to}`);
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("Response body:", error.response.body);
    }
    throw error;
  }
};

/**
 * Send invitation accepted notification to admin
 */
export const sendInvitationAcceptedEmail = async ({
  to,
  adminName,
  memberName,
  memberEmail,
  organizationName,
  // New organization fields
  orgLogoUrl,
  orgUrl,
  orgPhoneNumber,
  orgEmail,
  orgAddress,
  orgLegalName,
}: {
  to: string;
  adminName: string;
  memberName: string;
  memberEmail: string;
  organizationName: string;
  // New optional organization fields
  orgLogoUrl?: string;
  orgUrl?: string;
  orgPhoneNumber?: string;
  orgEmail?: string;
  orgAddress?: string;
  orgLegalName?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const templateData: InviteEmailTemplateData = {
    email_type: 'accepted',
    first_name: adminName,
    member_name: memberName,
    member_email: memberEmail,
    org_name: organizationName,
    org_legal_name: orgLegalName,
    org_logo_url: orgLogoUrl,
    org_url: orgUrl,
    org_phone_number: orgPhoneNumber,
    org_email: orgEmail,
    org_address: orgAddress,
    subject: `${memberName} has joined ${organizationName}`,
    year: new Date().getFullYear().toString(),
  };

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridInviteEmailTemplateId,
    dynamicTemplateData: templateData,
  };

  try {
    await sg.send(msg);
    console.log(`✅ Invitation accepted email sent to ${to}`);
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("Response body:", error.response.body);
    }
    throw error;
  }
};

/**
 * Send generic email (fallback if you don't have templates set up yet)
 */
export const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    subject,
    text,
    html: html || text,
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

  const fromEmail = config.public.fromEmail || "noreply@605lincolnroad.com";

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

  // Board members (each with name, title, icon)
  board_members?: Array<{ name: string; title: string; icon?: string }>;

  // Links
  Weblink?: string; // View in browser URL

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
}: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  attachments?: EmailAttachment[];
  templateId?: string;
  templateData?: EmailTemplateData;
  replyTo?: { email: string; name?: string };
  customArgs?: Record<string, string>;
  organizationId?: string;
}): Promise<{ success: true; messageId: string | null }> => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const fromEmail = config.public.fromEmail || "noreply@hoaconnect.info";

  // Build categories array - include organization ID if provided
  const categories = ["HOA Connect"];
  if (organizationId) {
    categories.push(`org:${organizationId}`);
  }

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
    } = {
      to: { email: to, name: toName },
      from: { email: fromEmail, name: fromName },
      subject,
      templateId,
      dynamicTemplateData: templateData,
      categories,
    };

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

    if (customArgs) {
      dynamicMsg.customArgs = customArgs;
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
  } = {
    to: { email: to, name: toName },
    from: { email: fromEmail, name: fromName },
    subject,
    html,
    text,
    categories,
  };

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

  // Add custom args for tracking
  if (customArgs) {
    msg.customArgs = customArgs;
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
