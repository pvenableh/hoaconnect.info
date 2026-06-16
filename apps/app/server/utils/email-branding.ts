import type { HoaOrganization, BlockSetting, DirectusFile, HoaEmail } from "~~/types/directus";

export interface ResolvedEmailBranding {
  headerText: string | null;
  footerImage: DirectusFile | string | null;
  homepageUrl: string | null;
}

type OrgWithSettings = HoaOrganization & { settings?: BlockSetting | string | null };

/**
 * Resolve the email branding (custom header line, footer building photo, homepage
 * link) for a send/preview/web-view.
 *
 * Precedence: per-send override (on the email) → per-org default (block_settings).
 * Homepage falls back to the org's external site, then its resident portal URL.
 *
 * `email` is optional (preview has no saved record yet); pass per-send overrides
 * directly via `overrides` in that case.
 */
export function resolveEmailBranding(
  organization: OrgWithSettings,
  email?: Pick<HoaEmail, "header_text" | "footer_image"> | null,
  options: { appUrl?: string; overrides?: { headerText?: string | null; footerImage?: DirectusFile | string | null } } = {}
): ResolvedEmailBranding {
  const settings = (organization.settings && typeof organization.settings === "object"
    ? organization.settings
    : null) as BlockSetting | null;

  const headerText =
    options.overrides?.headerText ??
    (email?.header_text || null) ??
    (settings?.header_text || null) ??
    null;

  const footerImage =
    options.overrides?.footerImage ??
    ((email?.footer_image as DirectusFile | string | null) || null) ??
    ((settings?.footer_image as DirectusFile | string | null) || null) ??
    null;

  const portalUrl =
    organization.slug && options.appUrl ? `${options.appUrl}/${organization.slug}` : null;
  const homepageUrl = settings?.homepage_url || organization.external_url || portalUrl || null;

  return { headerText, footerImage, homepageUrl };
}

/** Substitute {name}/{legal_name} tokens in a header line template. */
export function applyHeaderTextTokens(
  template: string | null | undefined,
  orgName: string,
  legalName?: string | null
): string {
  if (!template) return "";
  return template.replace(/\{name\}/gi, orgName).replace(/\{legal_name\}/gi, legalName || orgName);
}

/** Slugify an email subject into a URL-friendly base (no uniqueness applied). */
export function slugifyEmailSubject(subject: string): string {
  return (subject || "email")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "email";
}

/**
 * Build a web_slug unique within an org, appending -2/-3/… on collision.
 * `taken` is the set of web_slugs already used by other emails in the org.
 */
export function buildUniqueWebSlug(subject: string, taken: Set<string>): string {
  const base = slugifyEmailSubject(subject);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
