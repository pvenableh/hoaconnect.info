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
}: {
  to: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  invitationUrl: string;
  inviterName: string;
  roleName: string;
  expiresAt: string;
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

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridInvitationTemplateId, // You'll need to create this in SendGrid
    dynamicTemplateData: {
      firstName,
      lastName,
      organizationName,
      invitationUrl,
      inviterName,
      roleName,
      expirationDate,
      // Additional template variables
      subject: `You've been invited to join ${organizationName}`,
    },
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
}: {
  to: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  loginUrl: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridWelcomeTemplateId, // You'll need to create this in SendGrid
    dynamicTemplateData: {
      firstName,
      lastName,
      organizationName,
      loginUrl,
      // Additional template variables
      subject: `Welcome to ${organizationName}!`,
    },
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
}: {
  to: string;
  adminName: string;
  memberName: string;
  memberEmail: string;
  organizationName: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const msg = {
    to,
    from: config.public.fromEmail || "noreply@605lincolnroad.com",
    templateId: config.sendgridInvitationAcceptedTemplateId, // You'll need to create this in SendGrid
    dynamicTemplateData: {
      adminName,
      memberName,
      memberEmail,
      organizationName,
      // Additional template variables
      subject: `${memberName} has joined ${organizationName}`,
    },
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
 * Send a single organization email with HTML template
 */
export const sendOrganizationEmail = async ({
  to,
  toName,
  subject,
  html,
  text,
  fromName,
}: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}) => {
  const config = useRuntimeConfig();
  const sg = initSendGrid();

  const fromEmail = config.public.fromEmail || "noreply@605lincolnroad.com";

  const msg = {
    to: { email: to, name: toName },
    from: { email: fromEmail, name: fromName },
    subject,
    html,
    text,
  };

  try {
    await sg.send(msg);
    console.log(`✅ Organization email sent to ${to}: ${subject}`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) {
      console.error("Response body:", error.response.body);
    }
    throw error;
  }
};
