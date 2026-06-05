// module.global.ts — enforces per-org module toggles (Phase 7b, Track B).
//
// When an org disables an optional module from Settings → Modules, its dock
// entry is already hidden (useAppNav filters by useModules), but the page must
// also refuse a direct URL. This global middleware infers the module a slug
// route belongs to and redirects to the org home when that module is off.
//
// Runs after domain-detector.global (alphabetical order), so useActiveHoa —
// and thus the org's `modules` map — is already populated. Non-slug (main
// domain) routes are skipped. Missing keys default to enabled (see useModules).

// An org-relative path prefix → module key. The longest matching prefix wins,
// mirroring the dock's app keys. Records-only modules (pets/vehicles/leases)
// have no dedicated route, so they're gated in-page, not here.
const MODULE_PREFIXES: { module: string; prefixes: string[] }[] = [
  { module: "feed", prefixes: ["/feed"] },
  { module: "announcements", prefixes: ["/announcements", "/admin/announcements"] },
  { module: "meetings", prefixes: ["/meetings", "/admin/meetings"] },
  { module: "polls", prefixes: ["/polls", "/admin/polls"] },
  { module: "documents", prefixes: ["/documents", "/admin/documents"] },
  { module: "rules", prefixes: ["/rules"] },
  { module: "board", prefixes: ["/board"] },
  { module: "payments", prefixes: ["/payments", "/admin/payments"] },
  { module: "expenses", prefixes: ["/admin/expenses"] },
  { module: "requests", prefixes: ["/requests", "/admin/requests"] },
  { module: "moderation", prefixes: ["/admin/moderation"] },
  { module: "email", prefixes: ["/admin/communications", "/admin/email"] },
  { module: "directory", prefixes: ["/admin/members", "/admin/units", "/admin/teams"] },
  { module: "channels", prefixes: ["/admin/channels"] },
];

export default defineNuxtRouteMiddleware((to) => {
  const slug = to.params.slug as string | undefined;
  if (!slug) return;

  // Org-relative path (strip the leading "/<slug>").
  const rel = to.path.replace(new RegExp(`^/${slug}`), "") || "/";

  // Longest-prefix match → the module this route belongs to.
  let matched: { module: string; len: number } | null = null;
  for (const { module, prefixes } of MODULE_PREFIXES) {
    for (const p of prefixes) {
      if (rel === p || rel.startsWith(`${p}/`)) {
        if (!matched || p.length > matched.len) matched = { module, len: p.length };
      }
    }
  }
  if (!matched) return;

  const { isEnabled } = useModules();
  if (!isEnabled(matched.module)) {
    return navigateTo(`/${slug}`);
  }
});
