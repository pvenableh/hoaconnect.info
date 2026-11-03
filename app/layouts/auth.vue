<script setup lang="ts">
const { user } = useDirectusAuth();

// Always initialize useSelectedOrg - it handles the case when user is not logged in
// This ensures the org data is ready when the user logs in
const { currentOrg, isAdmin, isBoardMember, memberType, selectedOrgId } =
  await useSelectedOrg();

// ── The workspace theme ─────────────────────────────────────────────────────
// The workspace is ONE branded surface. It no longer takes its visual style from
// the organization — an org's classic/luxury/modern choice dresses its PUBLIC
// landing page, not the tool its board logs into. `theme-app` is pinned here and
// only light/dark varies, which is what useWorkspaceAppearance owns (including
// the pre-paint script that stops dark-mode users seeing a white flash).
useWorkspaceAppearance();

// Drag from the left edge to go back, matching the pop transition the route
// middleware already plays. No-ops in an installed PWA (iOS provides its own
// and they would double up) and under reduced motion.
useEdgeSwipeBack();

// Route captured ONCE at setup. Never call useRoute() inside a computed getter —
// on re-evaluation the getter runs outside a setup/Nuxt context and throws
// "composable that requires the Nuxt instance was called outside setup".
const route = useRoute();

// ── Immersive pages (Channels) ──────────────────────────────────────────────
// A page that owns the whole viewport and scrolls internally sets
// `definePageMeta({ immersive: true })`: the shell pins to h-dvh, the footer
// hides, and the dock STAYS — it used to take a separate `channels` layout
// that dropped the dock, which left the surface people keep open longest with
// no way across to the rest of the app. The page pads its foot for the
// floating dock (md and up; below md the App Library replaces the dock).
const immersive = computed(() => !!route.meta.immersive);
const { dockPosition, showLabels } = useAppNav();
// The page title lives in the shell (AppHeaderOutlet, below); this hands it to
// the Nav as it scrolls under the chrome, and earns the Nav its hairline.
useTitleCollapse();

const immersiveDockPad = computed(() =>
  immersive.value && dockPosition.value === "bottom"
    ? showLabels.value
      ? "app-main--dock-pad-labels"
      : "app-main--dock-pad"
    : null
);

// ── Persistent "view as member" preview (admins) ────────────────────────────
// `?as=member` is the entry point (OrgSelector menu, the view switcher); arriving
// with it flips the sticky cookie so the member preview survives navigation. A
// banner rides every workspace page while previewing, with an Exit that clears it.
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isPreviewingMember, setViewAs } = useViewAs();
watchEffect(() => {
  if (route.query.as === "member" && isAdminOfCurrentDomain.value) {
    setViewAs("member");
  }
});
const showMemberPreviewBanner = computed(
  () => isAdminOfCurrentDomain.value && isPreviewingMember.value
);
const exitMemberPreview = () => {
  setViewAs("admin");
  // Drop the `?as=member` query so the entry watcher doesn't re-enable it.
  const slug = route.params.slug as string | undefined;
  navigateTo(slug ? `/${slug}` : "/dashboard");
};

// Unified notification system
const { fetchNotifications, notifications } = useNotifications();

// Mirror the unread count onto the installed app's icon. Here rather than in a
// component: the service worker raises the badge blind when a push lands with
// no page open, and an open page is the only thing that knows the real number —
// so wherever a page IS open, it corrects the worker's guess. Once, high up, or
// several components would write the same number on every change.
useAppBadge().trackUnread();

// Build audience filter based on member type and role
const audienceFilter = computed(() => {
  const audiences: string[] = ["all"];

  if (memberType.value === "owner") {
    audiences.push("owners");
  } else if (memberType.value === "tenant") {
    audiences.push("tenants");
  }

  if (isBoardMember.value || isAdmin.value) {
    audiences.push("board members");
  }

  return audiences;
});

// Fetch notifications on mount and when org changes
const loadNotifications = async () => {
  if (!user.value || !selectedOrgId.value) return;

  try {
    await fetchNotifications(audienceFilter.value);
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
  }
};

// Watch for org changes
watch(
  () => selectedOrgId.value,
  () => {
    loadNotifications();
  }
);

onMounted(() => {
  loadNotifications();
});
</script>

<template>
  <div
    class="ui-kit bg-background flex flex-col"
    :class="immersive ? 'h-dvh overflow-hidden' : 'min-h-screen'"
  >
    <AppNav />

    <!-- Secondary sub-nav: the section's child pages as pills. -->
    <ClientOnly>
      <AppSubNav />
    </ClientOnly>

    <!-- Persistent "previewing member view" banner (admins only) — rides every
         workspace page while the sticky member preview is active. -->
    <div
      v-if="showMemberPreviewBanner"
      class="flex items-center justify-center gap-3 px-4 py-2 text-center text-sm font-medium text-white"
      style="background: var(--theme-accent-primary)"
    >
      <Icon name="i-lucide-eye" class="size-4 shrink-0" />
      Previewing the member view
      <button
        type="button"
        class="underline underline-offset-2 hover:opacity-90"
        @click="exitMemberPreview"
      >
        Exit
      </button>
    </div>

    <!-- Breadcrumbs removed: the secondary sub-nav bar carries the "where am I"
         context, so a separate crumb row is redundant clutter. Detail pages keep
         their own headers. -->
    <!-- Subscription warning banner -->
    <SubscriptionBanner
      v-if="currentOrg?.organization"
      :subscription-status="currentOrg.organization.subscription_status"
      :trial-ends-at="currentOrg.organization.trial_ends_at"
      :organization-name="currentOrg.organization.name"
      :is-free-account="currentOrg.organization.is_free_account"
      :grace-ends-at="currentOrg.organization.grace_ends_at"
    />
    <!-- The page's ONE title. Here — outside <slot />, so it survives every
         navigation and changes in place while the page slides — and pages
         register into it with <AppPageHeader> (composables/usePageTitle.ts). -->
    <AppHeaderOutlet />

    <main
      class="flex-1"
      :class="immersive ? ['min-h-0', immersiveDockPad] : 'pb-12 md:pb-28'"
    >
      <slot />
    </main>
    <AppFooter v-if="!immersive" />

    <!-- Floating app dock (macOS-style); additive alongside the top nav. -->
    <ClientOnly>
      <AppDock />
    </ClientOnly>

    <!-- Slide-over Channels panel (chat as an overlay, not a full page) -->
    <ClientOnly>
      <AppChannelsPanel />
    </ClientOnly>

    <!-- Slide-over AI assistant panel (contextual chat as an overlay) -->
    <ClientOnly>
      <AiAssistantPanel />
    </ClientOnly>

    <!-- Spotlight (⌘K): one host per workspace layout; the Nav search pill,
         the shortcut and the mobile menu all drive it via useSpotlight(). -->
    <ClientOnly>
      <AppSpotlight />
    </ClientOnly>

    <!-- Global slide-over detail-panel stack (?slide=type:id) — the single
         mount; pages open panels via useAppSlideOver(type).open(id). -->
    <ClientOnly>
      <AppSlideOverStack />
    </ClientOnly>

    <!-- Admin "view as" switcher (workspace · member · public landing) -->
    <ClientOnly>
      <OrgViewSwitcher />
    </ClientOnly>

    <!-- "New version available" prompt — detects a fresh deploy and offers refresh -->
    <ClientOnly>
      <AppUpdatePrompt />
    </ClientOnly>

    <!-- The other half of that handoff: once the refresh lands on a new release
         line, this shows what the refresh was for. Silent otherwise. -->
    <ClientOnly>
      <AppWhatsNew />
    </ClientOnly>

    <!-- Global Notification Components -->
    <ClientOnly>
      <NotificationSheet />
      <NotificationToast
        v-if="notifications.length > 0"
        :initial-delay="1500"
        :max-title-length="50"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
/* Immersive pages run to the foot of the viewport; at md and up the floating
   dock sits over that foot, so the page stops above it (pill + its offset). */
@media (min-width: 768px) {
  .app-main--dock-pad {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
  .app-main--dock-pad-labels {
    padding-bottom: calc(6.5rem + env(safe-area-inset-bottom));
  }
}
</style>
