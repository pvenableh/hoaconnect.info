import { readItem } from "@directus/sdk";
import { buildEmailHtml, type EmailType } from "../../utils/email-templates-mjml";
import { resolveEmailBranding } from "../../utils/email-branding";
import type { HoaOrganization, BlockSetting } from "#core/types/directus";

/**
 * Render a sample email for the branding settings page — the org's real
 * defaults (logo, header line, footer photo) plus an optional palette override
 * so the form can preview colour edits BEFORE they are saved. Renders only;
 * nothing is sent and nothing is written.
 */

interface BrandingPreviewBody {
  organizationId: string;
  emailType?: EmailType;
  /** Unsaved palette from the form; omit to preview what is stored. */
  colors?: Array<{ primary?: string; secondary?: string; accent?: string }> | null;
}

const SAMPLE_CONTENT = `
  <p>This is a preview of how your community's emails look with your branding applied.</p>
  <p>Notices, reminders, and alerts sent from the portal all use this template —
  your logo, your header line, and your colors.</p>`;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<BrandingPreviewBody>(event);

  if (!body?.organizationId) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }
  const emailType: EmailType = body.emailType || "notice";

  const config = useRuntimeConfig();
  const directus = getTypedDirectus();

  const organization = (await directus.request(
    readItem("hoa_organizations", body.organizationId, {
      fields: ["id", "name", "legal_name", "email", "phone", "slug", "external_url", "street_address", "city", "state", "zip", {
        settings: ["id", "logo", "title", "description", "header_text", "homepage_url", "footer_image", "colors"],
      }],
    })
  )) as HoaOrganization & { settings: BlockSetting | null };

  if (!organization) {
    throw createError({ statusCode: 404, message: "Organization not found" });
  }

  // Overlay the form's unsaved palette. An explicit null previews "no palette"
  // (the platform-default chrome); invalid values are rejected by the renderer.
  if (body.colors !== undefined) {
    organization.settings = {
      ...(organization.settings || {}),
      colors: (body.colors as BlockSetting["colors"]) ?? null,
    } as BlockSetting;
  }

  const appUrl = (config.public.appUrl as string) || "";
  const branding = resolveEmailBranding(organization, null, { appUrl });

  const html = buildEmailHtml({
    organization,
    subject: "A sample message from your community",
    content: SAMPLE_CONTENT,
    emailType,
    recipientFirstName: "Alex",
    directusUrl: config.directus.url,
    appUrl,
    headerText: branding.headerText,
    footerImage: branding.footerImage,
    homepageUrl: branding.homepageUrl,
  });

  return { html };
});
