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
  greeting?: string;
  salutation?: string;
  boardMembers?: BoardMemberInfo[];
  recipientName?: string;
  recipientFirstName?: string;
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
 * Get the default greeting template for an organization
 * Uses {{first_name}} as placeholder for personalization
 */
export function getDefaultGreeting(orgName: string): string {
  return `Hello {{first_name}},`;
}

/**
 * Process greeting template - replace variables with actual values
 * For web preview: replaces {{first_name}} with org name fallback
 * For actual emails: replaces {{first_name}} with recipient's first name
 */
function processGreeting(
  greetingTemplate: string,
  recipientFirstName?: string,
  orgName?: string
): string {
  if (!greetingTemplate) return "";

  let processed = greetingTemplate;

  if (recipientFirstName) {
    // For actual emails - use recipient's first name
    processed = processed.replace(/\{\{first_name\}\}/gi, recipientFirstName);
  } else if (orgName) {
    // For web preview - use organization name fallback
    processed = processed.replace(/\{\{first_name\}\}/gi, `${orgName} resident`);
  }

  return processed;
}

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
 * Check if content appears to be HTML
 */
function isHtmlContent(content: string): boolean {
  // Check for common HTML tags that indicate rich text content
  return /<(p|div|span|strong|em|h[1-6]|ul|ol|li|br|a|blockquote|img|table|tr|td|th)[^>]*>/i.test(content);
}

/**
 * Process content for email body
 * Handles both HTML (from Tiptap editor) and plain text/markdown
 */
function processContent(content: string): string {
  if (isHtmlContent(content)) {
    // Content is already HTML from Tiptap editor - add inline styles for email compatibility
    return content
      // Style headings
      .replace(/<h1([^>]*)>/gi, '<h1$1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #1f2937;">')
      .replace(/<h2([^>]*)>/gi, '<h2$1 style="margin: 0 0 14px 0; font-size: 20px; font-weight: 700; color: #1f2937;">')
      .replace(/<h3([^>]*)>/gi, '<h3$1 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #1f2937;">')
      // Style paragraphs
      .replace(/<p([^>]*)>/gi, '<p$1 style="margin: 0 0 16px 0; line-height: 1.6;">')
      // Style lists
      .replace(/<ul([^>]*)>/gi, '<ul$1 style="margin: 0 0 16px 0; padding-left: 24px;">')
      .replace(/<ol([^>]*)>/gi, '<ol$1 style="margin: 0 0 16px 0; padding-left: 24px;">')
      .replace(/<li([^>]*)>/gi, '<li$1 style="margin: 0 0 8px 0; line-height: 1.6;">')
      // Style blockquotes
      .replace(/<blockquote([^>]*)>/gi, '<blockquote$1 style="margin: 16px 0; padding: 12px 16px; border-left: 4px solid #d1d5db; background-color: #f9fafb; font-style: italic; color: #4b5563;">')
      // Style links
      .replace(/<a([^>]*href[^>]*)>/gi, '<a$1 style="color: #3b82f6; text-decoration: underline;">')
      // Style horizontal rules
      .replace(/<hr([^>]*)>/gi, '<hr$1 style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">')
      // Style images - make them responsive and centered for email
      .replace(/<img([^>]*)>/gi, '<img$1 style="max-width: 100%; height: auto; display: block; margin: 16px auto;">')
      // Style tables for email
      .replace(/<table([^>]*)>/gi, '<table$1 style="border-collapse: collapse; width: 100%; margin: 16px 0;">')
      .replace(/<th([^>]*)>/gi, '<th$1 style="border: 1px solid #d1d5db; padding: 8px 12px; background-color: #f3f4f6; font-weight: 600; text-align: left;">')
      .replace(/<td([^>]*)>/gi, '<td$1 style="border: 1px solid #d1d5db; padding: 8px 12px;">');
  }

  // Legacy markdown-style content processing
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, '</p><p style="margin: 0 0 16px 0; line-height: 1.6;">')
    .replace(/\n/g, "<br>");
}

/**
 * Build the email body with content
 */
function buildBody(
  content: string,
  emailType: EmailType,
  greeting?: string,
  recipientFirstName?: string,
  orgName?: string
): string {
  const style = emailTypeStyles[emailType];

  // Process content - handles both HTML and markdown
  const processedContent = processContent(content);

  // Process greeting with template variable replacement
  const greetingTemplate = greeting || getDefaultGreeting(orgName || "");
  const processedGreeting = processGreeting(greetingTemplate, recipientFirstName, orgName);
  const greetingHtml = processedGreeting
    ? `<p style="margin: 0 0 16px 0; line-height: 1.6;">${processedGreeting}</p>`
    : "";

  return `
    <!-- Body -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0; padding: 0;">
      <tr>
        <td style="padding: 32px; background-color: #ffffff;">
          ${greetingHtml}
          <div style="color: #374151; font-size: 16px; line-height: 1.6;">
            ${processedContent}
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
 * @param forPreview - If true, returns just the email body content without the full document wrapper
 */
export function buildEmailHtml(options: EmailTemplateOptions & { forPreview?: boolean }): string {
  const { organization, subject, content, emailType, greeting, salutation, boardMembers, recipientFirstName, directusUrl, forPreview } = options;
  const orgName = organization.name || "Organization";

  const header = buildHeader(organization, emailType, directusUrl);
  const body = buildBody(content, emailType, greeting, recipientFirstName, orgName);
  const footer = buildFooter(organization, emailType, salutation, boardMembers);

  // For preview, return just the email container without the full HTML document wrapper
  // This allows proper rendering in v-html without DOCTYPE/html/body issues
  if (forPreview) {
    return `
      <div style="background-color: #f3f4f6; padding: 24px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          ${header}
          ${body}
          ${footer}
        </div>
      </div>
    `.trim();
  }

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
 * Convert HTML content to plain text
 */
function htmlToPlainText(html: string): string {
  return html
    // Convert line breaks and block elements to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    // Add bullet points for list items
    .replace(/<li[^>]*>/gi, "• ")
    // Convert images to text description with link
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, "[Image: $2] ($1)")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, "[Image: $1] ($2)")
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "[Image] ($1)")
    // Handle tables - convert to simple text format
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<table[^>]*>/gi, "\n")
    .replace(/<\/table>/gi, "\n")
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, "")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build a plain text version of the email for fallback
 */
export function buildEmailText(options: EmailTemplateOptions): string {
  const { organization, content, greeting, salutation, boardMembers, recipientFirstName } = options;
  const orgName = organization.name || "Organization";
  const finalSalutation = salutation || defaultSalutations[options.emailType];

  let text = "";

  // Greeting with template variable replacement
  const greetingTemplate = greeting || getDefaultGreeting(orgName);
  const processedGreeting = processGreeting(greetingTemplate, recipientFirstName, orgName);
  if (processedGreeting) {
    text += `${processedGreeting}\n\n`;
  }

  // Content - convert HTML to plain text, also handle legacy markdown
  let plainContent: string;
  if (isHtmlContent(content)) {
    plainContent = htmlToPlainText(content);
  } else {
    plainContent = content
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1");
  }
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
