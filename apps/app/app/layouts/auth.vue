<script setup lang="ts">
const { user } = useDirectusAuth();

// Always initialize useSelectedOrg - it handles the case when user is not logged in
// This ensures the org data is ready when the user logs in
const { currentOrg, isAdmin, isBoardMember, memberType, selectedOrgId } =
  await useSelectedOrg();

// ── Org-forced workspace theme ──────────────────────────────────────────────
// The ORG forces the visual STYLE in the workspace (a classic org renders the
// classic palette in-app, a luxury org renders luxury, etc.) — mirroring how the
// public landing already honors `settings.theme`. The user's light/dark MODE
// preference is preserved. currentOrg is awaited above, so the org style is known
// during SSR: the html class is applied via a SINGLE reactive useHead — the one
// source of truth for the <html> class (no competing applyTheme/forceThemeStyle
// writers, which would otherwise leave both theme classes stacked).
const { themeState } = useTheme();
const VALID_STYLES = ["classic", "modern", "luxury"] as const;
const orgStyle = computed<(typeof VALID_STYLES)[number]>(() => {
  // Dev-only QA hatch (mirrors useAppVersion's ?forceUpdatePrompt): preview the
  // modern dock from a classic/luxury org without touching prod org data. Visit
  // any workspace page with ?forceModern. Read off the route query so SSR and the
  // client agree (no stacked theme classes). Stripped from prod by the dev guard.
  if (import.meta.dev && "forceModern" in useRoute().query) {
    return "modern";
  }
  const s = currentOrg.value?.organization?.settings?.theme;
  return s && (VALID_STYLES as readonly string[]).includes(s) ? s : "modern";
});

const htmlThemeClass = computed(() => {
  const base = `theme-${orgStyle.value}-${themeState.mode}`;
  return themeState.mode === "dark" ? `${base} dark` : base;
});
// This layout is the single source of the <html> theme class for the workspace.
// useOrgBranding (global, in app.vue) stands down whenever the active layout is
// `auth`, so nothing else writes the theme class here.
useHead({ htmlAttrs: { class: htmlThemeClass } });

// Keep themeState.style in sync with the org so any component reading
// useTheme().themeStyle (and the dark-class logic) matches what the CSS renders.
watchEffect(() => {
  themeState.style = orgStyle.value;
});

// On the client, load only the user's light/dark MODE (the style is org-forced).
// The reactive useHead above then re-emits the correct class — no direct DOM
// class manipulation, so nothing competes with useHead's patching.
onMounted(() => {
  let mode: "light" | "dark" | null = null;
  try {
    const stored = localStorage.getItem("design-theme");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.mode === "dark" || parsed.mode === "light") mode = parsed.mode;
    }
  } catch {
    /* ignore malformed storage */
  }
  const appearance = (user.value as any)?.appearance;
  if (appearance === "dark" || appearance === "light") mode = appearance;
  if (mode) themeState.mode = mode;
});

// Primary-nav surface: classic/luxury orgs get the persistent LEFT SIDEBAR
// (collapsible), modern keeps the floating dock. Mirrors the landing's split.
const navStyle = computed(() =>
  orgStyle.value === "modern" ? "dock" : "sidebar"
);
// Collapse state shared with AppSidebar; drives the desktop content offset.
const appNavCollapsed = useState<boolean>("appNavCollapsed", () => false);

// ── Persistent "view as member" preview (admins) ────────────────────────────
// `?as=member` is the entry point (OrgSelector menu, the view switcher); arriving
// with it flips the sticky cookie so the member preview survives navigation. A
// banner rides every workspace page while previewing, with an Exit that clears it.
const route = useRoute();
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
  <div
    class="min-h-screen bg-background flex flex-col transition-[padding] duration-[460ms] ease-[cubic-bezier(0.65,0,0.35,1)] will-change-[padding]"
    :class="
      navStyle === 'sidebar'
        ? appNavCollapsed
          ? 'lg:pl-[56px]'
          : 'lg:pl-[240px]'
        : ''
    "
  >
    <!-- Primary nav rail for classic/luxury orgs (desktop only; mobile folds
         into AppNav's sheet). Modern orgs use the floating AppDock below. -->
    <ClientOnly>
      <AppSidebar v-if="navStyle === 'sidebar'" class="hidden lg:flex" />
    </ClientOnly>

    <AppNav />

    <!-- Modern theme: secondary sub-nav bar (the section's child pages as pills).
         Classic/luxury get their sub-nav from the grouped sidebar instead. -->
    <ClientOnly>
      <AppSubNav v-if="navStyle === 'dock'" />
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

    <!-- Slim breadcrumb row beneath the header (hidden on root pages) -->
    <AppBreadcrumbs />
    <!-- Subscription warning banner -->
    <SubscriptionBanner
      v-if="currentOrg?.organization"
      :subscription-status="currentOrg.organization.subscription_status"
      :trial-ends-at="currentOrg.organization.trial_ends_at"
      :organization-name="currentOrg.organization.name"
      :is-free-account="currentOrg.organization.is_free_account"
    />
    <main class="flex-1 pb-28">
      <slot />
    </main>
    <AppFooter />

    <!-- Floating app dock (macOS-style); additive alongside the top nav.
         Modern orgs only — classic/luxury use the persistent left sidebar. -->
    <ClientOnly>
      <AppDock v-if="navStyle === 'dock'" />
    </ClientOnly>

    <!-- Slide-over Channels panel (chat as an overlay, not a full page) -->
    <ClientOnly>
      <AppChannelsPanel />
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
