<!--
  Editorial left sidebar for the public landing (CLASSIC / LUXURY themes).
  Imitates 1033lenox.com: a slim, persistent, always-visible vertical rail on the
  light editorial surface — Bauer Bodoni (font-serif) brand, ultra-wide tracked
  labels, hairline rules, dark t-text ink (NOT the dark glass drawer). Desktop
  only; the caller hides it < lg and falls back to LandingDrawer on mobile.

  Shares its nav model with the dock + drawer via useLandingNav.
-->
<template>
  <aside class="landing-sidebar fixed inset-y-0 left-0 z-40 w-60 flex flex-col t-bg border-r t-border">
    <!-- Brand -->
    <div class="px-7 pt-8 pb-6">
      <a href="#top" class="block group">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="organization?.name"
          class="h-10 w-auto object-contain mb-3"
        />
        <h2 class="font-serif t-text text-2xl leading-tight tracking-tight group-hover:opacity-70 transition-opacity">
          {{ organization?.name }}
        </h2>
      </a>
      <p v-if="addressLine" class="landing-eyebrow mt-3 leading-relaxed">{{ addressLine }}</p>
    </div>

    <div class="landing-rule mx-7 mb-2" />

    <!-- Explore + locked portal -->
    <nav class="flex-1 overflow-y-auto px-7 py-4">
      <p class="landing-eyebrow mb-3">Explore</p>
      <ul class="space-y-0.5 mb-8">
        <li v-for="link in exploreLinks" :key="link.label">
          <component
            :is="link.to ? NuxtLink : 'a'"
            v-bind="link.to ? { to: link.to } : { href: link.href }"
            class="landing-sidebar__link"
          >
            <Icon :name="link.icon" class="w-4 h-4 opacity-50" />
            {{ link.label }}
          </component>
        </li>
      </ul>

      <template v-if="portalLinks.length">
        <p class="landing-eyebrow mb-3">{{ memberNoun.singular }} portal</p>
        <ul class="space-y-0.5">
          <li v-for="p in portalLinks" :key="p.key">
            <a :href="lockHref" class="landing-sidebar__link landing-sidebar__link--locked">
              <Icon :name="p.icon" class="w-4 h-4 opacity-40" />
              {{ p.label }}
              <Icon name="lucide:lock" class="w-3 h-3 ml-auto opacity-40" />
            </a>
          </li>
        </ul>
        <p class="mt-4 text-[11px] leading-relaxed t-text-muted">{{ portalIntro }}</p>
      </template>
    </nav>

    <!-- Footer actions -->
    <div class="px-7 py-6 border-t t-border space-y-3">
      <a
        v-if="isSignedIn"
        :href="primaryAction.href"
        class="landing-sidebar__cta"
      >
        <Icon :name="primaryAction.icon" class="w-4 h-4" />
        {{ primaryAction.label }}
      </a>
      <template v-else>
        <a :href="primaryAction.href" class="landing-sidebar__cta">
          <Icon :name="primaryAction.icon" class="w-4 h-4" />
          {{ primaryAction.label }}
        </a>
        <NuxtLink
          v-for="a in accessActions"
          :key="a.label"
          :to="a.to"
          class="landing-sidebar__link landing-sidebar__link--action"
        >
          <Icon :name="a.icon" class="w-4 h-4 opacity-50" />
          {{ a.label }}
        </NuxtLink>
      </template>

      <div v-if="user" class="pt-2">
        <OrgLandingAvatar :user="user" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { NuxtLink } from "#components";
import OrgLandingAvatar from "./LandingAvatar.vue";

const props = defineProps<{
  organization: any;
  slug: string;
  user?: any;
  hasAmenities?: boolean;
  hasListings?: boolean;
}>();

const config = useRuntimeConfig();

const {
  user,
  isSignedIn,
  memberNoun,
  lockHref,
  exploreLinks,
  portalLinks,
  portalIntro,
  primaryAction,
  accessActions,
} = useLandingNav({
  organization: () => props.organization,
  slug: () => props.slug,
  user: () => props.user,
  hasAmenities: () => props.hasAmenities,
  hasListings: () => props.hasListings,
});

const logoUrl = computed(() => {
  const logo = props.organization?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}`;
});

const addressLine = computed(() => {
  const o = props.organization;
  if (!o?.street_address && !o?.city) return "";
  return [o.street_address, [o.city, o.state].filter(Boolean).join(", "), o.zip]
    .filter(Boolean)
    .join("  ·  ");
});
</script>
