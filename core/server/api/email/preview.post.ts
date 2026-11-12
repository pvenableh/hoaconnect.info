import { readItem, readItems, readFiles } from "@directus/sdk";
import { appendComplianceFooterHtml, buildEmailHtml, buildRawEmailHtml, type EmailType } from "../../utils/email-templates-mjml";
import { defaultEmailClass } from "#core/shared/email/email-class";
import { checkSendCompliance, orgMailingAddress, recipientCompliance } from "#core/shared/email/unsubscribe";
import { SAMPLE_MERGE_VALUES, applyMergeFields } from "../../utils/email-merge";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, DirectusFile } from "#core/types/directus";
import { assertFilesInOrg } from "#core/server/utils/org-files";

interface PreviewEmailBody {
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: "visual" | "mjml";
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  attachmentIds?: string[];
  headerText?: string | null;
  footerImageId?: string | null;
  /** essential | community — the footer shown is the class's. */
  emailClass?: string;
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<PreviewEmailBody>(event);
  // Org-gated like save and send: the preview renders this org's branding and
  // board roster.
  if (body?.organizationId) {
    await requireAdminOrManagerGrant(event, body.organizationId, "communications");
  }

  const {
    organizationId,
    subject,
    content,
    emailType,
    contentMode = "visual",
    greeting,
    salutation,
    includeBoardFooter = true,
    attachmentIds,
    headerText,
    footerImageId,
    emailClass: requestedClass,
  } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType",
    });
  }

  // The preview describes each attachment (name, type, size) and shows the
  // footer photo: both must be this community's files (org-files.ts). Until
  // 2026-11-12 it described any file named. The body's images are not read
  // here — the browser loads them as the public policy allows.
  await assertFilesInOrg(organizationId, attachmentIds);
  await assertFilesInOrg(organizationId, [footerImageId], { allowPublicImages: true });

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Get organization with settings
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["id", "name", "legal_name", "email", "phone", "slug", "external_url", "street_address", "city", "state", "zip", {
          settings: ["id", { logo: ["id", "width", "height"] }, "title", "description", "header_text", "homepage_url", "footer_image", "colors", "theme"],
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
    console.log(`[preview.post] Building preview with content (${content.length} chars): "${content.substring(0, 200)}..."`);
    console.log(`[preview.post] Email type: ${emailType}`);

    // Raw MJML/HTML mode: render the author's content directly. Visual mode:
    // wrap the Tiptap content in the typed MJML chrome as before.
    // Merge tokens are substituted with sample values so the preview is realistic.
    const branding = resolveEmailBranding(organization, null, {
      appUrl: config.public.appUrl as string,
      overrides: { headerText: headerText ?? null, footerImage: footerImageId ?? null },
    });

    // The preview shows the class footer the send will carry, and says now —
    // not at Send — when the send would be refused. A refused class (a
    // newsletter marked essential) previews as the type's default.
    const compliance = checkSendCompliance({ emailType, requestedClass, org: organization });
    const previewClass = compliance.ok === false ? defaultEmailClass(emailType) : compliance.emailClass;
    const rc = recipientCompliance({
      emailClass: previewClass,
      org: organization,
      mailingAddress: orgMailingAddress(organization),
      appUrl: config.public.appUrl as string,
      token: null,
    });

    const html =
      contentMode === "mjml"
        ? appendComplianceFooterHtml(buildRawEmailHtml(applyMergeFields(content, SAMPLE_MERGE_VALUES(organization))), rc.footer)
        : buildEmailHtml({
            organization,
            subject,
            content,
            emailType,
            greeting,
            salutation,
            boardMembers: includeBoardFooter ? boardMembers : undefined,
            directusUrl: config.directus.url,
            forPreview: true,
            headerText: branding.headerText,
            footerImage: branding.footerImage,
            homepageUrl: branding.homepageUrl,
            complianceFooter: rc.footer,
          });

    console.log(`[preview.post] Preview HTML generated (${html.length} chars)`);
    console.log(`[preview.post] HTML preview: "${html.substring(0, 500)}..."`);

    // Check if HTML looks valid
    if (html.length < 100) {
      console.warn(`[preview.post] WARNING: Generated HTML seems too short (${html.length} chars)`);
    }

    // Fetch attachment info if provided (use readFiles for core collection)
    let attachments: Array<{ id: string; filename: string; type: string; size: number }> = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const files = await directus.request(
        readFiles({
          filter: {
            id: { _in: attachmentIds },
          },
          fields: ["id", "filename_download", "type", "filesize", "title"],
        })
      ) as unknown as DirectusFile[];

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
      emailClass: previewClass,
      compliance:
        compliance.ok === false
          ? { ok: false as const, code: compliance.code, message: compliance.message }
          : { ok: true as const },
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
