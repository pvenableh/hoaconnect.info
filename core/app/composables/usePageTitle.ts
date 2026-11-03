/**
 * usePageTitle — the page title as SHELL state, not page markup (Earnest's
 * AppHeader → AppHeaderOutlet, ported).
 *
 * `<AppPageHeader>` used to draw the header inside each page, so every
 * navigation destroyed it with the page and built a new one: the title slid
 * out with the old page and back in with the new one, and there was no
 * element that survived to hand the title to the Nav when you scrolled.
 *
 * Now `<AppPageHeader>` REGISTERS {title, blurb, kicker, backTo} here and
 * teleports its `#actions` / `#meta` slots into `<AppHeaderOutlet>`, which the
 * workspace layout (layouts/auth.vue) mounts once, above `<main>`. The outlet
 * outlives every navigation, so the title changes in place while the page
 * slides; and once it scrolls under the Nav, the Nav's centre carries a compact
 * copy (`collapsed`, set by useTitleCollapse) and the Nav earns its hairline.
 *
 * ⚠️ THE OUTLET CANNOT SERVER-RENDER THE TITLE. Vue SSR renders the layout's
 * outlet BEFORE the `<slot />` holding the page that registers into it, so the
 * server always emits an empty outlet. AppPageHeader therefore renders itself
 * INLINE on the server and through hydration, and hands off to the outlet on
 * mount — at the same position, so a cold load does not jump. A client-side
 * navigation (the common case) registers straight away and never draws inline.
 *
 * ⚠️ A stale title is cleared on Nuxt's `page:finish`, NOT by comparing the
 * stored path to the live route on every render. `<NuxtPage>` transitions
 * `out-in`, so between routes the old page has gone and the new one has not
 * mounted, and a path comparison is false for that whole window — the title
 * would blank and reappear on every navigation. `page:finish` fires once the
 * incoming page has rendered, by which time its header has registered if it
 * has one; a title still holding the previous path then really is stale.
 */

export interface PageTitleState {
  /** The page's name — the shell's one `type-display`. */
  title: string | null;
  /** The line under it (AppPageHeader's `description`). */
  blurb: string | null;
  /** The small line above it (AppPageHeader's `eyebrow`). */
  kicker: string | null;
  backTo: string | null;
  backLabel: string | null;
  /** The route that registered this title. */
  path: string;
}

function emptyState(): PageTitleState {
  return { title: null, blurb: null, kicker: null, backTo: null, backLabel: null, path: "" };
}

export function usePageTitle() {
  const route = useRoute();
  const state = useState<PageTitleState>("page-title", emptyState);

  /** The large title has scrolled under the Nav; the Nav carries it now. */
  const collapsed = useState<boolean>("page-title-collapsed", () => false);

  /**
   * Whether a shell is rendering an outlet. AppPageHeader renders itself
   * inline when nothing is listening, so a page in a layout without one (the
   * account page) keeps its header instead of silently losing it.
   */
  const hasOutlet = useState<boolean>("page-title-outlet", () => false);

  const visible = computed(() => !!state.value.title);

  /**
   * ⚠️ Writes the WHOLE record rather than merging into the previous one: the
   * caller runs this from a `watchEffect`, and a merge would read `state.value`
   * inside that effect, making it depend on the ref it writes — an infinite
   * re-run Vue only stops at its recursion ceiling.
   */
  function setPageTitle(next: Omit<PageTitleState, "path">) {
    state.value = { ...next, path: route.path };
  }

  function clearPageTitle() {
    state.value = emptyState();
  }

  /**
   * Drop a title the incoming page did not claim. Registered by the outlet
   * for its lifetime; returns the unregister so a remounted outlet (a trip
   * through another layout) does not stack a second hook.
   */
  function watchForStaleTitle(): () => void {
    const nuxtApp = useNuxtApp();
    return nuxtApp.hook("page:finish", () => {
      if (state.value.path && state.value.path !== route.path) clearPageTitle();
    });
  }

  return { pageTitle: state, collapsed, hasOutlet, visible, setPageTitle, clearPageTitle, watchForStaleTitle };
}

/**
 * useTitleCollapse — flips `collapsed` as the large title passes under the
 * sticky chrome. Mounted once, by the workspace layout.
 *
 * The workspace scrolls the WINDOW (unlike Earnest's shell, whose `<main>` is
 * the scroller), so this listens there. It measures rather than guessing a
 * scroll offset: the title's height and the chrome above it (Nav, SubNav, a
 * banner) all vary by page, and "the title's bottom edge has gone under the
 * chrome's bottom edge" is the event that matters. Hysteretic — collapse once
 * the title is fully under, restore once 16px of it is back — so a title
 * parked on the line cannot flicker while a trackpad settles. A page with no
 * title collapses on any real scroll, which is what earns the Nav its rule.
 */
export function useTitleCollapse() {
  const { collapsed } = usePageTitle();
  const route = useRoute();
  let frame = 0;

  function measure() {
    frame = 0;
    const heading = document.querySelector<HTMLElement>("[data-page-title-heading]");
    const chromeBottom = Math.max(
      0,
      ...Array.from(document.querySelectorAll<HTMLElement>("[data-app-nav], [data-app-subnav]")).map(
        (el) => el.getBoundingClientRect().bottom
      )
    );
    if (heading && heading.offsetParent !== null) {
      const bottom = heading.getBoundingClientRect().bottom;
      if (!collapsed.value && bottom <= chromeBottom) collapsed.value = true;
      else if (collapsed.value && bottom > chromeBottom + 16) collapsed.value = false;
      return;
    }
    const y = window.scrollY;
    if (!collapsed.value && y > 16) collapsed.value = true;
    else if (collapsed.value && y < 4) collapsed.value = false;
  }

  function onScroll() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  onMounted(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
  });
  onBeforeUnmount(() => {
    window.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
  });

  // A new page starts at the top, so the chrome hands the title back.
  watch(
    () => route.path,
    () => {
      collapsed.value = false;
    }
  );

  return { collapsed };
}
