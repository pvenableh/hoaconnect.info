import { readItem, readItems } from "@directus/sdk";
import { sendOrganizationEmail, type EmailAttachment, type EmailTemplateData } from "../../utils/sendgrid";
import { buildEmailHtml, buildEmailText, processHtmlForEmail, type EmailType } from "../../utils/email-templates-mjml";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting } from "~~/types/directus";

interface CidImage {
  cid: string;
  content: string; // base64
  type: string;
  filename: string;
}

/**
 * Extract images from content and prepare them as CID attachments
 * CID (Content-ID) embedding works better in Outlook than base64 data URIs
 */
async function extractImagesAsCid(
  content: string,
  directusUrl: string,
  staticToken: string
): Promise<{ processedContent: string; cidImages: CidImage[] }> {
  const imgRegex = /<img([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi;
  let processedContent = content;
  const cidImages: CidImage[] = [];
  const matches = [...content.matchAll(imgRegex)];

  console.log(`[test.post] Processing ${matches.length} image(s) in content`);

  for (const match of matches) {
    const [fullMatch, beforeSrc, src, afterSrc] = match;
    const isSelfClosing = fullMatch.endsWith('/>');

    // Check if this is a Directus asset URL
    if (src.includes(directusUrl) || src.includes('/assets/')) {
      try {
        // Extract asset ID from URL
        const assetMatch = src.match(/\/assets\/([a-f0-9-]+)/i);
        if (!assetMatch) {
          console.log(`[test.post] Could not extract asset ID from: ${src}`);
          continue;
        }

        const assetId = assetMatch[1];
        const assetUrl = `${directusUrl}/assets/${assetId}`;

        console.log(`[test.post] Downloading image: ${assetId}`);

        // Download the image
        const response = await fetch(assetUrl, {
          headers: {
            Authorization: `Bearer ${staticToken}`,
          },
        });

        if (!response.ok) {
          console.error(`[test.post] Failed to download image ${assetId}: ${response.status}`);
          continue;
        }

        // Get content type and determine extension
        const contentType = response.headers.get('content-type') || 'image/png';
        const ext = contentType.split('/')[1] || 'png';

        // Convert to base64
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Generate unique CID
        const cid = `image-${assetId}@hoamail`;
        const filename = `image-${assetId}.${ext}`;

        cidImages.push({
          cid,
          content: base64,
          type: contentType,
          filename,
        });

        console.log(`[test.post] Prepared CID image: ${cid} (${contentType})`);

        // Replace the src with cid: reference
        const cleanAfterSrc = afterSrc.replace(/\s*\/\s*$/, '');
        const newImgTag = isSelfClosing
          ? `<img${beforeSrc}src="cid:${cid}"${cleanAfterSrc} />`
          : `<img${beforeSrc}src="cid:${cid}"${cleanAfterSrc}>`;
        processedContent = processedContent.replace(fullMatch, newImgTag);
      } catch (error) {
        console.error(`[test.post] Error processing image:`, error);
      }
    }
  }

  return { processedContent, cidImages };
}

interface TestEmailBody {
  organizationId: string;
  testEmails: string[]; // Array of email addresses to send test to
  subject: string;
  subtitle?: string;
  content: string;
  emailType: EmailType;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  urgent?: boolean;
}

interface TestEmailResult {
  email: string;
  success: boolean;
  messageId?: string | null;
  error?: string;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<TestEmailBody>(event);

  const { organizationId, testEmails, subject, subtitle, content, emailType, greeting, salutation, includeBoardFooter = true, urgent } = body;

  // Validation
  if (!organizationId || !testEmails || !testEmails.length || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, testEmails, subject, content, emailType",
    });
  }

  // Limit to 5 test emails to prevent abuse
  if (testEmails.length > 5) {
    throw createError({
      statusCode: 400,
      message: "Maximum 5 test email addresses allowed",
    });
  }

  // Basic email validation for all addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = testEmails.filter(email => !emailRegex.test(email));
  if (invalidEmails.length > 0) {
    throw createError({
      statusCode: 400,
      message: `Invalid email address format: ${invalidEmails.join(", ")}`,
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Get organization with settings
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["id", "name", "legal_name", "type", "email", "phone", "street_address", "city", "state", "zip", "custom_domain", {
          settings: ["id", "logo", "title", "description"],
        }],
      })
    ) as HoaOrganization & { settings: BlockSetting | null };

    if (!organization) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    // Get board members if needed
    let boardMembers: Array<{ name: string; title: string; icon?: string }> = [];
    if (includeBoardFooter) {
      const boardMemberRecords = await directus.request(
        readItems("hoa_board_members", {
          filter: {
            hoa_member: {
              organization: { _eq: organizationId },
              status: { _eq: "active" },
            },
            status: { _eq: "published" },
          },
          fields: ["id", "title", "icon", {
            hoa_member: ["id", "first_name", "last_name"],
          }],
          sort: ["sort"],
        })
      ) as Array<HoaBoardMember & { hoa_member: HoaMember }>;

      boardMembers = boardMemberRecords
        .filter((bm) => bm.hoa_member)
        .map((bm) => ({
          name: `${bm.hoa_member.first_name || ""} ${bm.hoa_member.last_name || ""}`.trim() || "Board Member",
          title: bm.title || "Board Member",
          icon: bm.icon || '',
        }));
    }

    // Process content to extract images as CID attachments
    const { processedContent, cidImages } = await extractImagesAsCid(
      content,
      config.directus.url,
      config.directus.staticToken
    );

    // Convert CID images to email attachments with inline disposition
    const inlineAttachments: EmailAttachment[] = cidImages.map((img) => ({
      content: img.content,
      filename: img.filename,
      type: img.type,
      disposition: "inline" as const,
      contentId: img.cid,
    }));

    // Check if we should use dynamic templates
    const templateId = config.sendgridEmailTemplateId;
    const useDynamicTemplate = !!templateId;
    console.log(`[test.post] Using dynamic template: ${useDynamicTemplate} (templateId: ${templateId || 'none'})`);

    // Build org logo URL if available
    let orgLogoUrl: string | undefined;
    if (organization.settings?.logo) {
      orgLogoUrl = `${config.directus.url}/assets/${organization.settings.logo}`;
    }

    // Build org address string
    const orgAddress = [
      organization.street_address,
      organization.city,
      organization.state,
      organization.zip,
    ].filter(Boolean).join(', ');

    // Build org website URL
    const orgUrl = organization.custom_domain
      ? `https://${organization.custom_domain}`
      : `${config.public.appUrl}`;

    // Process the HTML content for email (inline styles, etc.)
    const processedHtmlContent = processHtmlForEmail(processedContent);

    // Build personalized greeting for test
    let personalizedContent = processedHtmlContent;
    if (greeting) {
      personalizedContent = `<p>${greeting} Test Recipient,</p>${processedHtmlContent}`;
    }
    if (salutation) {
      personalizedContent = `${personalizedContent}<p>${salutation}</p>`;
    }

    // Build the email with test recipient name
    console.log(`[test.post] Building email HTML with content (${processedContent.length} chars): "${processedContent.substring(0, 200)}..."`);

    const text = buildEmailText({
      organization,
      subject: `[TEST] ${subject}`,
      content: processedContent,
      emailType,
      greeting,
      salutation,
      boardMembers: includeBoardFooter ? boardMembers : undefined,
      recipientFirstName: "Test Recipient",
      directusUrl: config.directus.url,
    });

    console.log(`[test.post] Sending test email to: ${testEmails.join(", ")}`);
    console.log(`[test.post] Text length: ${text.length}`);
    console.log(`[test.post] Text version preview: "${text.substring(0, 300)}..."`);
    console.log(`[test.post] Inline attachments: ${inlineAttachments.length}`);

    // Send test email to each address
    const results: TestEmailResult[] = [];

    for (const testEmail of testEmails) {
      try {
        let sendResult;

        if (useDynamicTemplate) {
          // Use SendGrid dynamic template
          const templateData: EmailTemplateData = {
            // Recipient info
            first_name: 'Test Recipient',
            unit: '101', // Test unit number

            // Email content
            subject: `[TEST] ${subject}`,
            subtitle: subtitle || '',
            content: personalizedContent,
            salutation: salutation || undefined,
            urgent: urgent || false,
            category: emailType, // For preview text

            // Organization info
            org_name: organization.name || 'Your HOA',
            org_legal_name: organization.legal_name || '',
            org_type: organization.type || '',
            org_logo_url: orgLogoUrl || '',
            org_url: orgUrl,
            org_address: orgAddress || undefined,
            org_email: organization.email || undefined,
            org_phone_number: organization.phone || '',

            // Board members
            board_members: includeBoardFooter && boardMembers.length > 0 ? boardMembers : [],

            // Links
            Weblink: `${config.public.appUrl}/email/test-view`,

            // Meta
            year: new Date().getFullYear().toString(),
          };

          console.log(`[test.post] Using dynamic template with data:`, JSON.stringify(templateData, null, 2));

          sendResult = await sendOrganizationEmail({
            to: testEmail,
            toName: "Test Recipient",
            subject: `[TEST] ${subject}`,
            html: personalizedContent, // Fallback if template fails
            text,
            fromName: organization.name || undefined,
            attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
            templateId,
            templateData,
          });
        } else {
          // Fall back to MJML-generated HTML
          const html = buildEmailHtml({
            organization,
            subject: `[TEST] ${subject}`,
            content: processedContent,
            emailType,
            greeting,
            salutation,
            boardMembers: includeBoardFooter ? boardMembers : undefined,
            recipientFirstName: "Test Recipient",
            directusUrl: config.directus.url,
            appUrl: config.public.appUrl as string,
          });

          console.log(`[test.post] HTML built successfully (${html.length} chars)`);
          console.log(`[test.post] HTML sample (first 500 chars): "${html.substring(0, 500)}"`);

          sendResult = await sendOrganizationEmail({
            to: testEmail,
            toName: "Test Recipient",
            subject: `[TEST] ${subject}`,
            html,
            text,
            fromName: organization.name || undefined,
            attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
          });
        }

        console.log(`[test.post] Test email sent successfully to ${testEmail}`);
        results.push({
          email: testEmail,
          success: true,
          messageId: sendResult.messageId,
        });
      } catch (sendError: any) {
        console.error(`[test.post] Failed to send test email to ${testEmail}:`, sendError);
        results.push({
          email: testEmail,
          success: false,
          error: sendError.message || "Failed to send",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return {
      success: successCount > 0,
      message: failedCount === 0
        ? `Test email sent to ${successCount} address${successCount > 1 ? "es" : ""}`
        : `Sent to ${successCount}, failed for ${failedCount} address${failedCount > 1 ? "es" : ""}`,
      results,
      details: {
        htmlLength: html.length,
        textLength: text.length,
        imagesProcessed: cidImages.length,
        boardMembersIncluded: boardMembers.length,
        totalSent: successCount,
        totalFailed: failedCount,
      },
    };
  } catch (error: any) {
    console.error("Test email send error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to send test email",
    });
  }
});
