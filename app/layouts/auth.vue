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
  <div class="ui-kit min-h-screen bg-background flex flex-col">
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
    <main class="flex-1 pb-28">
      <slot />
    </main>
    <AppFooter />

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
