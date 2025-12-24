import mjml2html from "mjml";
import type {
  HoaOrganization,
  BlockSetting,
  DirectusFile,
} from "~~/types/directus";

export type EmailType =
  | "basic"
  | "newsletter"
  | "announcement"
  | "reminder"
  | "notice";

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
  emailId?: string;
  appUrl?: string;
}

// Email type configurations with colors and styling
const emailTypeStyles: Record<
  EmailType,
  { headerBg: string; accentColor: string; icon: string; label: string }
> = {
  basic: {
    headerBg: "#ffffff",
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
 */
export function getDefaultGreeting(orgName: string): string {
  return `Hello {{first_name}},`;
}

/**
 * Process greeting template - replace variables with actual values
 */
function processGreeting(
  greetingTemplate: string,
  recipientFirstName?: string,
  orgName?: string
): string {
  if (!greetingTemplate) return "";

  let processed = greetingTemplate;

  if (recipientFirstName) {
    processed = processed.replace(/\{\{first_name\}\}/gi, recipientFirstName);
  } else if (orgName) {
    processed = processed.replace(
      /\{\{first_name\}\}/gi,
      `${orgName} resident`
    );
  }

  return processed;
}

/**
 * Get the logo URL from organization settings
 */
function getLogoUrl(
  organization: EmailTemplateOptions["organization"],
  directusUrl: string
): string | null {
  const settings = organization.settings as BlockSetting | undefined;
  if (!settings?.logo) return null;

  const logoId =
    typeof settings.logo === "string"
      ? settings.logo
      : (settings.logo as DirectusFile)?.id;
  if (!logoId) return null;

  return `${directusUrl}/assets/${logoId}?width=200&format=png&fit=inside&quality=80`;
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
    "borad member": "Board Member",
  };
  return titleMap[title] || title;
}

/**
 * Check if content appears to be HTML
 */
function isHtmlContent(content: string): boolean {
  return /<(p|div|span|strong|em|h[1-6]|ul|ol|li|br|a|blockquote|img|table|tr|td|th)[^>]*>/i.test(
    content
  );
}

/**
 * Convert HTML content from Tiptap editor to MJML-safe content
 * This processes the content and wraps it properly for MJML
 */
function processContentForMjml(content: string): string {
  if (!isHtmlContent(content)) {
    // Legacy markdown-style content processing
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  // Process HTML content for email compatibility
  // Note: MJML will handle most styling, but we need to ensure proper structure
  let processed = content;

  // Convert <img> tags to use mj-image compatible styling
  // We'll wrap images in mj-image components later in the MJML template
  processed = processed.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi,
    (match, before, src, after) => {
      // Extract alt text if present
      const altMatch = (before + after).match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : "";
      // Mark images with a special wrapper for MJML processing
      return `<!--MJML_IMAGE:${src}:${alt}-->`;
    }
  );

  return processed;
}

/**
 * Convert processed content back to MJML components
 * Images are converted to mj-image tags for proper email rendering
 */
function contentToMjml(content: string): string {
  // Split content by image markers and convert to MJML
  const parts = content.split(/<!--MJML_IMAGE:([^:]*):([^>]*)-->/g);
  let mjmlContent = "";

  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      // Text content
      const text = parts[i].trim();
      if (text) {
        mjmlContent += `
          <mj-section padding="0">
            <mj-column>
              <mj-text padding="0 32px" color="#374151" font-size="16px" line-height="1.6">
                ${text}
              </mj-text>
            </mj-column>
          </mj-section>`;
      }
    } else if (i % 3 === 1) {
      // Image src
      const src = parts[i];
      const alt = parts[i + 1] || "";
      mjmlContent += `
          <mj-section padding="16px 0">
            <mj-column>
              <mj-image src="${src}" alt="${alt}" padding="0 32px" fluid-on-mobile="true" />
            </mj-column>
          </mj-section>`;
      i++; // Skip the alt part
    }
  }

  return mjmlContent;
}

/**
 * Build the complete MJML template and compile to HTML
 */
export function buildEmailHtml(
  options: EmailTemplateOptions & { forPreview?: boolean }
): string {
  const {
    organization,
    subject,
    content,
    emailType,
    greeting,
    salutation,
    boardMembers,
    recipientFirstName,
    directusUrl,
    forPreview,
    emailId,
    appUrl,
  } = options;

  const orgName = organization.name || "Organization";
  const style = emailTypeStyles[emailType];
  const logoUrl = getLogoUrl(organization, directusUrl);
  const finalSalutation = salutation || defaultSalutations[emailType];

  // Process greeting
  const greetingTemplate = greeting || getDefaultGreeting(orgName);
  const processedGreeting = processGreeting(
    greetingTemplate,
    recipientFirstName,
    orgName
  );

  // Process content for MJML
  const processedContent = processContentForMjml(content);
  const contentMjml = contentToMjml(processedContent);

  // Build board members section
  let boardMembersMjml = "";
  if (boardMembers && boardMembers.length > 0) {
    const membersHtml = boardMembers
      .map(
        (member) => `
        <td style="padding: 8px 16px; text-align: center; vertical-align: top;">
          <div style="font-weight: 600; color: #1f2937; font-size: 14px;">${member.name}</div>
          <div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${formatTitle(member.title)}</div>
        </td>`
      )
      .join("");

    boardMembersMjml = `
      <mj-section padding="24px 32px 0 32px">
        <mj-column>
          <mj-divider border-width="1px" border-color="#e5e7eb" padding="0 0 24px 0" />
          <mj-text align="center" color="#6b7280" font-size="12px" text-transform="uppercase" letter-spacing="1px" padding-bottom="16px">
            Board of Directors
          </mj-text>
          <mj-table>
            <tr>${membersHtml}</tr>
          </mj-table>
        </mj-column>
      </mj-section>`;
  }

  // Build address
  const addressParts = [
    organization.street_address,
    organization.city,
    organization.state,
    organization.zip,
  ].filter(Boolean);
  const addressLine = addressParts.join(", ");

  // Build web view banner
  const webViewBanner =
    emailId && appUrl
      ? `
    <mj-section background-color="#e5e7eb" padding="8px 16px">
      <mj-column>
        <mj-text align="center" font-size="8px" color="#6b7280" text-transform="uppercase" letter-spacing="0.5px">
          <a href="${appUrl}/api/email/view/${emailId}" style="color: #6b7280; text-decoration: none;">
            OPEN THIS EMAIL IN A WEB BROWSER
          </a>
        </mj-text>
      </mj-column>
    </mj-section>`
      : "";

  // Build the MJML template
  const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>${subject}</mj-title>
    <mj-preview>${content.substring(0, 100).replace(/<[^>]*>/g, "")}...</mj-preview>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" />
      <mj-text font-size="16px" color="#374151" line-height="1.6" />
    </mj-attributes>
    <mj-style>
      .outlook-group-fix { width:100% !important; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f3f4f6">
    ${webViewBanner}

    <!-- Main Container -->
    <mj-wrapper padding="24px 16px" background-color="#f3f4f6">
      <!-- Header -->
      <mj-section background-color="${style.headerBg}" padding="24px 32px">
        <mj-column>
          ${
            logoUrl
              ? `<mj-image src="${logoUrl}" alt="${orgName}" width="200px" align="center" />`
              : `<mj-text align="center" font-size="24px" font-weight="600" color="#ffffff">${orgName}</mj-text>`
          }
          ${
            style.label
              ? `<mj-text align="center" padding-top="12px">
              <span style="display: inline-block; background-color: ${style.accentColor}; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${style.icon} ${style.label}
              </span>
            </mj-text>`
              : ""
          }
        </mj-column>
      </mj-section>

      <!-- Body -->
      <mj-section background-color="#ffffff" padding="32px 0 0 0">
        <mj-column>
          ${
            processedGreeting
              ? `<mj-text padding="0 32px 16px 32px" color="#374151" font-size="16px" line-height="1.6">${processedGreeting}</mj-text>`
              : ""
          }
        </mj-column>
      </mj-section>

      ${contentMjml}

      <!-- Footer -->
      <mj-section background-color="#f9fafb" padding="24px 32px" border-top="1px solid #e5e7eb">
        <mj-column>
          <mj-text color="#374151" font-size="16px" padding-bottom="4px">${finalSalutation},</mj-text>
          <mj-text color="#1f2937" font-size="16px" font-weight="600">${orgName}</mj-text>
        </mj-column>
      </mj-section>

      ${boardMembersMjml}

      <!-- Bottom Footer -->
      <mj-section background-color="${style.headerBg}" padding="16px 32px">
        <mj-column>
          ${addressLine ? `<mj-text align="center" color="#9ca3af" font-size="12px">${addressLine}</mj-text>` : ""}
          ${organization.email ? `<mj-text align="center" color="#9ca3af" font-size="12px" padding-top="4px">${organization.email}</mj-text>` : ""}
          <mj-text align="center" color="#6b7280" font-size="11px" padding-top="12px">
            © ${new Date().getFullYear()} ${orgName}. All rights reserved.
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-wrapper>
  </mj-body>
</mjml>`;

  // Compile MJML to HTML
  const { html, errors } = mjml2html(mjmlTemplate, {
    validationLevel: "soft",
    minify: false,
  });

  if (errors && errors.length > 0) {
    console.warn("[MJML] Compilation warnings:", errors);
  }

  // For preview, extract just the body content
  if (forPreview) {
    // Extract content between <body> tags and wrap in a styled div
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${bodyMatch[1]}</div>`;
    }
  }

  return html;
}

/**
 * Convert HTML content to plain text
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(
      /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
      "[Image: $2] ($1)"
    )
    .replace(
      /<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi,
      "[Image: $1] ($2)"
    )
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "[Image] ($1)")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<table[^>]*>/gi, "\n")
    .replace(/<\/table>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build a plain text version of the email for fallback
 */
export function buildEmailText(options: EmailTemplateOptions): string {
  const {
    organization,
    content,
    greeting,
    salutation,
    boardMembers,
    recipientFirstName,
  } = options;
  const orgName = organization.name || "Organization";
  const finalSalutation = salutation || defaultSalutations[options.emailType];

  let text = "";

  // Greeting
  const greetingTemplate = greeting || getDefaultGreeting(orgName);
  const processedGreeting = processGreeting(
    greetingTemplate,
    recipientFirstName,
    orgName
  );
  if (processedGreeting) {
    text += `${processedGreeting}\n\n`;
  }

  // Content
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
  const addressParts = [
    organization.street_address,
    organization.city,
    organization.state,
    organization.zip,
  ].filter(Boolean);
  if (addressParts.length > 0) {
    text += `${addressParts.join(", ")}\n`;
  }
  if (organization.email) {
    text += `${organization.email}\n`;
  }
  text += `\n© ${new Date().getFullYear()} ${orgName}. All rights reserved.`;

  return text;
}

/**
 * Extract all image URLs from HTML content
 * Used to prepare images for CID embedding
 */
export function extractImageUrls(content: string): string[] {
  const imgRegex = /<img[^>]*?src=["']([^"']+)["'][^>]*?>/gi;
  const urls: string[] = [];
  let match;

  while ((match = imgRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Replace image URLs with CID references
 * Call this after downloading images and before building HTML
 */
export function replaceImageUrlsWithCid(
  content: string,
  urlToCidMap: Map<string, string>
): string {
  let processed = content;

  for (const [url, cid] of urlToCidMap) {
    // Escape special regex characters in URL
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`src=["']${escapedUrl}["']`, "gi");
    processed = processed.replace(regex, `src="cid:${cid}"`);
  }

  return processed;
}
