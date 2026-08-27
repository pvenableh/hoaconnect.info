// composables/useOrgBranding.ts
// Manages dynamic branding based on active organization
// Falls back to HOA Connect defaults when no org or no custom branding

import type { DirectusFile, BlockSetting, HoaOrganization } from "#core/types/directus";
import type { ThemeStyle } from "#core/app/composables/useTheme";

type ID = string | number;

interface BrandingConfig {
  siteName: string;
  siteDescription: string;
  themeColor: string;
  faviconUrl: string;
  logoUrl: string;
  appleTouchIconUrl: string;
  theme: ThemeStyle;
}

export const useOrgBranding = () => {
  const { activeHoa, isCustomDomain } = useActiveHoa();
  const config = useRuntimeConfig();
  const route = useRoute();

  // Helper to extract file ID from DirectusFile relation
  const getFileId = (file: ID | DirectusFile | null | undefined): string | null => {
    if (!file) return null;
    if (typeof file === "string") return file;
    if (typeof file === "number") return file.toString();
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
    const settings = org?.settings as BlockSetting | null;

    // Get file IDs - fall back to default HOA Connect assets from config
    const iconFileId =
      getFileId(settings?.icon) || config.public.defaultIconId || null;
    const logoFileId =
      getFileId(settings?.logo) ||
      getFileId(
        (org as (HoaOrganization & { logo?: ID | DirectusFile | null }) | null)
          ?.logo
      ) ||
      config.public.defaultLogoId ||
      null;

    // Extract primary color from colors array if available
    const primaryColor = settings?.colors?.[0]?.primary || "#2563eb";

    // Generate URLs - all icons come from Directus when IDs are configured
    const faviconUrl = iconFileId
      ? getDirectusAssetUrl(iconFileId, { width: 32, height: 32, format: "png" })!
      : "/favicon.ico";
    const logoUrl = logoFileId ? getDirectusAssetUrl(logoFileId)! : "/logo.png";
    const appleTouchIconUrl = iconFileId
      ? getDirectusAssetUrl(iconFileId, { width: 180, height: 180, format: "png" })!
      : "/apple-touch-icon.png";

    // Get theme from org settings, default to classic
    const orgTheme = (settings?.theme as ThemeStyle) || "classic";

    return {
      siteName:
        settings?.title ||
        org?.name ||
        config.public.siteTitle ||
        "HOA Connect",
      siteDescription:
        settings?.description ||
        settings?.seo?.meta_description ||
        config.public.siteDescription ||
        "Premier Property Management App",
      themeColor: primaryColor,
      faviconUrl,
      logoUrl,
      appleTouchIconUrl,
      theme: orgTheme,
    };
  });

  // NOTE: theme application lives elsewhere now — the workspace owns it in
  // app/layouts/auth.vue (a single reactive useHead), and the public landing
  // forces the org theme in app/pages/[slug]/index.vue + app/pages/index.vue;
  // other surfaces use their layout's initTheme(). useOrgBranding used to ALSO
  // forceThemeStyle here, but as a global (app.vue) composable its useHead never
  // unmounted, so it left a stale theme class that fought the workspace's class
  // (e.g. broke the light/dark toggle). Branding here is now meta/favicon only.

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
    isCustomDomain,
    activeHoa,
  };
};
