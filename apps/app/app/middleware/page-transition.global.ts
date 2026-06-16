// page-transition.global — direction-aware iOS push/pop for <NuxtPage>.
//
// app.vue binds `<NuxtPage :transition>` to a SINGLE reactive name held in
// shared state (`page-transition-name`); this middleware swaps that name per
// navigation so the CSS in main.css plays a horizontal push or pop:
//   forward → `page-forward`  (new view slides in from the right, old parallaxes left)
//   back    → `page-back`     (current view slides off right, previous parallaxes in from left)
//   same path / first paint → `page` (neutral quick fade — tab/query switches don't slide)
//
// Why one shared name instead of per-route `to.meta.pageTransition`: with
// `mode: out-in` the LEAVE of the outgoing view uses whatever transition was
// stored on ITS route, so a pop would slide the top view left (its old forward
// value) instead of right. A single name set before the navigation makes both
// the leave (old) and enter (new) phases agree on the direction.
//
// Direction is inferred from a client-side visited-path stack: if the target
// path already sits behind us it's a back/pop (and we unwind to it); otherwise
// it's a forward/push. This tracks the browser Back/Forward buttons and
// swipe-back, not just in-app links. Reduced motion is honored in CSS (the
// classes collapse to instant), so nothing here needs to branch on it.

// Module-level so it persists across navigations for the life of the SPA.
let stack: string[] = [];

export default defineNuxtRouteMiddleware((to, from) => {
  // Server render plays no transition; leave the default name.
  if (import.meta.server) return;

  const name = useState<string>("page-transition-name", () => "page");
  const toPath = to.path;

  // Tab/query/hash changes on the same page shouldn't slide horizontally.
  if (from && toPath === from.path) {
    name.value = "page";
    return;
  }

  // Seed the stack with the route we're coming FROM the first time we run.
  // Global middleware doesn't execute on the initial client load, so without
  // this the landing route would be absent and the first Back would be misread
  // as a forward push.
  if (stack.length === 0 && from && from.path !== toPath) {
    stack.push(from.path);
  }

  const seenAt = stack.lastIndexOf(toPath);

  if (seenAt !== -1 && seenAt < stack.length - 1) {
    // Target is behind us → pop. Unwind the stack to that point.
    name.value = "page-back";
    stack = stack.slice(0, seenAt + 1);
  } else {
    // New (or re-pushed) path → push.
    name.value = "page-forward";
    if (stack[stack.length - 1] !== toPath) stack.push(toPath);
  }
});
