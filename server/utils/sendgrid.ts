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
