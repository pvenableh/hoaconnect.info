import { readItem, readItems } from "@directus/sdk";
import { buildWebViewHtml, type EmailType } from "../../../utils/email-templates-mjml";
import { resolveEmailClass, defaultEmailClass } from "#core/shared/email/email-class";
import { orgMailingAddress, recipientCompliance } from "#core/shared/email/unsubscribe";
import { emailComplianceSchema } from "../../../utils/email-compliance";
import type { HoaBoardMember, HoaMember, HoaOrganization, BlockSetting, HoaEmail } from "#core/types/directus";

/** No script, opaque origin; links may open a tab or navigate on a click. */
const EMAIL_VIEW_CSP =
  "sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";

/**
 * Public endpoint to view an email in a web browser
 * Returns the email HTML with generic (non-personalized) content
 *
 * A SENT email can be viewed publicly via its ID. A draft (the "View in
 * Browser" link in a test send) takes the people who can send in the
 * community's name: an admin, or a manager with the communications grant.
 *
 * The HTML is the community's own, unsanitised (raw HTML in MJML mode), served
 * on the app's origin. It answers with a CSP sandbox, as preview-mjml does: no
 * script, and an opaque origin, so a message can't act as whoever opens it.
 * Popups and click-through navigation stay allowed so the email's links work.
 * Until 2026-11-12 drafts were public and nothing was sandboxed.
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
    // The class, once the field exists; before then, the type's default.
    const schema = await emailComplianceSchema(directus).catch(() => ({ members: false, emailClass: false }));

    // Fetch the email record
    const email = await directus.request(
      readItem("hoa_emails", id, {
        fields: [
          ...(schema.emailClass ? (["email_class"] as const) : []),
          "id",
          "subject",
          "subtitle",
          "content",
          "email_type",
          "greeting",
          "salutation",
          "include_board_footer",
          "urgent",
          "status",
          "sent_at",
          "header_text",
          "footer_image",
          {
            organization: [
              "id",
              "name",
              "legal_name",
              "email",
              "phone",
              "slug",
              "external_url",
              "street_address",
              "city",
              "state",
              "zip",
              {
                settings: ["id", "logo", "title", "description", "header_text", "homepage_url", "footer_image", "colors", "theme"],
              },
            ],
          },
        ],
      })
    ) as unknown as HoaEmail & { organization: HoaOrganization & { settings: BlockSetting | null } };

    if (!email) {
      throw createError({
        statusCode: 404,
        message: "Email not found",
      });
    }

    // Sent emails are public; drafts (test email "View in Browser" links) are not.
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

    if (email.status === "draft") {
      const draftOrgId = typeof organization === "string" ? organization : organization.id;
      await requireAdminOrManagerGrant(event, draftOrgId, "communications");
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

    // Resolve branding (custom header line, footer photo, homepage link),
    // honoring per-send overrides over the org defaults.
    const branding = resolveEmailBranding(organization, email, {
      appUrl: config.public.appUrl as string,
    });

    // Build the HTML with SendGrid-matching style for web view
    const html = buildWebViewHtml({
      organization,
      subject: email.subject,
      subtitle: email.subtitle || undefined,
      content: email.content,
      emailType: email.email_type as EmailType,
      greeting: email.greeting || undefined,
      salutation: email.salutation || undefined,
      boardMembers: email.include_board_footer ? boardMembers : undefined,
      directusUrl: config.directus.url,
      urgent: email.urgent || false,
      headerText: branding.headerText,
      footerImage: branding.footerImage,
      homepageUrl: branding.homepageUrl,
      // The class footer, as the mail carried it, minus the personal
      // unsubscribe link: a web view is shared by URL and has no member.
      complianceFooter: recipientCompliance({
        emailClass: (() => {
          const r = resolveEmailClass(email.email_type, (email as any).email_class);
          return r.ok ? r.emailClass : defaultEmailClass(email.email_type);
        })(),
        org: email.organization,
        mailingAddress: orgMailingAddress(email.organization),
        appUrl: config.public.appUrl as string,
        token: null,
      }).footer,
    });

    // Return the full HTML page, sandboxed (see the header comment).
    setHeader(event, "Content-Type", "text/html; charset=utf-8");
    setHeader(event, "Content-Security-Policy", EMAIL_VIEW_CSP);
    if (email.status === "draft") setHeader(event, "Cache-Control", "private, no-store");
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
