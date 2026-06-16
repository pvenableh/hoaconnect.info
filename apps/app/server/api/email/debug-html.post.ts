import { readItem, readItems } from "@directus/sdk";
import { buildEmailHtml, type EmailType } from "../../utils/email-templates-mjml";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting } from "~~/types/directus";

interface DebugEmailBody {
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
}

/**
 * Debug endpoint to view raw email HTML
 * Returns the compiled HTML directly so it can be viewed in browser
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<DebugEmailBody>(event);

  const {
    organizationId,
    subject,
    content,
    emailType,
    greeting,
    salutation,
    includeBoardFooter = true,
  } = body;

  if (!organizationId || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

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

    // Build full email HTML (not preview mode)
    const html = buildEmailHtml({
      organization,
      subject,
      content,
      emailType,
      greeting,
      salutation,
      boardMembers: includeBoardFooter ? boardMembers : undefined,
      recipientFirstName: "Test Recipient",
      directusUrl: config.directus.url,
      appUrl: config.public.appUrl as string,
      forPreview: false, // Get full HTML document
    });

    // Return raw HTML with proper content type
    setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
    return html;
  } catch (error: any) {
    console.error("Debug HTML error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to generate debug HTML",
    });
  }
});
