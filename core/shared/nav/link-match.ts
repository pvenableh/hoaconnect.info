/**
 * Which section pill is the current page. Pure: the caller hands in the page
 * (path and query) and the org's root, both already org-scoped, so this can be
 * tested without a router. Used by useSectionNav (the section capsule).
 */

export interface Here {
  /** The current route path, e.g. "/demo/admin/projects/123". */
  path: string;
  /** The current route query (vue-router's shape: values may be arrays or null). */
  query: Readonly<Record<string, unknown>>;
}

const trim = (p: string) => p.replace(/\/$/, "") || "/";

/**
 * How well a link (org-scoped, may carry a query) matches the page:
 *   0 — not this page;
 *   1 — its path: exact, or by prefix so /admin/projects/123 keeps Projects
 *       active. A link to the org root matches only the root itself, or it
 *       would be active on every page under /{slug}/;
 *   2 — its path AND every query param it names: a pill that is one view of a
 *       page (the dashboard's `?tab=building`, Setup's `?tab=modules`). A link
 *       naming a query the page does not carry is not this page.
 */
export function linkMatchScore(link: string, here: Here, orgRoot: string): 0 | 1 | 2 {
  const [rawBase = "", rawQuery] = link.split("?");
  const path = trim(here.path);
  const base = trim(rawBase);
  const root = trim(orgRoot.split("?")[0] ?? "/");
  const onPath = base === root ? path === base : path === base || path.startsWith(base + "/");
  if (!onPath) return 0;
  if (!rawQuery) return 1;
  for (const [k, v] of new URLSearchParams(rawQuery)) {
    const got = here.query[k];
    const value = Array.isArray(got) ? got[0] : got;
    if (String(value ?? "") !== v) return 0;
  }
  return 2;
}

/**
 * The index of the link that is the current page: the most specific match, so
 * a pill naming `?tab=building` wins over the plain page beside it, and the
 * first of equals wins. -1 when none matches (a section root).
 */
export function bestLinkIndex(links: readonly string[], here: Here, orgRoot: string): number {
  let best = -1;
  let score = 0;
  links.forEach((link, i) => {
    const m = linkMatchScore(link, here, orgRoot);
    if (m > score) {
      score = m;
      best = i;
    }
  });
  return best;
}
