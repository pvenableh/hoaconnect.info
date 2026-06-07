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
    <!-- Trigger -->
    <button
      type="button"
      class="landing-glass-btn w-10 h-10"
      aria-label="Open menu"
      @click="open = true"
    >
      <Icon name="lucide:menu" class="w-5 h-5" />
    </button>

    <Teleport to="body">
      <!-- Scrim -->
      <Transition name="landing-fade">
        <div v-if="open" class="fixed inset-0 z-[60] bg-black/40" @click="open = false" />
      </Transition>

      <!-- Panel -->
      <aside
        class="landing-drawer fixed top-0 right-0 z-[61] h-full w-[82%] max-w-xs flex flex-col text-white transition-transform duration-300 ease-out"
        :class="open ? 'translate-x-0' : 'translate-x-full'"
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
          <ul class="space-y-1">
            <li v-for="link in links" :key="link.label">
              <component
                :is="link.to ? NuxtLink : 'a'"
                v-bind="link.to ? { to: link.to } : { href: link.href }"
                class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-wide text-white/85 hover:bg-white/10 transition-colors"
                @click="open = false"
              >
                <Icon :name="link.icon" class="w-4 h-4 opacity-80" />
                {{ link.label }}
              </component>
            </li>
          </ul>

          <!-- The member portal (locked for logged-out visitors) -->
          <template v-if="!user && portalLinks.length">
            <p class="px-3 mt-7 mb-2 text-[10px] uppercase tracking-[0.22em] text-white/40">
              {{ memberNoun.singular }} portal
            </p>
            <ul class="space-y-1">
              <li v-for="p in portalLinks" :key="p.key">
                <a
                  href="/auth/login"
                  class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-wide text-white/55 hover:text-white/80 hover:bg-white/5 transition-colors"
                  @click="open = false"
                >
                  <Icon :name="p.icon" class="w-4 h-4 opacity-60" />
                  {{ p.label }}
                  <Icon name="lucide:lock" class="w-3.5 h-3.5 ml-auto opacity-50" />
                </a>
              </li>
            </ul>
            <p class="px-3 mt-3 text-[11px] normal-case tracking-normal text-white/45 leading-relaxed">
              Sign in to unlock the full {{ memberNoun.plural.toLowerCase() }} portal — documents,
              payments, meetings and more.
            </p>
          </template>
        </nav>

        <!-- Footer actions -->
        <div class="px-5 py-5 border-t border-white/10 space-y-2.5">
          <a
            v-if="user"
            href="/dashboard"
            class="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full bg-white text-gray-900 text-sm uppercase tracking-wide font-medium"
          >
            <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
            {{ memberNoun.singular }} portal
          </a>
          <template v-else>
            <a
              href="/auth/login"
              class="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full bg-white text-gray-900 text-sm uppercase tracking-wide font-medium"
              @click="open = false"
            >
              <Icon name="lucide:log-in" class="w-4 h-4" />
              {{ memberNoun.singular }} login
            </a>
            <div class="grid grid-cols-2 gap-2.5">
              <NuxtLink
                :to="`/${slug}/request-join`"
                class="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full border border-white/30 text-white text-xs uppercase tracking-wide hover:bg-white/10 transition-colors"
                @click="open = false"
              >
                <Icon name="lucide:key-round" class="w-3.5 h-3.5" />
                Request access
              </NuxtLink>
              <NuxtLink
                :to="`/${slug}/signup`"
                class="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full border border-white/30 text-white text-xs uppercase tracking-wide hover:bg-white/10 transition-colors"
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
import { orgMemberNoun } from "~~/shared/utils/terminology";

const props = defineProps<{
  organization: any;
  slug: string;
  user?: any;
  hasAmenities?: boolean;
  hasListings?: boolean;
}>();

const open = ref(false);
const memberNoun = computed(() => orgMemberNoun(props.organization?.type));

// Public landing anchors.
const links = computed(() => {
  const out: Array<{ label: string; icon: string; to?: string; href?: string }> = [
    { label: "Home", icon: "lucide:home", href: "#top" },
  ];
  if (props.hasAmenities) out.push({ label: "Amenities", icon: "lucide:sparkles", href: "#amenities" });
  if (props.hasListings) out.push({ label: "Listings", icon: "lucide:home", href: "#listings" });
  if (props.organization?.show_board !== false)
    out.push({ label: "Board", icon: "lucide:users", to: `/${props.slug}/board` });
  out.push({ label: "Contact", icon: "lucide:mail", href: "#contact" });
  return out;
});

// Resident-portal sections, shown locked. Filtered to the modules the org has
// enabled (missing/null = enabled, mirroring useModules). Home is always shown.
const PORTAL: Array<{ label: string; icon: string; key: string }> = [
  { label: "Dashboard", icon: "lucide:layout-dashboard", key: "home" },
  { label: "Announcements", icon: "lucide:megaphone", key: "announcements" },
  { label: "Documents", icon: "lucide:file-text", key: "documents" },
  { label: "Meetings", icon: "lucide:calendar-days", key: "meetings" },
  { label: "Payments", icon: "lucide:credit-card", key: "payments" },
  { label: "Requests", icon: "lucide:clipboard-list", key: "requests" },
  { label: "Rules", icon: "lucide:scale", key: "rules" },
  { label: "Polls", icon: "lucide:bar-chart-3", key: "polls" },
  { label: "Directory", icon: "lucide:users-round", key: "directory" },
];
const moduleOn = (key: string): boolean => {
  if (key === "home" || key === "dashboard") return true;
  const m = props.organization?.modules;
  if (!m || typeof m !== "object") return true;
  const v = m[key];
  return v === undefined || v === null ? true : v !== false;
};
const portalLinks = computed(() => PORTAL.filter((p) => moduleOn(p.key)));

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
</style>
