import { readItem, readItems, readFiles, createItem, updateItem } from "@directus/sdk";
import { sendOrganizationEmail, type EmailAttachment } from "../../utils/sendgrid";
import { buildEmailHtml, buildEmailText, type EmailType } from "../../utils/email-templates-mjml";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, DirectusFile } from "~~/types/directus";

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

  console.log(`[extractImagesAsCid] Processing ${matches.length} image(s) in content`);

  for (const match of matches) {
    const [fullMatch, beforeSrc, src, afterSrc] = match;
    const isSelfClosing = fullMatch.endsWith('/>');

    // Check if this is a Directus asset URL
    if (src.includes(directusUrl) || src.includes('/assets/')) {
      try {
        // Extract asset ID from URL
        const assetMatch = src.match(/\/assets\/([a-f0-9-]+)/i);
        if (!assetMatch) {
          console.log(`[extractImagesAsCid] Could not extract asset ID from: ${src}`);
          continue;
        }

        const assetId = assetMatch[1];
        const assetUrl = `${directusUrl}/assets/${assetId}`;

        console.log(`[extractImagesAsCid] Downloading image: ${assetId}`);

        // Download the image
        const response = await fetch(assetUrl, {
          headers: {
            Authorization: `Bearer ${staticToken}`,
          },
        });

        if (!response.ok) {
          console.error(`[extractImagesAsCid] Failed to download image ${assetId}: ${response.status}`);
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

        console.log(`[extractImagesAsCid] Prepared CID image: ${cid} (${contentType})`);

        // Replace the src with cid: reference
        const cleanAfterSrc = afterSrc.replace(/\s*\/\s*$/, '');
        const newImgTag = isSelfClosing
          ? `<img${beforeSrc}src="cid:${cid}"${cleanAfterSrc} />`
          : `<img${beforeSrc}src="cid:${cid}"${cleanAfterSrc}>`;
        processedContent = processedContent.replace(fullMatch, newImgTag);
      } catch (error) {
        console.error(`[extractImagesAsCid] Error processing image:`, error);
      }
    }
  }

  return { processedContent, cidImages };
}

interface SendEmailBody {
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  recipientIds: string[];
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  emailId?: string; // If updating existing draft
  attachmentIds?: string[]; // File IDs from Directus to attach
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<SendEmailBody>(event);

  const { organizationId, subject, content, emailType, recipientIds, greeting, salutation, includeBoardFooter = true, emailId, attachmentIds } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType || !recipientIds?.length) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType, recipientIds",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Get organization with settings
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["id", "name", "email", "street_address", "city", "state", "zip", {
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
    let boardMembers: Array<{ name: string; title: string }> = [];
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
          fields: ["id", "title", {
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
        }));
    }

    // Get recipients (members)
    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          id: { _in: recipientIds },
          organization: { _eq: organizationId },
          status: { _eq: "active" },
        },
        fields: ["id", "first_name", "last_name", "email"],
      })
    ) as HoaMember[];

    if (!members.length) {
      throw createError({
        statusCode: 400,
        message: "No valid recipients found",
      });
    }

    // Process attachments if provided
    let emailAttachments: EmailAttachment[] = [];
    if (attachmentIds && attachmentIds.length > 0) {
      // Fetch file metadata from Directus (use readFiles for core collection)
      const files = await directus.request(
        readFiles({
          filter: {
            id: { _in: attachmentIds },
          },
          fields: ["id", "filename_download", "type", "title"],
        })
      ) as DirectusFile[];

      // Download each file and convert to base64
      for (const file of files) {
        try {
          const fileUrl = `${config.directus.url}/assets/${file.id}`;
          const response = await fetch(fileUrl, {
            headers: {
              Authorization: `Bearer ${config.directus.staticToken}`,
            },
          });

          if (!response.ok) {
            console.error(`Failed to download attachment ${file.id}: ${response.status}`);
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const base64Content = Buffer.from(arrayBuffer).toString("base64");

          emailAttachments.push({
            content: base64Content,
            filename: file.filename_download || file.title || "attachment",
            type: file.type || "application/octet-stream",
            disposition: "attachment",
          });
        } catch (attachError) {
          console.error(`Error processing attachment ${file.id}:`, attachError);
        }
      }
    }

    // Format attachments for M2M relationship
    const attachmentsData = attachmentIds && attachmentIds.length > 0
      ? attachmentIds.map(fileId => ({ directus_files_id: fileId }))
      : [];

    // Create or update email record
    let email;
    if (emailId) {
      email = await directus.request(
        updateItem("hoa_emails", emailId, {
          subject,
          content,
          email_type: emailType,
          greeting: greeting || null,
          salutation: salutation || null,
          include_board_footer: includeBoardFooter,
          status: "sending",
          recipient_count: members.length,
          attachments: attachmentsData,
        })
      );
    } else {
      email = await directus.request(
        createItem("hoa_emails", {
          organization: organizationId,
          subject,
          content,
          email_type: emailType,
          greeting: greeting || null,
          salutation: salutation || null,
          include_board_footer: includeBoardFooter,
          status: "sending",
          recipient_count: members.length,
          attachments: attachmentsData,
        })
      );
    }

    // Process content to extract images as CID attachments (works better in Outlook)
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

    // Log content for debugging
    console.log(`[send.post] Original content length: ${content.length}, Processed content length: ${processedContent.length}`);
    console.log(`[send.post] CID images extracted: ${cidImages.length}`);
    console.log(`[send.post] Content preview: ${content.substring(0, 200)}...`);

    // Send emails to each recipient
    let deliveredCount = 0;
    let failedCount = 0;
    const recipientResults: Array<{
      memberId: string;
      email: string;
      status: "sent" | "failed";
      error?: string;
    }> = [];

    for (const member of members) {
      if (!member.email) {
        failedCount++;
        recipientResults.push({
          memberId: member.id,
          email: "",
          status: "failed",
          error: "No email address",
        });
        continue;
      }

      const recipientName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
      const recipientFirstName = member.first_name || undefined;

      // Build personalized email using processed content with embedded images
      const html = buildEmailHtml({
        organization,
        subject,
        content: processedContent,
        emailType,
        greeting,
        salutation,
        boardMembers: includeBoardFooter ? boardMembers : undefined,
        recipientFirstName,
        directusUrl: config.directus.url,
        emailId: (email as any).id,
        appUrl: config.public.appUrl as string,
      });

      // Log HTML for first recipient only (for debugging)
      if (deliveredCount === 0 && failedCount === 0) {
        console.log(`[send.post] Built HTML length: ${html.length}`);
        console.log(`[send.post] HTML contains DOCTYPE: ${html.includes('<!DOCTYPE')}`);
        console.log(`[send.post] HTML body preview: ${html.substring(0, 500)}...`);
      }

      const text = buildEmailText({
        organization,
        subject,
        content: processedContent,
        emailType,
        greeting,
        salutation,
        boardMembers: includeBoardFooter ? boardMembers : undefined,
        recipientFirstName,
        directusUrl: config.directus.url,
      });

      try {
        // Combine regular attachments with inline CID images
        const allAttachments = [...emailAttachments, ...inlineAttachments];

        const sendResult = await sendOrganizationEmail({
          to: member.email,
          toName: recipientName || undefined,
          subject,
          html,
          text,
          fromName: organization.name || undefined,
          attachments: allAttachments.length > 0 ? allAttachments : undefined,
        });

        deliveredCount++;
        recipientResults.push({
          memberId: member.id,
          email: member.email,
          status: "sent",
        });

        // Create recipient record with SendGrid message ID for tracking
        await directus.request(
          createItem("hoa_email_recipients", {
            email: email.id,
            member: member.id,
            recipient_email: member.email,
            recipient_name: recipientName || null,
            status: "sent",
            sent_at: new Date().toISOString(),
            sg_message_id: sendResult.messageId || null,
          })
        );
      } catch (sendError: any) {
        failedCount++;
        recipientResults.push({
          memberId: member.id,
          email: member.email,
          status: "failed",
          error: sendError.message || "Failed to send",
        });

        // Create failed recipient record
        await directus.request(
          createItem("hoa_email_recipients", {
            email: email.id,
            member: member.id,
            recipient_email: member.email,
            recipient_name: recipientName || null,
            status: "failed",
            error_message: sendError.message || "Failed to send",
          })
        );
      }
    }

    // Update email with final counts and status
    await directus.request(
      updateItem("hoa_emails", email.id, {
        status: failedCount === members.length ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        delivered_count: deliveredCount,
        failed_count: failedCount,
      })
    );

    return {
      success: true,
      emailId: email.id,
      stats: {
        total: members.length,
        delivered: deliveredCount,
        failed: failedCount,
      },
      recipients: recipientResults,
    };
  } catch (error: any) {
    console.error("Email send error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to send emails",
    });
  }
});
