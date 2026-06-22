<!--
  Glass side drawer for the public landing (imitates 1033lenox.com's NavDrawer).
  A frosted hamburger button (top-right) slides in a right-hand panel with:
    • Explore — anchors to the public landing's sections.
    • The member portal — the resident-portal sections shown as LOCKED links for
      logged-out visitors, so they sense a full portal/website behind the page.
    • Footer — log in / request access / create account (or portal when signed in).
  Closes on link click, scrim, or Escape.
-->
<template>
  <div>
    <!-- Trigger — a wide two-line mark, no background (imitates 1033lenox). -->
    <button
      type="button"
      class="landing-menu-btn"
      aria-label="Open menu"
      @click="open = true"
    >
      <span class="landing-menu-btn__lines"><span /><span /></span>
    </button>

    <Teleport to="body">
      <!-- Scrim -->
      <Transition name="landing-fade">
        <div v-if="open" class="fixed inset-0 z-[60] bg-black/40" @click="open = false" />
      </Transition>

      <!-- Panel -->
      <aside
        class="landing-drawer fixed top-0 right-0 z-[61] h-full w-[88%] max-w-sm sm:max-w-md flex flex-col text-white transition-transform duration-300 ease-out"
        :class="open ? 'translate-x-0 is-open' : 'translate-x-full'"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <span class="text-sm uppercase tracking-ultra-wide truncate">{{ organization?.name }}</span>
          <button type="button" class="landing-glass-btn w-9 h-9" aria-label="Close menu" @click="open = false">
            <Icon name="lucide:x" class="w-5 h-5" />
          </button>
        </div>

        <nav class="flex-1 overflow-y-auto px-5 py-6">
          <!-- Explore (public sections) -->
          <p class="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-white/40">Explore</p>
          <ul class="landing-drawer__list space-y-0.5">
            <li v-for="link in links" :key="link.label">
              <component
                :is="link.to ? NuxtLink : 'a'"
                v-bind="link.to ? { to: link.to } : { href: link.href }"
                class="landing-drawer__link flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] uppercase tracking-[0.18em] text-white/85 hover:bg-white/10 transition-colors"
                @click="open = false"
              >
                <Icon v-if="link.icon" :name="link.icon" class="w-4 h-4 opacity-80" />
                {{ link.label }}
              </component>
            </li>
          </ul>

          <!-- The member portal — locked, hinting the full site behind the landing.
               (PublicLanding only renders for non-members, so a logged-in viewer
               here isn't a member yet — point them at "request access".) -->
          <template v-if="portalLinks.length">
            <p class="px-3 mt-7 mb-2 text-[10px] uppercase tracking-[0.22em] text-white/40">
              {{ memberNoun.singular }} portal
            </p>
            <ul class="landing-drawer__list space-y-0.5">
              <li v-for="p in portalLinks" :key="p.key">
                <a
                  :href="lockHref"
                  class="landing-drawer__link flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] uppercase tracking-[0.18em] text-white/55 hover:text-white/80 hover:bg-white/5 transition-colors"
                  @click="open = false"
                >
                  <Icon :name="p.icon" class="w-4 h-4 opacity-60" />
                  {{ p.label }}
                  <Icon name="lucide:lock" class="w-3.5 h-3.5 ml-auto opacity-50" />
                </a>
              </li>
            </ul>
            <p class="px-3 mt-3 text-[11px] normal-case tracking-normal text-white/45 leading-relaxed">
              <template v-if="user">Request access to unlock the full {{ memberNoun.plural.toLowerCase() }} portal — documents, payments, meetings and more.</template>
              <template v-else>Sign in to unlock the full {{ memberNoun.plural.toLowerCase() }} portal — documents, payments, meetings and more.</template>
            </p>
          </template>
        </nav>

        <!-- Footer actions -->
        <div class="px-5 py-5 border-t border-white/10 space-y-2.5">
          <a
            v-if="user"
            href="/dashboard"
            class="landing-cta-primary flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full text-sm uppercase tracking-wide font-medium"
          >
            <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
            {{ memberNoun.singular }} portal
          </a>
          <template v-else>
            <a
              href="/auth/login"
              class="landing-cta-primary flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full text-sm uppercase tracking-wide font-medium"
              @click="open = false"
            >
              <Icon name="lucide:log-in" class="w-4 h-4" />
              {{ memberNoun.singular }} login
            </a>
            <div class="grid grid-cols-2 gap-2.5">
              <NuxtLink
                :to="`/${slug}/request-join`"
                class="landing-cta-secondary flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-xs uppercase tracking-wide transition-colors"
                @click="open = false"
              >
                <Icon name="lucide:key-round" class="w-3.5 h-3.5" />
                Request access
              </NuxtLink>
              <NuxtLink
                :to="`/${slug}/signup`"
                class="landing-cta-secondary flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-xs uppercase tracking-wide transition-colors"
                @click="open = false"
              >
                <Icon name="lucide:user-plus" class="w-3.5 h-3.5" />
                Create account
              </NuxtLink>
            </div>
          </template>
        </div>
      </aside>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { NuxtLink } from "#components";

const props = defineProps<{
  organization: any;
  slug: string;
  user?: any;
  hasAmenities?: boolean;
  hasListings?: boolean;
  hasFaq?: boolean;
}>();

const open = ref(false);

// Shared nav model (explore anchors, locked portal links, terminology, lockHref).
const { memberNoun, lockHref, exploreLinks: links, portalLinks } = useLandingNav({
  organization: () => props.organization,
  slug: () => props.slug,
  user: () => props.user,
  hasAmenities: () => props.hasAmenities,
  hasListings: () => props.hasListings,
  hasFaq: () => props.hasFaq,
});

// Close on Escape.
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") open.value = false;
};
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
.landing-fade-enter-active,
.landing-fade-leave-active {
  transition: opacity 0.25s ease;
}
.landing-fade-enter-from,
.landing-fade-leave-to {
  opacity: 0;
}

/* Menu links use the default sans (kept legible at small sizes); the editorial
   serif is reserved for headings/eyebrows, not nav links. */

/* Wide two-line menu mark — no background; color flips to dark via the header's
   --scrolled rule (LandingNav) when the frosted bar fades in. */
.landing-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 40px;
  background: none;
  border: 0;
  color: #fff;
  cursor: pointer;
}
.landing-menu-btn__lines {
  position: relative;
  width: 30px;
  height: 11px;
}
.landing-menu-btn__lines > span {
  position: absolute;
  left: 0;
  width: 100%;
  height: 1.5px;
  border-radius: 2px;
  background: currentColor;
  transition: transform 0.25s ease;
}
.landing-menu-btn__lines > span:nth-child(1) {
  top: 0;
}
.landing-menu-btn__lines > span:nth-child(2) {
  bottom: 0;
}

/* Footer CTAs — tinted with the org's theme accent so they match the classic
   (and luxury) look rather than a generic white pill. */
.landing-cta-primary {
  background: var(--theme-accent-primary);
  color: #fff;
}
.landing-cta-primary:hover {
  filter: brightness(1.06);
}
.landing-cta-secondary {
  border: 1px solid color-mix(in srgb, var(--theme-accent-primary) 55%, white 45%);
  color: #fff;
}
.landing-cta-secondary:hover {
  background: color-mix(in srgb, var(--theme-accent-primary) 22%, transparent);
}

/* Editorial staggered entrance — mirrors 1033lenox.com's NavDrawer: items
   start nudged right + faded, then settle one after another once the panel
   is open. */
.landing-drawer__list > li {
  opacity: 0;
  transform: translateX(36px);
  transition:
    opacity 0.4s cubic-bezier(0.23, 1, 0.32, 1),
    transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-drawer.is-open .landing-drawer__list > li {
  opacity: 1;
  transform: translateX(0);
}
.landing-drawer.is-open .landing-drawer__list > li:nth-child(1) { transition-delay: 0.05s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(2) { transition-delay: 0.08s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(3) { transition-delay: 0.11s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(4) { transition-delay: 0.14s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(5) { transition-delay: 0.17s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(6) { transition-delay: 0.20s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(7) { transition-delay: 0.23s; }
.landing-drawer.is-open .landing-drawer__list > li:nth-child(8) { transition-delay: 0.26s; }

@media (prefers-reduced-motion: reduce) {
  .landing-drawer__list > li {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
