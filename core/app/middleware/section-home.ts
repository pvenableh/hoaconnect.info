// section-home — send a bare section root to the section's first enabled child.
//
// The dock already resolves a hub slot to its child (useAppNav's appsFor), so a
// click never comes through here. This covers everything else that can still
// name the root: a typed URL, an old bookmark, org-redirect.global bouncing a
// signed-in user, and the custom-domain orgScopedRedirect map. `replace: true`
// keeps the root out of history — otherwise Back lands on the redirect and
// bounces forward again.
//
// Module state is safe to read here: domain-detector.global awaits
// fetchActiveHoa(slug) before any named route middleware runs, so `modules` is
// already on the active org.
export default defineNuxtRouteMiddleware((to) => {
  const slug = to.params.slug as string | undefined;
  const rel = (slug ? to.path.replace(new RegExp(`^/${slug}`), "") : to.path) || "/";
  const key = SECTION_ROOT_ROUTES[rel.replace(/\/$/, "")];
  if (!key) return;

  const { isEnabled } = useModules();
  const home = sectionHomeFor(key, isEnabled);
  // No enabled child (every module in the section is off) — leave the page to
  // render its own empty state rather than redirecting to nowhere.
  if (!home || home === rel) return;

  return navigateTo(slug ? `/${slug}${home}` : home, { replace: true });
});
