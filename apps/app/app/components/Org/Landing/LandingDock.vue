<!--
  Floating macOS-style dock for the public landing (MODERN / iOS theme).
  Bottom-centered, frosted glass, rounded; app icons magnify on hover and lift.
  Cyan color story via --theme-accent-primary. Condensed on mobile (smaller
  icons, horizontal scroll, no labels). Shares its nav model with the sidebar +
  drawer via useLandingNav.
-->
<template>
  <div class="landing-dock-wrap fixed inset-x-0 bottom-4 sm:bottom-6 z-40 flex justify-center px-3 pointer-events-none">
    <nav class="landing-dock pointer-events-auto" aria-label="Site navigation">
      <ul class="landing-dock__list">
        <!-- Explore -->
        <li v-for="(link, i) in exploreLinks" :key="`e-${link.label}`" class="landing-dock__item">
          <component
            :is="link.to ? NuxtLink : 'a'"
            v-bind="link.to ? { to: link.to } : { href: link.href }"
            class="landing-dock__icon"
            :class="{ 'landing-dock__icon--solid': !glassChrome }"
            :style="accentVars(accents[i])"
            :title="link.label"
            :aria-label="link.label"
          >
            <Icon :name="link.icon || 'lucide:circle-dot'" class="landing-dock__glyph" />
            <span class="landing-dock__label">{{ link.label }}</span>
          </component>
        </li>

        <li v-if="portalLinks.length" class="landing-dock__divider" aria-hidden="true" />

        <!-- Locked member portal -->
        <li v-for="(p, i) in portalLinks" :key="`p-${p.key}`" class="landing-dock__item">
          <a
            :href="lockHref"
            class="landing-dock__icon landing-dock__icon--locked"
            :class="{ 'landing-dock__icon--solid': !glassChrome }"
            :style="accentVars(accents[portalOffset + i])"
            :title="`${p.label} · ${memberNoun.singular} portal`"
            :aria-label="`${p.label} (locked)`"
          >
            <Icon :name="p.icon" class="landing-dock__glyph" />
            <Icon name="lucide:lock" class="landing-dock__lock" />
            <span class="landing-dock__label">{{ p.label }}</span>
          </a>
        </li>

        <li class="landing-dock__divider" aria-hidden="true" />

        <!-- Account / sign-in end cap -->
        <li class="landing-dock__item">
          <a
            v-if="user"
            href="/dashboard"
            class="landing-dock__icon landing-dock__icon--avatar"
            :title="`${memberNoun.singular} portal`"
            :aria-label="`${memberNoun.singular} portal`"
          >
            <img :src="avatarSrc" :alt="displayName" class="w-full h-full object-cover rounded-full" />
            <span class="landing-dock__label">{{ memberNoun.singular }} portal</span>
          </a>
          <a
            v-else
            :href="primaryAction.href"
            class="landing-dock__icon landing-dock__icon--accent"
            :style="accentVars(accents[endCapIndex])"
            :title="primaryAction.label"
            :aria-label="primaryAction.label"
          >
            <Icon :name="primaryAction.icon" class="landing-dock__glyph" />
            <span class="landing-dock__label">{{ primaryAction.label }}</span>
          </a>
        </li>
      </ul>
    </nav>
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

const config = useRuntimeConfig();

const { user, memberNoun, lockHref, exploreLinks, portalLinks, primaryAction } = useLandingNav({
  organization: () => props.organization,
  slug: () => props.slug,
  user: () => props.user,
  hasAmenities: () => props.hasAmenities,
  hasListings: () => props.hasListings,
  hasFaq: () => props.hasFaq,
});

// Match the admin/member App/Dock: per-chip accent hues sampled from the same
// palette (gappy so neighbors contrast), and the same frosted-vs-solid chip
// treatment. Chips are laid out explore → portal → end-cap, so the accent index
// runs across all three in that order.
const { accentsForApps, palette, glassChrome } = useAppNav();
const chipCount = computed(() => exploreLinks.value.length + portalLinks.value.length + 1);
const accents = computed(() =>
  accentsForApps(
    Array.from({ length: chipCount.value }, (_, i) => ({ key: String(i) })) as any,
    palette.value
  )
);
const portalOffset = computed(() => exploreLinks.value.length);
const endCapIndex = computed(() => exploreLinks.value.length + portalLinks.value.length);
const accentVars = (a: { h: number; s: number; l: number } | undefined) =>
  a ? { "--c-h": String(a.h), "--c-s": `${a.s}%`, "--c-l": `${a.l}%` } : {};

const displayName = computed(() =>
  [props.user?.first_name, props.user?.last_name].filter(Boolean).join(" ") || "Resident"
);
const avatarSrc = computed(() => {
  if (props.user?.avatar) {
    const id = typeof props.user.avatar === "object" ? props.user.avatar.id : props.user.avatar;
    return `${config.public.directus.url}/assets/${id}?key=small`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.value)}&background=00BFFF&color=ffffff`;
});
</script>
