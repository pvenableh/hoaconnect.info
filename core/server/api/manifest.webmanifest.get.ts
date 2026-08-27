// server/api/manifest.webmanifest.get.ts
// Per-host web manifest: an installed PWA on a community's own domain shows
// THAT community's name, icon, and theme colour — not the platform's.
//
// This used to resolve the org by taking the first label of the host as a slug,
// which silently never matched a real custom domain (605lincolnroad.com → slug
// "605lincolnroad", but the org's slug is "605-lincoln"), so every custom domain
// fell back to the platform defaults. It also filtered on a status list that
// didn't match the serving layer's. Both are fixed by going through the one
// cached Host → org resolver that the rest of the routing layer uses.
//
// The slug-subdomain lookup is kept as a SECONDARY strategy so nothing that
// relied on it regresses, but it now runs only after the custom-domain match
// misses.

import { readItem, readItems } from "@directus/sdk";
import { resolveOrgForHost } from "../utils/host-resolver";
import { normalizeHost } from "#core/shared/domains/host";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  // xForwardedHost: behind Vercel/Caddy the tenant's real host arrives in
  // x-forwarded-host — same as domain-detector.global.ts and origin.ts. Reading
  // the bare Host here would see the proxy, not the community's domain.
  const host = normalizeHost(getRequestHost(event, { xForwardedHost: true }));

  // Default HOA Connect branding
  const defaults = {
    name: config.public.siteTitle || "HOA Connect",
    shortName: config.public.companyName || "HOA Connect",
    description:
      config.public.siteDescription ||
      "Premier Property Management App for Property Owners and Property Managers.",
    themeColor: "#2563eb",
    backgroundColor: "#ffffff",
  };

  // Define main domains that should use defaults
  const mainDomains = [
    config.public.mainDomain,
    `www.${config.public.mainDomain}`,
    "localhost",
    "127.0.0.1",
  ];

  let orgBranding: {
    name?: string;
    description?: string;
    themeColor?: string;
    iconUrl?: string;
  } | null = null;

  const BRANDING_FIELDS = [
    "name",
    { settings: ["title", "description", "colors", { icon: ["id"] }] },
  ] as const;

  type BrandingRow = {
    name?: string | null;
    settings?: { title?: string | null; description?: string | null; colors?: any; icon?: { id?: string } | null } | null;
  };

  const toBranding = (org: BrandingRow | null | undefined) => {
    if (!org) return null;
    const settings = org.settings as any;
    return {
      name: settings?.title || org.name || undefined,
      description: settings?.description,
      themeColor: settings?.colors?.[0]?.primary,
      iconUrl: settings?.icon?.id
        ? `${config.public.directus.url}/assets/${settings.icon.id}`
        : undefined,
    };
  };

  // Only look up org branding if not on main domain
  if (!mainDomains.includes(host)) {
    try {
      const directus = getTypedDirectus();

      // 1. Verified custom domain — the case that actually happens.
      const resolved = await resolveOrgForHost(host);
      if (resolved) {
        const org = (await directus.request(
          readItem("hoa_organizations", resolved.id, { fields: BRANDING_FIELDS as any })
        )) as BrandingRow;
        orgBranding = toBranding(org);
      }

      // 2. Fallback: the host's first label as an org slug ({slug}.example.com).
      if (!orgBranding) {
        const potentialSlug = host.split(".")[0];
        const organizations = (await directus.request(
          readItems("hoa_organizations", {
            filter: {
              _and: [
                { slug: { _eq: potentialSlug } },
                { status: { _in: ["active", "inactive"] as unknown as ["active"] } },
              ],
            },
            fields: BRANDING_FIELDS as any,
            limit: 1,
          })
        )) as BrandingRow[];
        orgBranding = toBranding(organizations?.[0]);
      }
    } catch (error) {
      // Silently fall back to defaults on error
      console.error("Failed to fetch org for manifest:", error);
    }
  }

  // Build icon array
  const icons: ManifestIcon[] = [];
  const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

  // Determine icon base URL - org-specific or default from config
  const iconBaseUrl =
    orgBranding?.iconUrl ||
    (config.public.defaultIconId
      ? `${config.public.directus.url}/assets/${config.public.defaultIconId}`
      : null);

  if (iconBaseUrl) {
    // Dynamic icons from Directus (org-specific or default)
    iconSizes.forEach((size) => {
      icons.push({
        src: `${iconBaseUrl}?width=${size}&height=${size}&format=png`,
        sizes: `${size}x${size}`,
        type: "image/png",
      });
    });
    // Maskable icon
    icons.push({
      src: `${iconBaseUrl}?width=512&height=512&format=png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });
  } else {
    // Fallback to static icons only if no Directus icons configured
    iconSizes.forEach((size) => {
      icons.push({
        src: `/icon-${size}x${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
      });
    });
    icons.push({
      src: "/maskable-icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });
  }

  // Build manifest
  const manifest = {
    name: orgBranding?.name || defaults.name,
    short_name: orgBranding?.name || defaults.shortName,
    description: orgBranding?.description || defaults.description,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: defaults.backgroundColor,
    theme_color: orgBranding?.themeColor || defaults.themeColor,
    icons,
  };

  // Set proper content type
  setResponseHeader(event, "Content-Type", "application/manifest+json");

  return manifest;
});
