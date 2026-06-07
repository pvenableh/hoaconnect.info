<!--
  Editorial left rail for the public landing (CLASSIC / LUXURY themes).
  Imitates 1033lenox.com: a slim, COLLAPSIBLE vertical rail on the light
  editorial surface. Collapsed by default so the landing reads full-bleed like
  1033 (just a chevron + login/avatar); expanded reveals the brand, the locked
  resident-portal teaser, and the access CTAs. No "explore" anchor list — the
  hero + scrolling sections carry the page. Desktop only; the caller hides it
  < lg and falls back to LandingDrawer on mobile.

  Shares its nav model with the dock + drawer via useLandingNav.
-->
<template>
  <aside
    class="landing-sidebar fixed inset-y-0 left-0 z-40 flex flex-col t-bg border-r t-border transition-[width] duration-300 ease-out"
    :class="collapsed ? 'w-14' : 'w-60'"
  >
    <!-- Collapse / expand toggle -->
    <div class="flex items-center pt-4 pb-2" :class="collapsed ? 'justify-center px-0' : 'justify-end px-4'">
      <button
        type="button"
        class="landing-sidebar__toggle"
        :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
        @click="toggle"
      >
        <Icon :name="collapsed ? 'lucide:chevron-right' : 'lucide:chevron-left'" class="w-4 h-4" />
      </button>
    </div>

    <!-- Expanded body -->
    <template v-if="!collapsed">
      <div class="px-7 pb-5">
        <a href="#top" class="block group">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="organization?.name"
            class="h-9 w-auto object-contain mb-3"
          />
          <h2 class="font-serif t-text text-2xl leading-tight tracking-tight group-hover:opacity-70 transition-opacity">
            {{ organization?.name }}
          </h2>
        </a>
        <p v-if="addressLine" class="landing-eyebrow mt-3 leading-relaxed">{{ addressLine }}</p>
      </div>

      <div class="landing-rule mx-7 mb-2" />

      <!-- Locked resident-portal teaser -->
      <nav class="flex-1 overflow-y-auto px-7 py-4">
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

      <!-- Access actions -->
      <div class="px-7 py-6 border-t t-border space-y-3">
        <a :href="primaryAction.href" class="landing-sidebar__cta">
          <Icon :name="primaryAction.icon" class="w-4 h-4" />
          {{ primaryAction.label }}
        </a>
        <template v-if="!isSignedIn">
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
    </template>

    <!-- Collapsed body: icon-only login + avatar, pinned to the bottom -->
    <template v-else>
      <div class="flex-1" />
      <div class="flex flex-col items-center gap-3 pb-6">
        <a :href="primaryAction.href" class="landing-sidebar__icon-cta" :title="primaryAction.label">
          <Icon :name="primaryAction.icon" class="w-4 h-4" />
        </a>
        <OrgLandingAvatar v-if="user" :user="user" />
      </div>
    </template>
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
  hasFaq?: boolean;
}>();

const config = useRuntimeConfig();

const {
  user,
  isSignedIn,
  memberNoun,
  lockHref,
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
  hasFaq: () => props.hasFaq,
});

// Collapse state shared with PublicLanding (drives the page's desktop offset).
// Default collapsed so the landing opens full-bleed like 1033lenox.com.
const collapsed = useState<boolean>("landingNavCollapsed", () => true);
const toggle = () => {
  collapsed.value = !collapsed.value;
  if (import.meta.client) localStorage.setItem("landingNavCollapsed", collapsed.value ? "1" : "0");
};
onMounted(() => {
  const stored = localStorage.getItem("landingNavCollapsed");
  if (stored != null) collapsed.value = stored === "1";
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
