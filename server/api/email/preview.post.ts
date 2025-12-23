import { readItem, readItems } from "@directus/sdk";
import { buildEmailHtml, type EmailType } from "../../utils/email-templates";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, DirectusFile } from "~~/types/directus";

interface PreviewEmailBody {
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  attachmentIds?: string[];
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<PreviewEmailBody>(event);

  const {
    organizationId,
    subject,
    content,
    emailType,
    greeting,
    salutation,
    includeBoardFooter = true,
    attachmentIds,
  } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType",
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

    // Build preview HTML - no recipientFirstName means it will use org name fallback in greeting
    // Use forPreview: true to get renderable HTML without full document wrapper
    const html = buildEmailHtml({
      organization,
      subject,
      content,
      emailType,
      greeting,
      salutation,
      boardMembers: includeBoardFooter ? boardMembers : undefined,
      directusUrl: config.directus.url,
      forPreview: true,
    });

    // Fetch attachment info if provided
    let attachments: Array<{ id: string; filename: string; type: string; size: number }> = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const files = await directus.request(
        readItems("directus_files", {
          filter: {
            id: { _in: attachmentIds },
          },
          fields: ["id", "filename_download", "type", "filesize", "title"],
        })
      ) as DirectusFile[];

      attachments = files.map((file) => ({
        id: file.id,
        filename: file.filename_download || file.title || "attachment",
        type: file.type || "application/octet-stream",
        size: file.filesize || 0,
      }));
    }

    return {
      success: true,
      html,
      organization: {
        id: organization.id,
        name: organization.name,
      },
      boardMemberCount: boardMembers.length,
      attachments,
    };
  } catch (error: any) {
    console.error("Email preview error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to generate preview",
    });
  }
});
