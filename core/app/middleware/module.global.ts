// module.global.ts — enforces per-org module toggles (Phase 7b, Track B).
//
// When an org disables an optional module from Settings → Modules, its nav
// entries are already hidden, but the page must also refuse a direct URL. This
// global middleware finds the module a slug route belongs to and redirects to
// the org home when that module is off.
//
// The route → module table is built from the nav registry
// (core/shared/nav/registry.ts, moduleRoutePrefixes): every entry with one
// module gates its path, so a link the nav hides is a URL this refuses, and
// there is no second copy to drift. Routes with no entry (the feed) are listed
// there too. No "announcements" entry: that module was retired with its pages,
// and its `/announcements` prefix used to break the public "view this email on
// the web" route under `/announcements/email/{ref}`.
//
// Runs after domain-detector.global (alphabetical order), so useActiveHoa —
// and thus the org's `modules` map — is already populated. Non-slug (main
// domain) routes are skipped. Missing keys default to enabled (see useModules).
import { moduleForPath } from "#core/shared/nav/registry";

export default defineNuxtRouteMiddleware((to) => {
  const slug = to.params.slug as string | undefined;
  if (!slug) return;

  // Org-relative path (strip the leading "/<slug>").
  const rel = to.path.replace(new RegExp(`^/${slug}`), "") || "/";

  const module = moduleForPath(rel);
  if (!module) return;

  const { isEnabled } = useModules();
  if (!isEnabled(module)) {
    return navigateTo(`/${slug}`);
  }
});
