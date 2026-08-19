/**
 * Pure path logic for pulling a custom domain's NON-slug routes onto the org
 * that owns the domain — no Directus, no H3, no runtime config.
 *
 * The app's page tree has two overlapping halves: a top-level tree
 * (`/admin/members`, `/documents`, `/payments`) and the org tree
 * (`/{slug}/admin/members`, …). On the main app host that overlap is harmless —
 * `org-redirect.global` moves signed-in users onto their slug. On a CUSTOM
 * domain it is not: `domain-detector.global` enforces tenancy only inside its
 * `if (slug)` branch, so a non-slug route there renders the HOST org's branding
 * (meta, OG, JSON-LD) around the SESSION's selected-org data. Not a leak — the
 * viewer only ever sees an org they belong to — but the page misrepresents which
 * community it is, which is genuinely confusing for a PM or agency user.
 *
 * The fix is to redirect those paths to `/{hostSlug}{path}` so the URL space on
 * a custom domain is consistent before anything tries to invert it. That is why
 * the mapping lives here as data rather than as a rewrite rule: the two trees
 * are NOT a clean mirror. Some top-level pages have an exact org twin, some
 * have a twin that moved under `/admin`, and some (the platform's own pages)
 * have no org meaning at all and must be left alone.
 *
 * Deliberately NOT solved by deleting the top-level pages: they are still
 * reachable on the main host and several are redirect shims that old bookmarks
 * depend on. See the slugless-routing-is-blocked notes.
 */

/**
 * Top-level paths whose org twin sits at the SAME path under `/{slug}`.
 * Exact matches only — `/documents` has a twin but `/documents/upload` does not.
 */
const SAME_PATH_TWINS = new Set([
  "/announcements",
  "/board",
  "/documents",
  "/payments",
  "/signup",
]);

/**
 * Top-level paths whose org twin lives at a DIFFERENT path — these are the
 * legacy shims that already redirect into `/admin/*`, they just resolve the org
 * from the session instead of from the host. Mapping them here makes the host
 * win without touching the page files.
 */
const MOVED_TWINS: Record<string, string> = {
  "/dashboard": "",
  "/documents/upload": "/admin/documents/upload",
  "/members": "/admin/members",
  "/settings/organization": "/admin/settings/organization",
  "/units": "/admin/units",
};

/**
 * The whole top-level `/admin/**` tree mirrors `/{slug}/admin/**` one-for-one
 * (verified page by page), so it maps by prefix rather than by enumeration.
 */
const ADMIN_PREFIX = "/admin";

/** Strip a trailing slash so `/board/` and `/board` are the same route. */
function normalizePath(path: string): string {
  if (!path || path[0] !== "/") return "";
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed || "/";
}

/**
 * Where should this non-slug path go on a custom domain owned by `hostSlug`?
 * Returns the target path, or null to leave the route alone.
 *
 * Null covers three distinct cases, all of which must NOT redirect:
 *  - the clean root `/`, which already renders the org's public landing by host;
 *  - paths that are already scoped to this org (`/{hostSlug}/…`), so the
 *    middleware can call this unconditionally without looping;
 *  - the platform's own pages (`/auth/*`, `/account`, `/billing/*`,
 *    `/organizations`, `/approve/*`, `/setup`, …) which have no org twin. A
 *    tenant's login page belongs to the tenant's domain and stays put.
 *
 * `path` is the pathname only — the caller re-attaches any query and hash.
 */
export function orgScopedRedirect(
  path: string,
  hostSlug?: string | null
): string | null {
  const slug = (hostSlug || "").trim();
  if (!slug) return null;

  const p = normalizePath(path);
  if (!p || p === "/") return null;

  // Already on this org's slug — nothing to do. Guards against a redirect loop.
  if (p === `/${slug}` || p.startsWith(`/${slug}/`)) return null;

  // `/dashboard` maps to the org ROOT, so its entry is the empty string —
  // test against undefined, not for truthiness, or it would fall through.
  const moved = MOVED_TWINS[p];
  if (moved !== undefined) return `/${slug}${moved}`;

  if (SAME_PATH_TWINS.has(p)) return `/${slug}${p}`;

  if (p === ADMIN_PREFIX || p.startsWith(`${ADMIN_PREFIX}/`)) return `/${slug}${p}`;

  return null;
}
