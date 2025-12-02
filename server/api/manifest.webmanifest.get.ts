// server/api/manifest.webmanifest.get.ts
// Dynamic web manifest that returns org-specific branding or Property Flow defaults

import { readItems } from "@directus/sdk";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const host = getRequestHost(event);

  // Default Property Flow branding
  const defaults = {
    name: config.public.siteTitle || "Property Flow",
    shortName: config.public.companyName || "Property Flow",
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

  // Only look up org branding if not on main domain
  if (!mainDomains.includes(host)) {
    try {
      const directus = getTypedDirectus();

      // Extract potential slug from subdomain
      const potentialSlug = host.split(".")[0];

      const filters: any[] = [
        // Custom domain match (verified only)
        {
          _and: [
            { custom_domain: { _eq: host } },
            { domain_verified: { _eq: true } },
          ],
        },
        // Slug match
        { slug: { _eq: potentialSlug } },
      ];

      const organizations = await directus.request(
        readItems("hoa_organizations", {
          filter: {
            _and: [
              { _or: filters },
              { status: { _in: ["active", "published"] } },
            ],
          },
          fields: [
            "name",
            {
              settings: ["title", "description", "colors", { icon: ["id"] }],
            },
          ],
          limit: 1,
          sort: ["-custom_domain"],
        })
      );

      if (organizations && organizations.length > 0) {
        const org = organizations[0];
        const settings = org.settings as any;

        orgBranding = {
          name: settings?.title || org.name,
          description: settings?.description,
          themeColor: settings?.colors?.[0]?.primary,
          iconUrl: settings?.icon?.id
            ? `${config.public.directus.url}/assets/${settings.icon.id}`
            : undefined,
        };
      }
    } catch (error) {
      // Silently fall back to defaults on error
      console.error("Failed to fetch org for manifest:", error);
    }
  }

  // Build icon array
  const icons: ManifestIcon[] = [];
  const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

  if (orgBranding?.iconUrl) {
    // Dynamic icons from Directus
    iconSizes.forEach((size) => {
      icons.push({
        src: `${orgBranding!.iconUrl}?width=${size}&height=${size}&format=png`,
        sizes: `${size}x${size}`,
        type: "image/png",
      });
    });
    // Maskable icon
    icons.push({
      src: `${orgBranding.iconUrl}?width=512&height=512&format=png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });
  } else {
    // Default static icons (assumes they exist in public/)
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
