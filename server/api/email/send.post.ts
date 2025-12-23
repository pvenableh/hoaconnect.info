import { readItem, readItems, createItem, updateItem } from "@directus/sdk";
import { sendOrganizationEmail, type EmailAttachment } from "../../utils/sendgrid";
import { buildEmailHtml, buildEmailText, type EmailType } from "../../utils/email-templates";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, DirectusFile } from "~~/types/directus";

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
      // Fetch file metadata from Directus
      const files = await directus.request(
        readItems("directus_files", {
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
              Authorization: `Bearer ${config.directus.token}`,
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
        })
      );
    }

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

      // Build personalized email
      const html = buildEmailHtml({
        organization,
        subject,
        content,
        emailType,
        greeting,
        salutation,
        boardMembers: includeBoardFooter ? boardMembers : undefined,
        recipientFirstName,
        directusUrl: config.directus.url,
      });

      const text = buildEmailText({
        organization,
        subject,
        content,
        emailType,
        greeting,
        salutation,
        boardMembers: includeBoardFooter ? boardMembers : undefined,
        recipientFirstName,
        directusUrl: config.directus.url,
      });

      try {
        const sendResult = await sendOrganizationEmail({
          to: member.email,
          toName: recipientName || undefined,
          subject,
          html,
          text,
          fromName: organization.name || undefined,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
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
