import { readItem, readItems } from "@directus/sdk";
import { buildEmailHtml, type EmailType } from "../../../utils/email-templates-mjml";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, HoaEmail } from "~~/types/directus";

/**
 * Public endpoint to view an email in a web browser
 * Returns the email HTML with generic (non-personalized) content
 *
 * No authentication required - emails can be viewed publicly via their ID
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Email ID is required",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Fetch the email record
    const email = await directus.request(
      readItem("hoa_emails", id, {
        fields: [
          "id",
          "subject",
          "content",
          "email_type",
          "greeting",
          "salutation",
          "include_board_footer",
          "status",
          "sent_at",
          {
            organization: [
              "id",
              "name",
              "email",
              "street_address",
              "city",
              "state",
              "zip",
              {
                settings: ["id", "logo", "title", "description"],
              },
            ],
          },
        ],
      })
    ) as HoaEmail & { organization: HoaOrganization & { settings: BlockSetting | null } };

    if (!email) {
      throw createError({
        statusCode: 404,
        message: "Email not found",
      });
    }

    // Allow viewing sent emails and drafts (for test email "View in Browser" links)
    if (email.status !== "sent" && email.status !== "draft") {
      throw createError({
        statusCode: 403,
        message: "This email is not available for viewing",
      });
    }

    const organization = email.organization;
    if (!organization) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    // Get board members if included in footer
    let boardMembers: Array<{ name: string; title: string }> = [];
    if (email.include_board_footer) {
      const orgId = typeof organization === "string" ? organization : organization.id;
      const boardMemberRecords = await directus.request(
        readItems("hoa_board_members", {
          filter: {
            hoa_member: {
              organization: { _eq: orgId },
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

    // Build the HTML with generic placeholders (no personalization)
    // The greeting will use the organization name instead of a recipient name
    const html = buildEmailHtml({
      organization,
      subject: email.subject,
      content: email.content,
      emailType: email.email_type as EmailType,
      greeting: email.greeting || undefined,
      salutation: email.salutation || undefined,
      boardMembers: email.include_board_footer ? boardMembers : undefined,
      recipientFirstName: undefined, // Use generic placeholder
      directusUrl: config.directus.url,
      // Don't include web view link on the web view page itself
      emailId: undefined,
      appUrl: undefined,
    });

    // Return the full HTML page
    setHeader(event, "Content-Type", "text/html; charset=utf-8");
    return html;
  } catch (error: any) {
    console.error("Email view error:", error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: error.message || "Failed to load email",
    });
  }
});
