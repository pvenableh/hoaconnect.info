// page-transition.global — direction-aware page motion for <NuxtPage>.
//
// app.vue binds `<NuxtPage :transition>` to a SINGLE reactive name held in
// shared state (`page-transition-name`); this middleware swaps that name per
// navigation so the CSS in main.css plays the right move. WHICH move is
// decided by `pickPageTransition` (core/shared/nav/page-transition.ts):
//   across dock apps     → `page-forward` / `page-back` in DOCK order
//   across SubNav floors → `floor-forward` / `floor-back` in pill order
//   a drill-down         → `page-forward` / `page-back` from the history stack
//   same path            → `page` (neutral quick fade — tab/query switches don't slide)
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
//
// Leaving a page that is still loading CUTS instead (`page-cut`, default mode,
// no motion): under out-in that navigation strands an empty placeholder in
// <main> for the rest of the session — see PAGE_CUT. app.vue keeps
// `page-transition-pending` from Nuxt's page:start / page:finish.

import {
  PAGE_CUT,
  pickPageTransition,
  shouldCutPageTransition,
  type NavOrder,
} from "#core/shared/nav/page-transition";
import { ADMIN_APPS, MEMBER_APPS } from "#core/app/composables/useAppNav";
import { ADMIN_SECTION_LINKS } from "#core/app/composables/useSectionNav";

const NAV_ORDER: NavOrder = {
  adminApps: ADMIN_APPS,
  memberApps: MEMBER_APPS,
  sections: ADMIN_SECTION_LINKS,
};

// The org-relative path: `/{slug}/admin/members` → `/admin/members`.
const orgRelative = (path: string, slug: unknown) =>
  typeof slug === "string" && slug && path.startsWith(`/${slug}`)
    ? path.slice(slug.length + 1) || "/"
    : path;

// Module-level so it persists across navigations for the life of the SPA.
let stack: string[] = [];

export default defineNuxtRouteMiddleware((to, from) => {
  // Server render plays no transition; leave the default name.
  if (import.meta.server) return;

  const name = useState<string>("page-transition-name", () => "page");
  const pending = useState<boolean>("page-transition-pending", () => false);
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
  let direction: "forward" | "back";

  if (seenAt !== -1 && seenAt < stack.length - 1) {
    // Target is behind us → pop. Unwind the stack to that point.
    direction = "back";
    stack = stack.slice(0, seenAt + 1);
  } else {
    // New (or re-pushed) path → push.
    direction = "forward";
    if (stack[stack.length - 1] !== toPath) stack.push(toPath);
  }

  if (
    shouldCutPageTransition({
      leavingPending: pending.value,
      fromOptsOut: from?.meta.pageTransition === false,
      toOptsOut: to.meta.pageTransition === false,
    })
  ) {
    name.value = PAGE_CUT;
    return;
  }

  name.value = from
    ? pickPageTransition(
        orgRelative(from.path, from.params.slug),
        orgRelative(toPath, to.params.slug),
        NAV_ORDER,
        direction
      )
    : direction === "back"
      ? "page-back"
      : "page-forward";
});
