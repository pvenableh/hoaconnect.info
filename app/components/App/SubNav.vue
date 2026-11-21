<!--
  Secondary sub-navigation: the ACTIVE section's child pages as one compact
  capsule under the top bar (e.g. inside People: Members · Units · Board · Teams ·
  Vendors). The floating dock carries the top-level sections and has no room for
  their children, so this capsule is where "where am I inside this section" lives.

  Not a bar (Phase 4 part 3, plan §2.4 "Chrome without a bar"): nothing here
  spans the window. The capsule is only as wide as its pills, sits on the page's
  one left edge, and scrolls sideways inside itself when the pills outgrow the
  column. It sticks under the top bar, so it floats over content as the page
  scrolls: a neutral translucent fill (no accent in the fill or the rim) keeps it
  legible, and a fade in the page's own ground softens content as it slides
  under. The tint is on the thumb's lift, as on every other control.

  It rides the SAME capsule and sliding thumb as AppSegmentedControl, so moving
  between sub-pages and switching tabs within a page look and feel identical —
  the selected thing is always the same capsule, travelling the same way.
-->
<template>
  <nav
    v-if="links.length"
    ref="stickyEl"
    class="app-subnav sticky z-30"
    :class="{ 'app-subnav--scrolled': scrolled }"
    aria-label="Section"
    data-app-subnav
  >
    <!-- The column matches PageContainer's width and gutters, so the capsule's
         left edge is the page title's and the cards' left edge. -->
    <div class="app-subnav__column" :class="pageWide ? 'max-w-7xl' : 'max-w-6xl'">
      <div ref="trackEl" class="app-subnav__capsule mat-blur-capsule">
        <span class="app-subnav__thumb glass-active-thumb" :style="thumbStyle" aria-hidden="true" />
        <NuxtLink
          v-for="(link, i) in links"
          :key="link.path"
          :ref="setItemRef(i)"
          :to="buildOrgPath(link.path)"
          class="app-subnav__pill"
          :class="{ 'app-subnav__pill--active': i === activeIndex }"
          :aria-current="i === activeIndex ? 'page' : undefined"
        >
          <Icon :name="'i-lucide-' + link.icon" class="w-4 h-4 shrink-0" />
          <span class="whitespace-nowrap">{{ link.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
// NO top-level await in this component, deliberately. `useSlidingThumb` and
// `useChromeHeight` register lifecycle hooks, and a composable that does so has
// to be called before any await in setup or it runs without an active
// component instance — which took every workspace page to a 500 the first time
// this bar was rewritten. The role checks therefore come from the synchronous
// useNavContext instead of awaiting useSelectedOrg().
import { toAppDef } from "#core/app/composables/useAppNav";

const { activeKeyFor } = useAppNav();
const { sectionLinksFor, activeLinkIndex, buildOrgPath } = useSectionNav();
const nav = useNavContext();
// Published by PageContainer so this capsule tracks the page's own column width.
const { pageWide } = usePageWidth();

// The active dock slot's pills (nav registry): an admin's sections, a board
// seat's Money. Only on an org route — every link is org-scoped (buildOrgPath),
// and the dock has no entries elsewhere.
const apps = computed(() => nav.entries.value.map(toAppDef));
const activeKey = computed(() => activeKeyFor(apps.value));
const links = computed(() => sectionLinksFor(activeKey.value));

// The most specific match (a pill's `?tab=` beats the plain page beside it).
// -1 when no child page matches (a section root): the thumb fades out in place
// rather than snapping to the first pill and claiming that one is selected.
const activeIndex = computed(() => activeLinkIndex(links.value));

const { trackEl, setItemRef, thumbStyle, measured } = useSlidingThumb(activeIndex, {
  watchSource: () => links.value.map((l) => l.label).join("|"),
});

// What sticks under the chrome reads this (theme-app.css, `--app-chrome-h`).
const stickyEl = ref<HTMLElement | null>(null);
useChromeHeight(stickyEl, "--app-subnav-h");

// The fade is earned: at rest nothing is under the capsule but the page's own
// ground (or the dashboard's backdrop, which a ground-coloured fade would band).
const scrolled = ref(false);
let frame = 0;
function onScroll() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    scrolled.value = window.scrollY > 0;
  });
}
onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  if (frame) cancelAnimationFrame(frame);
});

// At 375 px the pills outgrow the capsule: keep the selected one in view by
// scrolling the capsule itself (never the page — scrollIntoView would).
watch(
  [activeIndex, measured],
  async () => {
    await nextTick();
    const track = trackEl.value;
    const pill = track?.querySelector<HTMLElement>(".app-subnav__pill--active");
    if (!track || !pill || track.scrollWidth <= track.clientWidth) return;
    const left = pill.offsetLeft - 12;
    const right = pill.offsetLeft + pill.offsetWidth + 12 - track.clientWidth;
    if (track.scrollLeft > left) track.scrollLeft = left;
    else if (track.scrollLeft < right) track.scrollLeft = right;
  },
  { flush: "post" }
);
</script>

<style scoped>
/* The sticky row is full width so it can carry the fade, but it has no fill of
   its own and lets clicks through to the content it floats over; only the
   capsule takes them. */
.app-subnav {
  top: var(--app-nav-h, 0px);
  pointer-events: none;
}
/* The fade: the page's ground, from under the top bar to nothing a little below
   the capsule, so content softens before it slides under. Neutral (the ground,
   not the tint), and drawn outside the box so it never moves the layout. */
.app-subnav::before {
  content: "";
  position: absolute;
  inset: 0 0 -1rem 0;
  background: linear-gradient(
    to bottom,
    var(--theme-bg-primary) 0%,
    color-mix(in srgb, var(--theme-bg-primary) 85%, transparent) 55%,
    transparent 100%
  );
  opacity: 0;
  transition: opacity var(--motion-base, 240ms) ease;
}
.app-subnav--scrolled::before {
  opacity: 1;
}

/* Matches PageContainer's gutters (px-4 sm:px-6). */
.app-subnav__column {
  position: relative;
  margin-inline: auto;
  width: 100%;
  padding: 0.75rem 1rem 0;
}
@media (min-width: 640px) {
  .app-subnav__column {
    padding-inline: 1.5rem;
  }
}

/* The capsule: AppSegmentedControl's track (3px inset, 2px gap, fully round),
   made to float. A neutral ground (`--theme-nav-capsule-bg`, graded with the
   text on it by audit:contrast-pairs) over a blur, a neutral hairline ring and
   lift from the solid card's tokens: no accent hue anywhere in it. */
.app-subnav__capsule {
  position: relative;
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-nav-capsule-bg) 82%, transparent);
  box-shadow:
    inset 0 0 0 1px hsl(var(--card-ring)),
    0 6px 18px -10px hsl(var(--card-shadow) / var(--card-shadow-far));
  overflow-x: auto;
  scrollbar-width: none;
  pointer-events: auto;
}
.app-subnav__capsule::-webkit-scrollbar {
  display: none;
}

.app-subnav__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  border-radius: 999px;
  transition:
    transform 400ms var(--spring),
    width 400ms var(--spring),
    opacity 200ms ease;
  pointer-events: none;
}

.app-subnav__pill {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--theme-text-tertiary);
  transition: color var(--motion-fast, 160ms) ease;
}
.app-subnav__pill:hover:not(.app-subnav__pill--active) {
  color: var(--theme-text-secondary);
}
.app-subnav__pill--active {
  color: var(--theme-text-primary);
  font-weight: 600;
}

/* Where there is no blur, and where the person asked for less transparency:
   the capsule is its solid neutral ground. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .app-subnav__capsule {
    background: var(--theme-nav-capsule-bg);
  }
}
@media (prefers-reduced-transparency: reduce) {
  .app-subnav__capsule {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background: var(--theme-nav-capsule-bg);
  }
}
/* Increase Contrast: an edge you can see, as on the other floating glass. */
@media (prefers-contrast: more) {
  .app-subnav__capsule {
    outline: 1px solid var(--theme-text-muted);
    outline-offset: -1px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-subnav__thumb {
    transition: opacity 120ms ease;
  }
  .app-subnav::before {
    transition: none;
  }
}
</style>
