/**
 * Which page transition a navigation plays — pure, so the rules are testable
 * without a router. `core/app/middleware/page-transition.global.ts` calls it
 * before every navigation and stores the name `<NuxtPage :transition>` reads.
 *
 * Three kinds of move, three motions (CSS in core/app/assets/css/main.css):
 *
 *   - ACROSS DOCK APPS (People → Money): a full lateral slide whose direction
 *     is the apps' order in the dock — later app in from the right
 *     (`page-forward`), earlier app in from the left (`page-back`). The page
 *     moves the way the dock reads, whatever the history says.
 *   - ACROSS FLOORS of one app (the SubNav pills: Members → Units): the
 *     floor-strip variant, a short slide in the pills' order (`floor-forward`
 *     / `floor-back`). Same app, so the page only shifts, it does not leave.
 *   - EVERYTHING ELSE (a drill-down into a record and back out of it): the
 *     iOS navigation-stack push or pop the caller worked out from history.
 *
 * Same path (a tab or query change) is the neutral `page` fade.
 */

export type PageTransitionName =
  | "page"
  | "page-forward"
  | "page-back"
  | "floor-forward"
  | "floor-back";

export interface NavApp {
  key: string;
  /** Org-relative route prefixes; "__root__" means exactly "/". */
  match: readonly string[];
}

export interface NavOrder {
  /** The admin dock, in dock order. */
  adminApps: readonly NavApp[];
  /** The member dock, in dock order. */
  memberApps: readonly NavApp[];
  /** Admin section key → its SubNav links, in pill order (org-relative paths). */
  sections: Readonly<Record<string, readonly { path: string }[]>>;
}

/** The dock app a path belongs to (longest matching prefix wins), with its index. */
export function appFor(rel: string, apps: readonly NavApp[]): { key: string; index: number } | null {
  // Same rule as useAppNav's activeKeyFor, so the slide agrees with the dot.
  let best: { key: string; index: number; len: number } | null = null;
  for (let index = 0; index < apps.length; index++) {
    for (const m of apps[index]!.match) {
      const hit = m === "__root__" ? rel === "/" : rel.startsWith(m);
      const len = m === "__root__" ? 1 : m.length;
      if (hit && (!best || len > best.len)) best = { key: apps[index]!.key, index, len };
    }
  }
  return best && { key: best.key, index: best.index };
}

/** The SubNav pill (floor) a path is on, by longest prefix; -1 for none. */
export function floorFor(rel: string, links: readonly { path: string }[]): number {
  let best = -1;
  let bestLen = -1;
  links.forEach((link, i) => {
    const base = link.path.split("?")[0].replace(/\/$/, "") || "/";
    const hit = base === "/" ? rel === "/" : rel === base || rel.startsWith(`${base}/`);
    if (hit && base.length > bestLen) {
      best = i;
      bestLen = base.length;
    }
  });
  return best;
}

/**
 * @param fromRel / toRel  org-relative paths (slug stripped, no query).
 * @param stack            the push/pop the caller read from its history stack.
 */
export function pickPageTransition(
  fromRel: string,
  toRel: string,
  order: NavOrder,
  stack: "forward" | "back"
): PageTransitionName {
  if (fromRel === toRel) return "page";

  // Admin routes read the admin dock; everything else the member dock.
  const apps =
    fromRel.startsWith("/admin") || toRel.startsWith("/admin") ? order.adminApps : order.memberApps;
  const from = appFor(fromRel, apps);
  const to = appFor(toRel, apps);

  if (from && to && from.key !== to.key) {
    return to.index > from.index ? "page-forward" : "page-back";
  }

  if (from && to && from.key === to.key) {
    const links = order.sections[to.key] ?? [];
    const a = floorFor(fromRel, links);
    const b = floorFor(toRel, links);
    // Two different floors, and the destination IS the floor (not a record
    // under it): a pill change, not a drill-down.
    if (a !== -1 && b !== -1 && a !== b && floorRoot(toRel, links[b]!.path)) {
      return b > a ? "floor-forward" : "floor-back";
    }
  }

  return stack === "back" ? "page-back" : "page-forward";
}

function floorRoot(rel: string, linkPath: string): boolean {
  const base = linkPath.split("?")[0].replace(/\/$/, "") || "/";
  return rel === base;
}
