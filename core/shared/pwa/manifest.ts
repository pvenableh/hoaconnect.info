/**
 * The web app manifest, as data (Phase 6) — pure, so the route stays a thin
 * resolver of "which community's host is this" and the shape is testable.
 *
 * `id` pins the app's identity (an installed app survives a `start_url` change);
 * `start_url` carries `?source=pwa` so a launch from the Home Screen is
 * distinguishable in analytics and in the page; `shortcuts` are the long-press
 * menu on the installed icon. Shortcuts need the community's slug — `/requests`
 * and the channels have no slug-less twin — so a host that doesn't resolve to a
 * community (the platform's own domain) gets none rather than links that 404.
 */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface ManifestShortcut {
  name: string;
  short_name: string;
  url: string;
  description?: string;
  icons?: ManifestIcon[];
}

export interface ManifestInput {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  icons: ManifestIcon[];
  /** The community's slug when the host resolved to one. */
  slug?: string | null;
}

export const MANIFEST_ID = "/";
export const MANIFEST_START_URL = "/?source=pwa";

/** [name, org-relative path, description]. The channels app lives under /admin for every role. */
export const MANIFEST_SHORTCUTS: ReadonlyArray<readonly [string, string, string]> = [
  ["Pay dues", "/payments", "See what you owe and pay"],
  ["Requests", "/requests", "Open or follow a request"],
  ["Documents", "/documents", "Governing documents and minutes"],
  ["Channels", "/admin/channels", "Community conversations"],
];

export function manifestShortcuts(slug: string | null | undefined): ManifestShortcut[] {
  if (!slug) return [];
  return MANIFEST_SHORTCUTS.map(([name, path, description]) => ({
    name,
    short_name: name,
    description,
    url: `/${slug}${path}?source=shortcut`,
  }));
}

export function buildManifest(input: ManifestInput) {
  const shortcuts = manifestShortcuts(input.slug);
  return {
    id: MANIFEST_ID,
    name: input.name,
    short_name: input.shortName,
    description: input.description,
    start_url: MANIFEST_START_URL,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: input.backgroundColor,
    theme_color: input.themeColor,
    icons: input.icons,
    ...(shortcuts.length ? { shortcuts } : {}),
  };
}
