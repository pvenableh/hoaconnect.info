<!--
  Glass side drawer for the public landing (imitates 1033lenox.com's NavDrawer).
  A frosted hamburger button (top-right) slides in a right-hand panel of section
  links + the resident login / dashboard action. Primarily for logged-out
  visitors, but available to everyone. Closes on link click, scrim, or Escape.
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
        <div
          v-if="open"
          class="fixed inset-0 z-[60] bg-black/40"
          @click="open = false"
        />
      </Transition>

      <!-- Panel -->
      <aside
        class="landing-drawer fixed top-0 right-0 z-[61] h-full w-[80%] max-w-xs flex flex-col text-white transition-transform duration-300 ease-out"
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
        </nav>

        <div class="px-5 py-5 border-t border-white/10">
          <a
            v-if="user"
            href="/dashboard"
            class="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full bg-white text-gray-900 text-sm uppercase tracking-wide font-medium"
          >
            <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
            Resident portal
          </a>
          <a
            v-else
            href="/auth/login"
            class="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-full bg-white text-gray-900 text-sm uppercase tracking-wide font-medium"
          >
            <Icon name="lucide:log-in" class="w-4 h-4" />
            Resident login
          </a>
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
}>();

const open = ref(false);

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
