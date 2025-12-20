import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, DirectusFile } from "~~/types/directus";

export type EmailType = "basic" | "newsletter" | "announcement" | "reminder" | "notice";

interface BoardMemberInfo {
  name: string;
  title: string;
}

interface EmailTemplateOptions {
  organization: HoaOrganization & {
    settings?: BlockSetting | null;
  };
  subject: string;
  content: string;
  emailType: EmailType;
  salutation?: string;
  boardMembers?: BoardMemberInfo[];
  recipientName?: string;
  directusUrl: string;
}

// Email type configurations with colors and styling
const emailTypeStyles: Record<EmailType, { headerBg: string; accentColor: string; icon: string; label: string }> = {
  basic: {
    headerBg: "#1f2937",
    accentColor: "#3b82f6",
    icon: "✉️",
    label: "",
  },
  newsletter: {
    headerBg: "#1e3a5f",
    accentColor: "#0ea5e9",
    icon: "📰",
    label: "Newsletter",
  },
  announcement: {
    headerBg: "#7c2d12",
    accentColor: "#f97316",
    icon: "📢",
    label: "Announcement",
  },
  reminder: {
    headerBg: "#713f12",
    accentColor: "#eab308",
    icon: "⏰",
    label: "Reminder",
  },
  notice: {
    headerBg: "#14532d",
    accentColor: "#22c55e",
    icon: "📋",
    label: "Notice",
  },
};

// Default salutations based on email type
const defaultSalutations: Record<EmailType, string> = {
  basic: "Best regards",
  newsletter: "Warm regards",
  announcement: "Sincerely",
  reminder: "Thank you",
  notice: "Respectfully",
};

/**
 * Get the logo URL from organization settings
 */
function getLogoUrl(organization: EmailTemplateOptions["organization"], directusUrl: string): string | null {
  const settings = organization.settings as BlockSetting | undefined;
  if (!settings?.logo) return null;

  const logoId = typeof settings.logo === "string" ? settings.logo : (settings.logo as DirectusFile)?.id;
  if (!logoId) return null;

  return `${directusUrl}/assets/${logoId}?width=200&height=80&fit=contain`;
}

/**
 * Format board member title for display
 */
function formatTitle(title: string): string {
  const titleMap: Record<string, string> = {
    president: "President",
    "vice president": "Vice President",
    "Vice President": "Vice President",
    secretary: "Secretary",
    treasurer: "Treasurer",
    "board member": "Board Member",
    "borad member": "Board Member", // Handle typo in schema
  };
  return titleMap[title] || title;
}

/**
 * Build the email header with organization logo
 */
function buildHeader(
  organization: EmailTemplateOptions["organization"],
  emailType: EmailType,
  directusUrl: string
): string {
  const style = emailTypeStyles[emailType];
  const logoUrl = getLogoUrl(organization, directusUrl);
  const orgName = organization.name || "Organization";

  return `
    <!-- Header -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
      <tr>
        <td style="background-color: ${style.headerBg}; padding: 24px 32px; text-align: center;">
          ${
            logoUrl
              ? `<img src="${logoUrl}" alt="${orgName}" style="max-width: 200px; max-height: 80px; height: auto;" />`
              : `<h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${orgName}</h1>`
          }
          ${
            style.label
              ? `<div style="margin-top: 12px;">
              <span style="display: inline-block; background-color: ${style.accentColor}; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${style.icon} ${style.label}
              </span>
            </div>`
              : ""
          }
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build the email body with content
 */
function buildBody(content: string, emailType: EmailType, recipientName?: string): string {
  const style = emailTypeStyles[emailType];

  // Process content - convert markdown-style formatting to HTML
  const processedContent = content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p style=\"margin: 0 0 16px 0; line-height: 1.6;\">")
    .replace(/\n/g, "<br>");

  const greeting = recipientName ? `<p style="margin: 0 0 16px 0; line-height: 1.6;">Dear ${recipientName},</p>` : "";

  return `
    <!-- Body -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
      <tr>
        <td style="padding: 32px; background-color: #ffffff;">
          ${greeting}
          <div style="color: #374151; font-size: 16px; line-height: 1.6;">
            <p style="margin: 0 0 16px 0; line-height: 1.6;">${processedContent}</p>
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build the email footer with salutation and board members
 */
function buildFooter(
  organization: EmailTemplateOptions["organization"],
  emailType: EmailType,
  salutation?: string,
  boardMembers?: BoardMemberInfo[]
): string {
  const style = emailTypeStyles[emailType];
  const orgName = organization.name || "Organization";
  const finalSalutation = salutation || defaultSalutations[emailType];

  // Board members section
  let boardMembersHtml = "";
  if (boardMembers && boardMembers.length > 0) {
    const membersListHtml = boardMembers
      .map(
        (member) => `
        <td style="padding: 8px 16px; text-align: center; vertical-align: top;">
          <div style="font-weight: 600; color: #1f2937; font-size: 14px;">${member.name}</div>
          <div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${formatTitle(member.title)}</div>
        </td>
      `
      )
      .join("");

    boardMembersHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 24px;">
        <tr>
          <td style="text-align: center;">
            <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">Board of Directors</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
              <tr>
                ${membersListHtml}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }

  return `
    <!-- Footer -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
      <tr>
        <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
          <div style="color: #374151; font-size: 16px; margin-bottom: 4px;">${finalSalutation},</div>
          <div style="color: #1f2937; font-size: 16px; font-weight: 600;">${orgName}</div>
          ${boardMembersHtml}
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 32px; background-color: ${style.headerBg}; text-align: center;">
          <div style="color: #9ca3af; font-size: 12px;">
            ${organization.street_address ? `${organization.street_address}, ` : ""}
            ${organization.city ? `${organization.city}, ` : ""}
            ${organization.state || ""} ${organization.zip || ""}
          </div>
          ${organization.email ? `<div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">${organization.email}</div>` : ""}
          <div style="color: #6b7280; font-size: 11px; margin-top: 12px;">
            © ${new Date().getFullYear()} ${orgName}. All rights reserved.
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build a complete HTML email from the provided options
 */
export function buildEmailHtml(options: EmailTemplateOptions): string {
  const { organization, subject, content, emailType, salutation, boardMembers, recipientName, directusUrl } = options;

  const header = buildHeader(organization, emailType, directusUrl);
  const body = buildBody(content, emailType, recipientName);
  const footer = buildFooter(organization, emailType, salutation, boardMembers);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    /* Client-specific resets */
    #outlook a { padding: 0; }
    .ReadMsgBody { width: 100%; }
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }

    /* Mobile styles */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader text (hidden but shows in email previews) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${content.substring(0, 100).replace(/<[^>]*>/g, "")}...
  </div>

  <!-- Email wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td style="padding: 24px 16px;">
        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <tr>
            <td>
              ${header}
              ${body}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Build a plain text version of the email for fallback
 */
export function buildEmailText(options: EmailTemplateOptions): string {
  const { organization, content, salutation, boardMembers, recipientName } = options;
  const orgName = organization.name || "Organization";
  const finalSalutation = salutation || defaultSalutations[options.emailType];

  let text = "";

  // Greeting
  if (recipientName) {
    text += `Dear ${recipientName},\n\n`;
  }

  // Content - strip HTML and markdown
  const plainContent = content
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
  text += `${plainContent}\n\n`;

  // Salutation
  text += `${finalSalutation},\n${orgName}\n\n`;

  // Board members
  if (boardMembers && boardMembers.length > 0) {
    text += "---\nBoard of Directors:\n";
    boardMembers.forEach((member) => {
      text += `${member.name} - ${formatTitle(member.title)}\n`;
    });
    text += "\n";
  }

  // Footer
  const addressParts = [organization.street_address, organization.city, organization.state, organization.zip].filter(
    Boolean
  );
  if (addressParts.length > 0) {
    text += `${addressParts.join(", ")}\n`;
  }
  if (organization.email) {
    text += `${organization.email}\n`;
  }
  text += `\n© ${new Date().getFullYear()} ${orgName}. All rights reserved.`;

  return text;
}
