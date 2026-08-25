import mjml2html from "mjml";
import type {
  HoaOrganization,
  BlockSetting,
  DirectusFile,
} from "#core/types/directus";

export type EmailType =
  | "basic"
  | "alert"
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
  /** Custom line under the logo, e.g. "Official Communication of {name}". Supports {name}/{legal_name}. */
  headerText?: string | null;
  /** Building-photo file (id or object) shown full-width in the footer. */
  footerImage?: DirectusFile | string | null;
  /** Homepage link shown in the footer. */
  homepageUrl?: string | null;
  /** Friendly public web-view URL for the "open in browser" banner (overrides the /api/email/view fallback). */
  webViewUrl?: string | null;
}

// Email type configurations with colors and styling.
// These are the platform-default palettes, used when an org has not set brand
// colours (`block_settings.colors`). Orgs with a palette get their own chrome
// via resolveEmailTypeStyle() below.
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
  alert: {
    headerBg: "#7f1d1d",
    accentColor: "#ef4444",
    icon: "🚨",
    label: "Alert",
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

/**
 * The style buildEmailHtml renders with — the type palette plus the text
 * colours that sit on top of it. The text colours exist so an org-supplied
 * light palette can flip its overlay text dark; the platform defaults keep the
 * exact literals the template has always used.
 */
export interface ResolvedEmailTypeStyle {
  headerBg: string;
  accentColor: string;
  icon: string;
  label: string;
  /** Org name in the header band when there is no logo. */
  headerTextColor: string;
  /** The custom header line under the logo. */
  headerSubTextColor: string;
  /** Address / email / homepage link in the bottom band. */
  footerTextColor: string;
  /** Text inside the type badge pill. */
  badgeTextColor: string;
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Accept only literal hex colours — these land unescaped in inline styles. */
function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return HEX_COLOR_RE.test(v) ? v : null;
}

/** Expand `#abc` to `#aabbcc` so colours can be compared literally. */
function expandHexColor(hex: string): string {
  const h = hex.slice(1);
  return h.length === 3
    ? `#${h.split("").map((c) => c + c).join("")}`.toLowerCase()
    : `#${h}`.toLowerCase();
}

/** Is this colour pure white? (i.e. a band a white logo plate would vanish into) */
function isWhiteColor(hex: string): boolean {
  return expandHexColor(hex) === "#ffffff";
}

/** YIQ brightness test: is white text readable on this colour? */
function isDarkColor(hex: string): boolean {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Resolve the visual style for an email type, honouring the org's brand
 * palette (`block_settings.colors[0]`) when one is set.
 *
 * The deliberate division of labour once colour becomes org-driven:
 * - The header/footer bands are BRAND — they take the org's primary colour,
 *   the same way the logo and header line are the org's, not the platform's.
 * - The badge pill's icon + label are SEMANTIC and never change: 🚨 ALERT
 *   still says alert whatever the palette.
 * - The pill colour is brand (org accent) for every type EXCEPT alert, which
 *   keeps its red — urgency must survive a soft brand palette.
 * - `basic` stays brand-neutral white by design; it never had type chrome.
 *
 * An org with no palette gets the platform defaults byte-for-byte.
 */
export function resolveEmailTypeStyle(
  emailType: EmailType,
  settings?: BlockSetting | null
): ResolvedEmailTypeStyle {
  const base = emailTypeStyles[emailType];
  const fallback: ResolvedEmailTypeStyle = {
    ...base,
    headerTextColor: "#ffffff",
    headerSubTextColor: "#e5e7eb",
    footerTextColor: "#9ca3af",
    badgeTextColor: "#ffffff",
  };
  if (emailType === "basic") return fallback;

  const palette = Array.isArray(settings?.colors) ? settings?.colors[0] : null;
  const primary = normalizeHexColor(palette?.primary);
  const accent = normalizeHexColor(palette?.accent);
  if (!primary && !accent) return fallback;

  const headerBg = primary ?? base.headerBg;
  const accentColor =
    emailType === "alert" ? base.accentColor : accent ?? primary ?? base.accentColor;
  const headerIsDark = isDarkColor(headerBg);
  return {
    ...base,
    headerBg,
    accentColor,
    headerTextColor: headerIsDark ? "#ffffff" : "#1f2937",
    headerSubTextColor: headerIsDark ? "#e5e7eb" : "#4b5563",
    footerTextColor: headerIsDark ? "#9ca3af" : "#4b5563",
    badgeTextColor: isDarkColor(accentColor) ? "#ffffff" : "#1f2937",
  };
}

/**
 * The stack every email used before typography became per-org. It is still what
 * an org with no theme gets, byte for byte.
 */
const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export interface ResolvedEmailFonts {
  /** CSS stack for the org name and any heading in the body. */
  heading: string;
  /** CSS stack for everything else. */
  body: string;
  /** Google Fonts to request via <mj-font>; empty for the default pairing. */
  webFonts: Array<{ name: string; href: string }>;
}

const googleFont = (family: string, spec: string) => ({
  name: family,
  href: `https://fonts.googleapis.com/css2?family=${spec}&display=swap`,
});

/**
 * Typography per org, keyed on the theme it already chose in branding settings.
 *
 * ⚠️ Email typography is not web typography. Apple Mail (Mac + iOS), Outlook for
 * Mac, Samsung Mail and Thunderbird load a linked web font; **Gmail on every
 * platform, Outlook on Windows, Outlook.com and Yahoo strip it** and resolve the
 * rest of the stack. So each pairing names a real, installed-everywhere face
 * behind the web font, and NOTHING may depend on the web font arriving —
 * these are the same faces the theme uses on the web, degrading to their
 * nearest system relative rather than to whatever the client picks.
 *
 * Deliberately NOT using a blanket `<!--[if mso]>* { font-family }` override:
 * it would flatten the heading/body distinction in Outlook. Word falls through
 * a properly quoted stack on its own, and every stack below ends in Georgia or
 * Arial, so Outlook lands on a real face without help.
 *
 * An org with no theme keeps `DEFAULT_FONT_STACK` and requests no web font.
 */
export function resolveEmailFonts(settings?: BlockSetting | null): ResolvedEmailFonts {
  // `BlockSetting["theme"]` is generated as `"classic" | "modern"`, but the
  // column really holds "luxury" too (605 Lincoln is on it, and the branding
  // form offers it). Widen at the boundary rather than switch on a type that
  // is narrower than the data.
  const theme = (settings?.theme as string | null | undefined) ?? null;
  switch (theme) {
    case "classic":
      // Bauer Bodoni + Proxima Nova on the web. Playfair keeps the editorial
      // voice but survives 20px on a low-DPI screen, where a true Didone's
      // hairlines break up; Mulish is the closest free relative to Proxima and
      // has genuine light weights.
      return {
        heading: "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
        body: `Mulish, ${DEFAULT_FONT_STACK}`,
        webFonts: [
          googleFont("Playfair Display", "Playfair+Display:wght@500;600"),
          googleFont("Mulish", "Mulish:wght@300;400;600"),
        ],
      };
    case "modern":
      // Proxima Nova throughout on the web. Inter was drawn as a San Francisco
      // analogue, and the fallback here is already -apple-system — so the gap
      // between web font and fallback is nearly invisible.
      return {
        heading: `Inter, ${DEFAULT_FONT_STACK}`,
        body: `Inter, ${DEFAULT_FONT_STACK}`,
        webFonts: [googleFont("Inter", "Inter:wght@400;500;600")],
      };
    case "luxury":
      // The literal Didone, paired with a Futura relative for the body.
      return {
        heading: "'Bodoni Moda', Georgia, 'Times New Roman', Times, serif",
        body: `Jost, ${DEFAULT_FONT_STACK}`,
        webFonts: [
          googleFont("Bodoni Moda", "Bodoni+Moda:opsz,wght@6..96,500;6..96,600"),
          googleFont("Jost", "Jost:wght@300;400;500"),
        ],
      };
    default:
      return { heading: DEFAULT_FONT_STACK, body: DEFAULT_FONT_STACK, webFonts: [] };
  }
}

// Default salutations based on email type
const defaultSalutations: Record<EmailType, string> = {
  basic: "Best regards",
  alert: "Sincerely",
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
  directusUrl: string,
  /**
   * Optional height cap. Without it the asset is only width-constrained, which
   * is right for a wordmark but renders an app-icon-shaped upload as a 200px
   * square. Constraining the BITMAP (rather than styling the `<img>`) is what
   * makes the cap hold in Outlook, which ignores `max-height`.
   */
  maxHeight?: number
): string | null {
  const settings = organization.settings as BlockSetting | undefined;
  if (!settings?.logo) return null;

  const logoId =
    typeof settings.logo === "string"
      ? settings.logo
      : (settings.logo as DirectusFile)?.id;
  if (!logoId) return null;

  const height = maxHeight ? `&height=${maxHeight}` : "";
  return `${directusUrl}/assets/${logoId}?width=200${height}&format=png&fit=inside&quality=80`;
}

/**
 * Build a Directus asset URL for any file reference (id string or file object).
 */
function getFileUrl(
  file: DirectusFile | string | null | undefined,
  directusUrl: string,
  query = ""
): string | null {
  if (!file) return null;
  const id = typeof file === "string" ? file : file?.id;
  if (!id) return null;
  return `${directusUrl}/assets/${id}${query ? `?${query}` : ""}`;
}

/**
 * Resolve a header line template, substituting {name} / {legal_name}.
 * Returns null/empty when no template is provided.
 */
function processHeaderText(
  template: string | null | undefined,
  orgName: string,
  legalName?: string | null
): string {
  if (!template) return "";
  return template
    .replace(/\{name\}/gi, orgName)
    .replace(/\{legal_name\}/gi, legalName || orgName);
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
  const hasHtml = /<(p|div|span|strong|em|h[1-6]|ul|ol|li|br|a|blockquote|img|table|tr|td|th)[^>]*>/i.test(
    content
  );
  console.log(`[MJML] isHtmlContent check: ${hasHtml}, content preview: "${content.substring(0, 200)}..."`);
  return hasHtml;
}

/**
 * Process HTML content for email compatibility
 * Handles tables, blockquotes, links, and images for proper MJML rendering
 */
export function processHtmlForEmail(content: string, headingFont?: string): string {
  // Appended to every h1-h6 inline style. Empty when no font is passed, which
  // is what keeps an unthemed org's output byte-identical.
  const headingCss = headingFont ? ` font-family: ${headingFont};` : "";
  let processed = content;

  // Add email-safe inline styles to links
  processed = processed.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, href, after) => {
      // Check if style already exists
      const hasStyle = /style=/i.test(before + after);
      const linkStyle = 'color: #3b82f6; text-decoration: underline;';
      if (hasStyle) {
        // Append to existing style
        return match.replace(/style=["']([^"']*)["']/i, `style="$1 ${linkStyle}"`);
      }
      return `<a ${before}href="${href}" style="${linkStyle}"${after}>`;
    }
  );

  // Style blockquotes for email
  processed = processed.replace(
    /<blockquote([^>]*)>/gi,
    '<blockquote$1 style="margin: 16px 0; padding: 12px 20px; border-left: 4px solid #3b82f6; background-color: #f3f4f6; color: #4b5563; font-style: italic;">'
  );

  // Style tables for email compatibility
  processed = processed.replace(
    /<table([^>]*)>/gi,
    '<table$1 style="width: 100%; border-collapse: collapse; margin: 16px 0;">'
  );
  processed = processed.replace(
    /<th([^>]*)>/gi,
    '<th$1 style="border: 1px solid #d1d5db; padding: 12px; background-color: #f9fafb; font-weight: 600; text-align: left;">'
  );
  processed = processed.replace(
    /<td([^>]*)>/gi,
    '<td$1 style="border: 1px solid #d1d5db; padding: 12px;">'
  );
  processed = processed.replace(
    /<tr([^>]*)>/gi,
    '<tr$1 style="border-bottom: 1px solid #e5e7eb;">'
  );

  // Style lists for email
  processed = processed.replace(
    /<ul([^>]*)>/gi,
    '<ul$1 style="margin: 16px 0; padding-left: 24px;">'
  );
  processed = processed.replace(
    /<ol([^>]*)>/gi,
    '<ol$1 style="margin: 16px 0; padding-left: 24px;">'
  );
  processed = processed.replace(
    /<li([^>]*)>/gi,
    '<li$1 style="margin: 8px 0;">'
  );

  // Style headings for email - with bottom padding as requested
  processed = processed.replace(
    /<h1([^>]*)>/gi,
    `<h1$1 style="margin: 0; padding: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #111827; line-height: 1.3;${headingCss}">`
  );
  processed = processed.replace(
    /<h2([^>]*)>/gi,
    `<h2$1 style="margin: 0; padding: 0 0 18px 0; font-size: 24px; font-weight: 600; color: #1f2937; line-height: 1.3;${headingCss}">`
  );
  processed = processed.replace(
    /<h3([^>]*)>/gi,
    `<h3$1 style="margin: 0; padding: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #374151; line-height: 1.4;${headingCss}">`
  );
  processed = processed.replace(
    /<h4([^>]*)>/gi,
    `<h4$1 style="margin: 0; padding: 0 0 14px 0; font-size: 18px; font-weight: 600; color: #374151; line-height: 1.4;${headingCss}">`
  );
  processed = processed.replace(
    /<h5([^>]*)>/gi,
    `<h5$1 style="margin: 0; padding: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #4b5563; line-height: 1.4;${headingCss}">`
  );
  processed = processed.replace(
    /<h6([^>]*)>/gi,
    `<h6$1 style="margin: 0; padding: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #4b5563; line-height: 1.4;${headingCss}">`
  );

  // Style paragraphs for email - with bottom padding as requested
  processed = processed.replace(
    /<p([^>]*)>/gi,
    '<p$1 style="margin: 0; padding: 0 0 16px 0; line-height: 1.6;">'
  );

  return processed;
}

/**
 * Convert HTML content from Tiptap editor to MJML-safe content
 * This processes the content and wraps it properly for MJML
 */
function processContentForMjml(content: string, headingFont?: string): string {
  console.log(`[MJML] processContentForMjml input (${content.length} chars): "${content.substring(0, 300)}..."`);

  if (!isHtmlContent(content)) {
    // Legacy markdown-style content processing
    console.log(`[MJML] Content is NOT HTML, processing as markdown`);
    const result = content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
    console.log(`[MJML] Markdown processed result: "${result.substring(0, 300)}..."`);
    return result;
  }

  console.log(`[MJML] Content IS HTML, applying email styles`);

  // First, apply email-safe styling to HTML elements
  let processed = processHtmlForEmail(content, headingFont);
  console.log(`[MJML] After processHtmlForEmail: "${processed.substring(0, 300)}..."`);

  // Convert <img> tags to MJML image markers
  // Use ||| as separator since : appears in cid: URLs
  processed = processed.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi,
    (match, before, src, after) => {
      // Extract alt text if present
      const altMatch = (before + after).match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : "";
      // Mark images with a special wrapper for MJML processing
      // Use ||| as separator to avoid conflict with : in URLs
      console.log(`[MJML] Converting image to marker: src="${src}", alt="${alt}"`);
      return `<!--MJML_IMAGE|||${src}|||${alt}-->`;
    }
  );

  console.log(`[MJML] Final processed content: "${processed.substring(0, 300)}..."`);
  return processed;
}

/**
 * Convert processed content back to MJML components
 * Images are converted to mj-image tags for proper email rendering
 * All other HTML content is preserved within mj-text blocks
 */
function contentToMjml(content: string, emailType: EmailType = "basic"): string {
  console.log(`[MJML] contentToMjml input (${content.length} chars), emailType: ${emailType}`);

  // Split content by image markers (using ||| as separator)
  const parts = content.split(/<!--MJML_IMAGE\|\|\|([^|]*(?:\|(?!\|)[^|]*)*)\|\|\|([^>]*)-->/g);
  console.log(`[MJML] Split into ${parts.length} parts`);

  let mjmlContent = "";
  let textBuffer = "";

  // For basic emails, use minimal styling
  const isBasic = emailType === "basic";
  const sectionPadding = isBasic ? "0" : "0";
  const textPadding = isBasic ? "8px 16px" : "16px 32px";
  const imagePadding = isBasic ? "8px 16px" : "0 32px";

  // Helper to flush text buffer as mj-text section
  const flushTextBuffer = () => {
    if (textBuffer.trim()) {
      console.log(`[MJML] Flushing text buffer (${textBuffer.length} chars): "${textBuffer.substring(0, 100)}..."`);
      mjmlContent += `
          <mj-section padding="${sectionPadding}">
            <mj-column>
              <mj-text padding="${textPadding}" color="#374151" font-size="16px" line-height="1.6">
                ${textBuffer.trim()}
              </mj-text>
            </mj-column>
          </mj-section>`;
      textBuffer = "";
    }
  };

  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      // Text content - accumulate in buffer
      const text = parts[i];
      if (text) {
        textBuffer += text;
      }
    } else if (i % 3 === 1) {
      // Image src - flush text buffer first, then add image
      flushTextBuffer();

      const src = parts[i] ?? "";
      const alt = parts[i + 1] || "";
      console.log(`[MJML] Adding image section: src="${src.substring(0, 50)}...", alt="${alt}"`);
      mjmlContent += `
          <mj-section padding="16px 0">
            <mj-column>
              <mj-image src="${src}" alt="${alt}" padding="${imagePadding}" fluid-on-mobile="true" align="center" />
            </mj-column>
          </mj-section>`;
      i++; // Skip the alt part
    }
  }

  // Flush any remaining text
  flushTextBuffer();

  console.log(`[MJML] contentToMjml output (${mjmlContent.length} chars): "${mjmlContent.substring(0, 200)}..."`);
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
    headerText,
    footerImage,
    homepageUrl,
    webViewUrl,
  } = options;

  const orgName = organization.name || "Organization";
  const legalName = organization.legal_name || orgName;
  const style = resolveEmailTypeStyle(emailType, organization.settings ?? null);
  const fonts = resolveEmailFonts(organization.settings ?? null);
  // 120px is the height cap. It only bites on TALL logos: a wide wordmark
  // (605's is 200x75) is already width-constrained and comes back unchanged,
  // while a square app-icon upload (1033's) stops being a 200px poster. The
  // web view deliberately does NOT cap height — it is a real page with room to
  // spare, and staying on the old URL keeps that surface byte-identical.
  const logoUrl = getLogoUrl(organization, directusUrl, 120);
  const finalSalutation = salutation || defaultSalutations[emailType];
  const processedHeaderText = processHeaderText(headerText, orgName, organization.legal_name);
  const footerImageUrl = getFileUrl(footerImage, directusUrl, "width=1200&format=jpg&fit=cover&quality=80");

  // Process greeting
  const greetingTemplate = greeting || getDefaultGreeting(orgName);
  const processedGreeting = processGreeting(
    greetingTemplate,
    recipientFirstName,
    orgName
  );

  // Process content for MJML
  console.log(`[MJML] buildEmailHtml called with emailType: ${emailType}`);
  console.log(`[MJML] Content input (${content.length} chars): "${content.substring(0, 200)}..."`);

  const processedContent = processContentForMjml(content, fonts.heading);
  const contentMjml = contentToMjml(processedContent, emailType);

  console.log(`[MJML] Generated contentMjml (${contentMjml.length} chars)`);

  // For basic emails, use minimal styling
  const isBasic = emailType === "basic";

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

  // Build web view banner — prefer the friendly /{slug}/announcements/email/{web_slug}
  // URL, falling back to the /api/email/view/{id} endpoint.
  const bannerHref = webViewUrl || (emailId && appUrl ? `${appUrl}/api/email/view/${emailId}` : null);
  const webViewBanner = bannerHref
    ? `
    <mj-section background-color="#e5e7eb" padding="8px 16px">
      <mj-column>
        <mj-text align="center" font-size="8px" color="#6b7280" text-transform="uppercase" letter-spacing="0.5px">
          <a href="${bannerHref}" style="color: #6b7280; text-decoration: none;">
            OPEN THIS EMAIL IN A WEB BROWSER
          </a>
        </mj-text>
      </mj-column>
    </mj-section>`
    : "";

  // Build the MJML template
  // For basic emails: white background, minimal padding, no grey wrapper
  // For other types: styled headers with colors
  const bodyBg = isBasic ? "#ffffff" : "#f3f4f6";
  const wrapperPadding = isBasic ? "8px" : "24px 16px";
  const headerPadding = isBasic ? "16px" : "24px 32px";
  const greetingPadding = isBasic ? "8px 16px" : "0 32px 16px 32px";
  const footerPadding = isBasic ? "16px" : "24px 32px";
  const bottomPadding = isBasic ? "12px 16px" : "16px 32px";

  // ── The logo lockup ───────────────────────────────────────────────────────
  // An org's logo is whatever they uploaded, and it lands on a coloured band
  // we choose. No small association reliably has a transparent, correctly
  // -coloured wordmark: 1033's is an opaque white square (a white box on their
  // ink band) and 605's is a grey wordmark on their grey band (invisible).
  //
  // So the renderer puts the logo on a white plate whenever the band is not
  // already white. That is band-colour independent, so it fixes every org at
  // once, and it replaces today's impossible requirement ("your logo must read
  // on both your brand colour AND the white `basic` band") with one an org can
  // actually satisfy: it must read on white. `basic`'s band IS white, so the
  // plate is skipped there and that email is untouched.
  //
  // Hand-rolled rather than `mj-image`, because `container-background-color`
  // would paint the full column width — a white strip, not a plate. The nested
  // `<table align="center">` shrink-wraps and is what Outlook needs; the
  // border-radius degrades to square corners there, which is fine.
  const headerBandBg = isBasic ? "#ffffff" : style.headerBg;
  const logoOnPlate = !isWhiteColor(headerBandBg);
  // No width attribute: the bitmap is already capped to 200x120 by the asset
  // URL, so its natural size IS the display size. That is what makes the cap
  // survive Outlook, which ignores `max-height` and would happily upscale a
  // width-forced `mj-image` back to 200px square.
  const logoImg = `<img src="${logoUrl}" alt="${orgName}" style="border:0;display:block;outline:none;text-decoration:none;height:auto;max-width:200px;" />`;
  const plateTd = logoOnPlate
    ? `bgcolor="#ffffff" style="background-color:#ffffff;border-radius:8px;padding:14px 20px;text-align:center;"`
    : `style="text-align:center;"`;
  const logoMjml = !logoUrl
    ? ""
    : `<mj-text align="center" padding="0">
            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;">
              <tr>
                <td ${plateTd}>${logoImg}</td>
              </tr>
            </table>
          </mj-text>`;

  const mjmlTemplate = `
<mjml>
  <mj-head>
    <mj-title>${subject}</mj-title>
    <mj-preview>${content.replace(/<[^>]*>/g, "").substring(0, 100).trim()}...</mj-preview>
    ${fonts.webFonts.map((f) => `<mj-font name="${f.name}" href="${f.href}" />`).join("\n    ")}
    <mj-attributes>
      <mj-all font-family="${fonts.body}" />
      <mj-text font-size="16px" color="#374151" line-height="1.6" />
    </mj-attributes>
    <mj-style>
      .outlook-group-fix { width:100% !important; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${bodyBg}">
    ${webViewBanner}

    <!-- Main Container -->
    <mj-wrapper padding="${wrapperPadding}" background-color="${bodyBg}">
      <!-- Header -->
      <mj-section background-color="${headerBandBg}" padding="${headerPadding}">
        <mj-column>
          ${
            logoUrl
              ? logoMjml
              : isBasic
                ? `<mj-text align="center" font-size="20px" font-weight="600" color="#1f2937" font-family="${fonts.heading}">${orgName}</mj-text>`
                : `<mj-text align="center" font-size="24px" font-weight="600" color="${style.headerTextColor}" font-family="${fonts.heading}">${orgName}</mj-text>`
          }
          ${
            processedHeaderText
              ? `<mj-text align="center" padding-top="10px" font-size="11px" color="${isBasic ? "#6b7280" : style.headerSubTextColor}" text-transform="uppercase" letter-spacing="2px">${processedHeaderText}</mj-text>`
              : ""
          }
          ${
            style.label
              ? `<mj-text align="center" padding-top="12px">
              <span style="display: inline-block; background-color: ${style.accentColor}; color: ${style.badgeTextColor}; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${style.icon} ${style.label}
              </span>
            </mj-text>`
              : ""
          }
        </mj-column>
      </mj-section>

      <!-- Body -->
      <mj-section background-color="#ffffff" padding="${isBasic ? "8px 0 0 0" : "32px 0 0 0"}">
        <mj-column>
          ${
            processedGreeting
              ? `<mj-text padding="${greetingPadding}" color="#374151" font-size="16px" line-height="1.6">${processedGreeting}</mj-text>`
              : ""
          }
        </mj-column>
      </mj-section>

      ${contentMjml}

      <!-- Footer -->
      <mj-section background-color="${isBasic ? "#ffffff" : "#f9fafb"}" padding="${footerPadding}"${isBasic ? "" : ' border-top="1px solid #e5e7eb"'}>
        <mj-column>
          <mj-text color="#374151" font-size="16px" padding-bottom="4px">${finalSalutation},</mj-text>
          <mj-text color="#1f2937" font-size="16px" font-weight="600">${orgName}</mj-text>
        </mj-column>
      </mj-section>

      ${boardMembersMjml}

      <!-- Bottom Footer -->
      <mj-section background-color="${isBasic ? "#f9fafb" : style.headerBg}" padding="${bottomPadding}">
        <mj-column>
          ${addressLine ? `<mj-text align="center" color="${isBasic ? "#6b7280" : style.footerTextColor}" font-size="12px">${addressLine}</mj-text>` : ""}
          ${organization.email ? `<mj-text align="center" color="${isBasic ? "#6b7280" : style.footerTextColor}" font-size="12px" padding-top="4px">${organization.email}</mj-text>` : ""}
          ${
            homepageUrl
              ? `<mj-text align="center" padding-top="6px" font-size="12px"><a href="${homepageUrl}" style="color: ${isBasic ? "#6b7280" : style.footerTextColor}; text-decoration: underline;">${homepageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></mj-text>`
              : ""
          }
          <mj-text align="center" color="#6b7280" font-size="11px" padding-top="8px">
            © ${new Date().getFullYear()} ${legalName}. All rights reserved.
          </mj-text>
        </mj-column>
      </mj-section>

      ${
        footerImageUrl
          ? `<mj-section padding="0">
        <mj-column>
          <mj-image src="${footerImageUrl}" alt="${orgName}" padding="0" fluid-on-mobile="true" />
        </mj-column>
      </mj-section>`
          : ""
      }
    </mj-wrapper>
  </mj-body>
</mjml>`;

  console.log(`[MJML] MJML template generated (${mjmlTemplate.length} chars)`);
  console.log(`[MJML] Template preview: "${mjmlTemplate.substring(0, 500)}..."`);

  // Compile MJML to HTML
  const { html, errors } = mjml2html(mjmlTemplate, {
    validationLevel: "soft",
    minify: false,
  }) as unknown as Awaited<ReturnType<typeof mjml2html>>;

  console.log(`[MJML] Compilation complete. HTML length: ${html.length}`);

  if (errors && errors.length > 0) {
    console.warn("[MJML] Compilation warnings:", JSON.stringify(errors, null, 2));
  }

  // Log a sample of the compiled HTML to verify content
  console.log(`[MJML] Compiled HTML preview: "${html.substring(0, 500)}..."`);

  // For preview, extract just the body content
  if (forPreview) {
    // Extract content between <body> tags and wrap in a styled div
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch?.[1];
    if (bodyContent !== undefined) {
      console.log(`[MJML] Preview mode: extracted body content (${bodyContent.length} chars)`);
      return `<div style="font-family: ${fonts.body};">${bodyContent}</div>`;
    } else {
      console.warn(`[MJML] Preview mode: could not extract body content, returning full HTML`);
    }
  }

  return html;
}

/**
 * Raw editor mode: the author supplies the full email body themselves.
 * If it looks like MJML, compile it to HTML; otherwise assume it's already a
 * complete/HTML document and pass it through untouched (board footer, greeting,
 * and the type chrome are intentionally NOT applied in raw mode).
 */
export function buildRawEmailHtml(content: string): string {
  if (/<mjml[\s>]/i.test(content)) {
    const { html, errors } = mjml2html(content, {
      validationLevel: "soft",
      minify: false,
    }) as unknown as Awaited<ReturnType<typeof mjml2html>>;
    if (errors && errors.length > 0) {
      console.warn("[MJML raw] compile warnings:", JSON.stringify(errors));
    }
    return html;
  }
  return content;
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
 * Web view template options
 */
interface WebViewTemplateOptions {
  organization: HoaOrganization & {
    settings?: BlockSetting | null;
  };
  subject: string;
  subtitle?: string;
  content: string;
  emailType: EmailType;
  greeting?: string;
  salutation?: string;
  boardMembers?: BoardMemberInfo[];
  directusUrl: string;
  urgent?: boolean;
  /** Custom line under the logo, e.g. "Official Communication of {name}". Supports {name}/{legal_name}. */
  headerText?: string | null;
  /** Building-photo file (id or object) shown full-width in the footer. */
  footerImage?: DirectusFile | string | null;
  /** Homepage link shown in the footer. */
  homepageUrl?: string | null;
}

/**
 * Build HTML for web view page matching SendGrid template style
 * Uses Avenir font family and matching layout
 */
export function buildWebViewHtml(options: WebViewTemplateOptions): string {
  const {
    organization,
    subject,
    subtitle,
    content,
    emailType,
    greeting,
    salutation,
    boardMembers,
    directusUrl,
    urgent,
    headerText,
    footerImage,
    homepageUrl,
  } = options;

  const orgName = organization.name || "Organization";
  const logoUrl = getLogoUrl(organization, directusUrl);
  const finalSalutation = salutation || defaultSalutations[emailType];
  const year = new Date().getFullYear();
  const processedHeaderText = processHeaderText(headerText, orgName, organization.legal_name);
  const footerImageUrl = getFileUrl(footerImage, directusUrl, "width=1200&format=jpg&fit=cover&quality=80");
  const homepageLabel = homepageUrl ? homepageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";

  // --- Theme ---------------------------------------------------------------
  // Unlike the email, this is a real browser page: the web font ALWAYS loads,
  // so an org's display face finally renders for everyone rather than only for
  // the half on Apple Mail.
  //
  // `WEB_VIEW_STACK` is the Avenir stack this page has always used, and it stays
  // exactly that for an org with no theme — the page is a deliberate imitation
  // of the 1033/SendGrid layout and an unthemed org must not drift off it.
  const settings = organization.settings as BlockSetting | null | undefined;
  const fonts = resolveEmailFonts(settings);
  const themed = fonts.webFonts.length > 0;
  const WEB_VIEW_STACK = "Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const bodyFamily = themed ? fonts.body : WEB_VIEW_STACK;
  const headingFamily = themed ? fonts.heading : WEB_VIEW_STACK;
  const fontLinks = fonts.webFonts
    .map((f) => `\n  <link rel="stylesheet" href="${f.href}">`)
    .join("");

  // The org's primary tints the subject and the rule under it. Everything else
  // stays the page's editorial grey, so the brand reads as an accent rather
  // than a repaint. `urgent` still wins outright — see the alert rule.
  //
  // Both are emitted as EMPTY strings when the org has no theme/palette, so an
  // unthemed org's page comes out byte-identical to before this was themed.
  const palette = Array.isArray(settings?.colors) ? settings?.colors[0] : null;
  const brand = normalizeHexColor(palette?.primary);
  const headingCss = themed ? `font-family:${headingFamily}; ` : "";
  const subjectColorCss = urgent ? "color: red; " : brand ? `color: ${brand}; ` : "";
  const ruleColor = brand ? `${brand}33` : "lightgrey";

  // Process content with styling for headings and paragraphs
  const processedContent = processHtmlForEmail(content, headingFamily);

  // Build board members HTML
  let boardMembersHtml = "";
  if (boardMembers && boardMembers.length > 0) {
    boardMembersHtml = boardMembers
      .map(
        (member) => `
        <div class="mj-column-per-50 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
            <tbody>
              <tr>
                <td align="left" class="avenir" style="font-size:0px;padding:0 10px;word-break:break-word;">
                  <div style="font-family:${bodyFamily};font-size:10px;line-height:1;text-align:left;color:#666666;">
                    <p style="letter-spacing: 0.25em; font-weight: 700; text-transform: uppercase; margin: 0; padding: 8px 0;">
                      ${member.name}
                      <span style="display:block;font-size: 7px; line-height: 12px;">${formatTitle(member.title)}</span>
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>`
      )
      .join("");
  }

  // Build the HTML matching SendGrid template style
  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${subject}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">${fontLinks}
  <style type="text/css">
    body { margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:${bodyFamily}; }
    table, td { border-collapse:collapse; }
    p { display:block;margin:13px 0; }
    .avenir { font-family:${bodyFamily}; }
    @media only screen and (min-width:480px) {
      .mj-column-per-100 { width:100% !important; max-width: 100%; }
      .mj-column-per-50 { width:50% !important; max-width: 50%; }
      .mj-column-per-40 { width:40% !important; max-width: 40%; }
    }
    @media only screen and (max-width:480px) {
      table.mj-full-width-mobile { width: 100% !important; }
      td.mj-full-width-mobile { width: auto !important; }
    }
  </style>
</head>
<body style="word-spacing:normal;background-color:#ffffff;">
  <div style="background-color:#ffffff;">
    <!-- Logo Section -->
    <div style="margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:0px;text-align:center;">
              <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                  <tbody>
                    <tr>
                      <td style="vertical-align:top;padding:0px;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:20px 30px 0px;word-break:break-word;">
                                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;">
                                  <tbody>
                                    <tr>
                                      <td>
                                        ${logoUrl
                                          ? `<img height="auto" src="${logoUrl}" style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;max-width:150px;margin-bottom:10px;" width="150">`
                                          : `<span style="display: inline-block; font-family:${themed ? headingFamily : bodyFamily}; text-decoration: none; color: #666666; letter-spacing: 0.15em; font-weight: 700; font-size: 16px; line-height:20px; text-transform: uppercase;">${orgName}</span>`
                                        }
                                        ${processedHeaderText
                                          ? `<div style="font-family:${bodyFamily}; text-align:center; color:#888888; letter-spacing:0.25em; font-weight:700; font-size:9px; line-height:14px; text-transform:uppercase; margin-top:6px;">${processedHeaderText}</div>`
                                          : ""
                                        }
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Subject Section -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;background-color:#ffffff;width:100%;">
      <tbody>
        <tr>
          <td>
            <div style="margin:0px auto;max-width:600px;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
                <tbody>
                  <tr>
                    <td style="direction:ltr;font-size:0px;padding:20px 0px 20px;text-align:center;">
                      <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" class="avenir" style="font-size:0px;padding:0 10px;word-break:break-word;">
                                <div style="font-family:${bodyFamily};font-size:13px;line-height:1;text-align:center;color:#666666;">
                                  <h3 style="${headingCss}font-weight: 700; line-height: 22px; font-size: 20px; text-transform: uppercase; ${subjectColorCss}margin: 0; padding: 0 0 10px 0;" class="avenir">${urgent ? `🚨 ${subject}` : subject}</h3>
                                  ${subtitle ? `<h5 style="${headingCss}font-weight: 700; line-height: 16px; font-size: 14px; text-transform: uppercase; margin: 0; padding: 0;" class="avenir">${subtitle}</h5>` : ""}
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Divider -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tbody>
        <tr>
          <td>
            <div style="margin:0px auto;max-width:600px;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
                <tbody>
                  <tr>
                    <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
                      <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:0px 10px;word-break:break-word;">
                                <p style="border-top:solid 1px ${ruleColor};font-size:1px;margin:0px auto;width:100%;"></p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Content Section -->
    <div style="margin:0px auto;max-width:600px;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
        <tbody>
          <tr>
            <td style="direction:ltr;font-size:0px;padding:20px 0 0px;text-align:center;">
              <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                  <tbody>
                    <tr>
                      <td align="left" class="avenir" style="font-size:0px;padding:0 10px;word-break:break-word;">
                        <div style="font-family:${bodyFamily};font-size:13px;line-height:1.6;text-align:left;color:#666666;">
                          ${processedContent}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Salutation Section -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tbody>
        <tr>
          <td>
            <div style="margin:0px auto;max-width:600px;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
                <tbody>
                  <tr>
                    <td style="direction:ltr;font-size:0px;padding:0px 0px 20px 0;text-align:left;">
                      <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="left" class="avenir" style="font-size:0px;padding:0 10px;word-break:break-word;">
                                <div style="font-family:${bodyFamily};font-size:13px;line-height:1;text-align:left;color:#666666;">
                                  <p style="font-weight: 400; line-height: 1.6em; margin: 0; padding: 0 0 10px 0;" class="avenir">${finalSalutation},</p>
                                  <p style="font-weight: 500; line-height: 1.6em; margin: 0; padding: 0;" class="avenir">${orgName} Team ☀️</p>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <!-- Board Members -->
                      ${boardMembersHtml}

                      <!-- Divider after board members -->
                      ${boardMembers && boardMembers.length > 0 ? `
                      <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:40px 10px 0px;word-break:break-word;">
                                <p style="border-top:solid 1px ${ruleColor};font-size:1px;margin:0px auto;width:100%;"></p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>` : ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Footer Section -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tbody>
        <tr>
          <td>
            <div style="margin:0px auto;max-width:600px;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
                <tbody>
                  <tr>
                    <td style="direction:ltr;font-size:0px;padding:20px 0px 20px 0px;text-align:center;">
                      <div class="mj-column-per-40 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:10px 25px;padding-top:0px;padding-bottom:10px;word-break:break-word;">
                                <div style="font-family:${bodyFamily};font-size:10px;line-height:1;text-align:center;text-transform:uppercase;color:#666666;">
                                  <span style="text-decoration: none; color: #666666; letter-spacing: 0.5em; font-weight: 700">${orgName}</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      ${organization.phone ? `
                      <div class="mj-column-per-40 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:10px 25px;padding-top:0px;padding-bottom:10px;word-break:break-word;">
                                <div style="font-family:${bodyFamily};font-size:10px;line-height:1;text-align:center;text-transform:uppercase;color:#666666;">
                                  <a href="tel:${organization.phone}" style="text-decoration: none; color: #666666; letter-spacing: 0.5em; font-weight: 700">${organization.phone}</a>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>` : ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Copyright Section -->
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tbody>
        <tr>
          <td>
            <div style="margin:0px auto;max-width:600px;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
                <tbody>
                  <tr>
                    <td style="direction:ltr;font-size:0px;padding:20px 0;padding-bottom:60px;padding-top:0px;text-align:center;">
                      <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                          <tbody>
                            <tr>
                              <td align="center" style="font-size:0px;padding:10px 25px;padding-top:15px;padding-bottom:0px;word-break:break-word;">
                                ${homepageUrl
                                  ? `<div style="font-family:${bodyFamily};font-size:9px;font-weight:700;letter-spacing:0.25em;line-height:1;text-align:center;text-transform:uppercase;color:#666666;padding-bottom:12px;"><a href="${homepageUrl}" style="color:#666666;text-decoration:none;">${homepageLabel}</a></div>`
                                  : ""
                                }
                                <div style="font-family:${bodyFamily};font-size:8px;font-weight:700;letter-spacing:0.3em;line-height:1;text-align:center;text-decoration:none;text-transform:uppercase;color:#666666;">
                                  © ${year} ${organization.legal_name || orgName}
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Footer building photo (full width) -->
    ${footerImageUrl
      ? `<div style="margin:0 auto;max-width:600px;">
      <img src="${footerImageUrl}" alt="${orgName}" width="600" style="border:0;display:block;outline:none;text-decoration:none;width:100%;height:auto;" />
    </div>`
      : ""
    }
  </div>
</body>
</html>`;
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
    if (match[1]) urls.push(match[1]);
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
