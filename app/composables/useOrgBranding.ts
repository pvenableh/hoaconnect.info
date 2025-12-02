// composables/useOrgBranding.ts
// Manages dynamic branding based on active organization
// Falls back to Property Flow defaults when no org or no custom branding

import type { ID, DirectusFile, HoaSettings, HoaOrganization } from "~/types/directus";

interface BrandingConfig {
  siteName: string;
  siteDescription: string;
  themeColor: string;
  faviconUrl: string;
  logoUrl: string;
  appleTouchIconUrl: string;
}

export const useOrgBranding = () => {
  const { activeHoa, isMainDomain } = useActiveHoa();
  const config = useRuntimeConfig();

  // Helper to extract file ID from DirectusFile relation
  const getFileId = (file: ID | DirectusFile | null | undefined): string | null => {
    if (!file) return null;
    if (typeof file === "string") return file;
    return file.id?.toString() || null;
  };

  // Helper to build Directus asset URL with optional transforms
  const getDirectusAssetUrl = (
    fileId: string | null,
    options?: { width?: number; height?: number; format?: string }
  ): string | null => {
    if (!fileId) return null;
    const baseUrl = `${config.public.directus.url}/assets/${fileId}`;

    if (!options) return baseUrl;

    const params = new URLSearchParams();
    if (options.width) params.set("width", options.width.toString());
    if (options.height) params.set("height", options.height.toString());
    if (options.format) params.set("format", options.format);

    return `${baseUrl}?${params.toString()}`;
  };

  // Compute branding config with fallbacks
  const branding = computed<BrandingConfig>(() => {
    const org = activeHoa.value as HoaOrganization | null;
    const settings = org?.settings as HoaSettings | null;

    // Get file IDs
    const iconFileId = getFileId(settings?.icon);
    const logoFileId = getFileId(settings?.logo) || getFileId(org?.logo);

    // Extract primary color from colors array if available
    const primaryColor = settings?.colors?.[0]?.primary || "#2563eb";

    return {
      siteName:
        settings?.title ||
        org?.name ||
        config.public.siteTitle ||
        "Property Flow",
      siteDescription:
        settings?.description ||
        settings?.seo?.meta_description ||
        config.public.siteDescription ||
        "Premier Property Management App",
      themeColor: primaryColor,
      faviconUrl: iconFileId
        ? getDirectusAssetUrl(iconFileId, { width: 32, height: 32, format: "png" })!
        : "/favicon.ico",
      logoUrl: logoFileId
        ? getDirectusAssetUrl(logoFileId)!
        : "/logo.png",
      appleTouchIconUrl: iconFileId
        ? getDirectusAssetUrl(iconFileId, { width: 180, height: 180, format: "png" })!
        : "/apple-touch-icon.png",
    };
  });

  // Apply dynamic head tags
  useHead(() => {
    const b = branding.value;

    return {
      title: b.siteName,
      meta: [
        { name: "description", content: b.siteDescription },
        { name: "theme-color", content: b.themeColor },
        // Open Graph
        { property: "og:site_name", content: b.siteName },
        { property: "og:description", content: b.siteDescription },
      ],
      link: [
        // Favicon
        { rel: "icon", type: "image/x-icon", href: b.faviconUrl },
        { rel: "icon", type: "image/png", sizes: "32x32", href: b.faviconUrl },
        // Apple Touch Icon
        { rel: "apple-touch-icon", sizes: "180x180", href: b.appleTouchIconUrl },
        // Dynamic manifest
        { rel: "manifest", href: "/api/manifest.webmanifest" },
      ],
    };
  });

  // Expose for use in components
  return {
    branding,
    isMainDomain,
    activeHoa,
  };
};
