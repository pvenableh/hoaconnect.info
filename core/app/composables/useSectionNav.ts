// useSectionNav — a hub's pills (its child pages), read from the nav registry
// (core/shared/nav/registry.ts, docs/spec-capability-nav.md). The sub-nav pill
// bar (App/SubNav.vue), the mobile nav sheet, Spotlight and the dock's
// section-home resolution all read the same entries, so they cannot drift.
//
// ORDER MATTERS in the registry: the first visible pill in a hub is where the
// dock lands (sectionHomeFor), so a hub's main screen is listed first.
//
// Pills are gated by their entry's `needs` (admin, a capability, modules), for
// the org being viewed (useNavContext). `path` is org-relative — consumers run
// it through buildOrgPath. Board (/board), Rules (/rules) and Polls (/polls) are
// member routes; they show their manage controls to whoever may manage them.
import { capabilitiesFor } from "#core/shared/permissions";
import {
  NAV_LAYOUTS,
  hubHome,
  isHub,
  pillsOf,
  visiblePills,
  type NavContext,
  type NavEntry,
} from "#core/shared/nav/registry";

export interface SectionLink {
  label: string;
  path: string;
  icon: string; // lucide name (no i-lucide- prefix)
  description?: string;
  module?: string;
}

function toLink(e: NavEntry): SectionLink {
  const mod = e.needs.find((n) => "module" in n && typeof n.module === "string") as { module: string } | undefined;
  return {
    label: e.label,
    path: e.path,
    icon: e.icon,
    ...(e.description ? { description: e.description } : {}),
    ...(mod ? { module: mod.module } : {}),
  };
}

/** Every hub's pills, keyed by hub id, unfiltered (page transitions, tests). */
export const ADMIN_SECTION_LINKS: Readonly<Record<string, SectionLink[]>> = Object.fromEntries(
  NAV_LAYOUTS.admin.filter((id) => isHub(id)).map((id) => [id, pillsOf(id).map(toLink)])
);

export function useSectionNav() {
  const route = useRoute();
  const nav = useNavContext();
  const { buildOrgPath } = useOrgNavigation();

  // A hub's visible pills for the person viewing this org.
  const sectionLinksFor = (key: string | null | undefined): SectionLink[] => {
    if (!key || !isHub(key)) return [];
    return visiblePills(key, nav.ctx.value).map(toLink);
  };

  // How well a section link matches the current page: 0 not at all; 1 its
  // path (org-scoped, query stripped, by prefix, so /admin/projects/123 keeps
  // Projects active); 2 its path AND every query param it names (a pill that
  // is one view of a page: the dashboard's `?tab=building`, Setup's
  // `?tab=modules`). A link with a query that the page does not carry is not
  // this page.
  const linkMatch = (path: string): 0 | 1 | 2 => {
    const [rawBase = "", rawQuery] = buildOrgPath(path).split("?");
    const here = route.path.replace(/\/$/, "") || "/";
    const base = rawBase.replace(/\/$/, "") || "/";
    // A link to the org root ("/", e.g. the Dashboard "Overview" tab) must match
    // ONLY the root itself — the prefix rule would otherwise mark it active on
    // every page under /{slug}/.
    const orgRoot = buildOrgPath("/").split("?")[0].replace(/\/$/, "") || "/";
    const onPath = base === orgRoot ? here === base : here === base || here.startsWith(base + "/");
    if (!onPath) return 0;
    if (!rawQuery) return 1;
    const params = new URLSearchParams(rawQuery);
    for (const [k, v] of params) if (String(route.query[k] ?? "") !== v) return 0;
    return 2;
  };

  /** Is this section link the current page (ignoring its siblings)? */
  const isLinkActive = (path: string): boolean => linkMatch(path) > 0;

  /**
   * Which of a hub's links is the current page: the most specific match, so a
   * pill naming `?tab=building` wins over the plain page beside it. -1 when
   * none matches (a section root).
   */
  const activeLinkIndex = (links: readonly { path: string }[]): number => {
    let best = -1;
    let score = 0;
    links.forEach((l, i) => {
      const m = linkMatch(l.path);
      if (m > score) {
        score = m;
        best = i;
      }
    });
    return best;
  };

  const hasChildren = (key: string | null | undefined): boolean =>
    sectionLinksFor(key).length > 0;

  // Org-relative landing route for a section, for this person.
  const resolveSectionHome = (key: string | null | undefined): string | null =>
    key ? hubHome(key, nav.ctx.value) : null;

  return {
    sectionLinksFor,
    isLinkActive,
    activeLinkIndex,
    hasChildren,
    resolveSectionHome,
    buildOrgPath,
  };
}

/** An admin's context with these module toggles: what sectionHomeFor resolves against. */
function adminContext(isEnabled: (module: string) => boolean): NavContext {
  return {
    admin: true,
    capabilities: capabilitiesFor(["admin"]),
    canWork: () => true,
    residency: "none",
    isEnabled,
    orgFlag: () => true,
  };
}

// The route a section slot opens for an admin: its first module-enabled pill
// (a section used to land on a card grid listing the same links as the pills).
// Dashboard and Settings keep a real landing page of their own.
export function sectionHomeFor(
  key: string | null | undefined,
  isEnabled: (module: string) => boolean
): string | null {
  if (!key || !isHub(key)) return null;
  return hubHome(key, adminContext(isEnabled));
}

// The section-root routes that used to render an AdminSectionHub card grid.
// Kept as real routes (bookmarks, org-redirect.global's allowlist, and the
// custom-domain orgScopedRedirect map all point at them) but redirected onto
// the section's home by the `section-home` middleware. Mapped to the hub id.
export const SECTION_ROOT_ROUTES: Record<string, string> = {
  "/admin/people": "people",
  "/admin/reporting": "records",
  "/admin/more": "requests",
};
