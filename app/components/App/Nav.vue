<script setup lang="ts">
import { toast } from "vue-sonner";

const { user, logout } = useDirectusAuth();
const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// HOA Connect staff (App Admin, Platform Support) get a way into /ops.
const { isAppAdmin: isStaffAppAdmin, isPlatformSupport } = useRoles();
const canOpenOps = computed(() => isStaffAppAdmin.value || isPlatformSupport.value);

// The bar's height, for what sticks under it (the section capsule first). Before
// the await below: useChromeHeight registers lifecycle hooks.
const navEl = ref<HTMLElement | null>(null);
useChromeHeight(navEl, "--app-nav-h");

// Check if we're on an organization page (slug route)
const isOnOrgPage = computed(() => !!route.params.slug);


// Get active HOA for public org pages (when viewing /my-org)
const { activeHoa } = useActiveHoa();

// Check if we're on the main marketing domain (not org page)
const isMainMarketingDomain = computed(
  () => !isOnOrgPage.value
);

// On a verified custom domain (an org's own domain, e.g. 605lincolnroad.com) the
// account/profile page belongs to the shared HOA Connect app — opening it inline
// is confusing because it swaps in the app chrome. When on a custom domain we
// send "My profile" to the main app domain in a new tab, so it's unmistakably
// "your HOA Connect account" rather than part of the org's branded site.
// Host-derived (domain-detector.global): true only when the browser is actually
// on the org's own domain, not when the main app host serves a /{slug} route.
const onCustomDomainHost = useState<boolean>("isCustomDomain", () => false);
const isCustomDomain = computed(
  () => onCustomDomainHost.value && isOnOrgPage.value
);
const accountUrl = computed(() => `${config.public.appUrl}/account`);

// Get current organization, role, and member details for logged-in users
const {
  currentOrg,
  isAdmin,
  isMember,
  isBoardMember,
  boardTitleDisplay,
  memberType,
} = user.value
  ? await useSelectedOrg()
  : {
      currentOrg: ref(null),
      isAdmin: ref(false),
      isMember: ref(false),
      isBoardMember: ref(false),
      boardTitleDisplay: ref(null),
      memberType: ref(null),
    };

// Get current domain access - checks if user is admin/member of the org they're VIEWING
// This is critical for security: prevents showing admin UI to users who are admins
// of a different org than the one they're currently viewing
const {
  isAdminOfCurrentDomain,
  isMemberOfCurrentDomain,
  isBoardMemberOfCurrentDomain,
  isPropertyManagerOfCurrentDomain,
} = useCurrentDomainAccess();

// Per-org module toggles (gate optional member-facing nav links).
const { isEnabled: isModuleEnabled } = useModules();

// Messages is its own button in the header, with its own badge (Session 18,
// option A); the assistant opens from the avatar's menu (App/AccountMenu.vue,
// plan §2.4 "One account menu"), and its waiting actions feed the avatar's
// badge. Channels: admins, active board members, and any member invited into
// at least one channel.
const channelUnread = useChannelUnread();
channelUnread.watchLive();
onMounted(() => channelUnread.refresh());
const channelsPanel = useChannelsPanel();
const messagesBadge = computed(() => {
  const n = channelUnread.total.value;
  return n > 0 ? (n > 9 ? "9+" : String(n)) : null;
});
const messagesLabel = computed(() => {
  const n = channelUnread.total.value;
  return n > 0 ? `Messages, ${n} unread` : "Messages";
});
// The assistant: staff only (admin / board / property manager). Its actions
// awaiting review count toward the badge.
const aiPendingCount = useAiPendingCount();
const spotlight = useSpotlight();

// ── The page title, handed up on scroll (usePageTitle) ──────────────────────
// In the workspace the large title lives in the shell's outlet; once it scrolls
// under this bar, the bar's centre carries a compact copy where the org mark
// was, and the bar earns its bottom hairline — a static rule under an
// unscrolled page is chrome for its own sake. Outside the workspace (no
// outlet) the bar keeps its permanent rule.
const { pageTitle, collapsed: titleCollapsed, hasOutlet, visible: hasPageTitle } = usePageTitle();
const showChromeTitle = computed(() => hasOutlet.value && titleCollapsed.value && hasPageTitle.value);
const earnedRule = computed(() => hasOutlet.value);
const scrollToTop = () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
};
// "⌘K" on Apple platforms, "Ctrl K" elsewhere — the hint should name the key
// the user actually has. Client-only (navigator), so SSR renders the neutral form.
const spotlightShortcut = ref("Ctrl K");
onMounted(() => {
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) spotlightShortcut.value = "⌘K";
});
const { hasChannelMembership, refresh: refreshChannelAccess } = useChannelAccess();
onMounted(refreshChannelAccess);
watch(() => route.params.slug, refreshChannelAccess);
const showChat = computed(
  () =>
    !!user.value &&
    isOnOrgPage.value &&
    isModuleEnabled("channels") &&
    (isAdminOfCurrentDomain.value ||
      isBoardMemberOfCurrentDomain.value ||
      hasChannelMembership.value)
);

// Persistent "view as member" preview — an admin previewing the resident view
// sees the member UI everywhere (not just the clean root).
const { isPreviewingMember } = useViewAs();

// AI assistant launcher visibility: staff (admin / board / PM) on an org page,
// not while previewing the member view. The panel itself further hides when AI
// isn't configured for the environment.
const showAssistant = computed(
  () =>
    !!user.value &&
    isOnOrgPage.value &&
    !isPreviewingMember.value &&
    (isAdminOfCurrentDomain.value ||
      isBoardMemberOfCurrentDomain.value ||
      isPropertyManagerOfCurrentDomain.value)
);

// Keep the AI-review badge fresh for staff who can act on them.
const selectedOrgIdForAi = useState<string | null>("selectedOrgId", () => null);
async function refreshAiPending() {
  if (!showAssistant.value || !selectedOrgIdForAi.value) return;
  try {
    const r = await $fetch<{ count: number }>("/api/ai/actions/pending-count", {
      query: { orgId: selectedOrgIdForAi.value },
    });
    aiPendingCount.value = r.count ?? 0;
  } catch {
    /* leave as-is */
  }
}
onMounted(refreshAiPending);
watch([showAssistant, selectedOrgIdForAi], refreshAiPending);

// Determine the appropriate user status badge for current context
const contextAwareStatusBadge = computed(() => {
  // On org context, use current domain membership info
  if (isOnOrgPage.value) {
    if (isAdminOfCurrentDomain.value) return "Admin";
    if (isBoardMemberOfCurrentDomain.value) return "Board Member";
    if (isMemberOfCurrentDomain.value) return "Member";
    // User is not a member of this org - don't show any badge
    return null;
  }

  // On main domain, use selected org info
  if (isAdmin.value) return "Admin";
  if (isBoardMember.value && boardTitleDisplay.value) {
    return boardTitleDisplay.value;
  }
  if (memberType.value === "owner") return "Owner";
  if (memberType.value === "tenant") return "Resident";
  return null;
});

// Build logo URL from Directus asset - prefer activeHoa for public pages, then currentOrg for logged-in users
const orgLogoUrl = computed(() => {
  // First check activeHoa (public org page)
  const activeLogoId = activeHoa.value?.logo;
  if (activeLogoId) {
    const fileId =
      typeof activeLogoId === "string" ? activeLogoId : activeLogoId?.id;
    if (fileId) {
      return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
    }
  }

  // Fall back to currentOrg for logged-in users
  const logoId = currentOrg.value?.organization?.settings?.logo;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?medium-contain`;
});

// Get organization name - prefer activeHoa for public pages
const orgName = computed(() => {
  if (activeHoa.value?.name) return activeHoa.value.name;
  return currentOrg.value?.organization?.name || null;
});

// Determine if we should show org branding (on org page, but NOT on main marketing domain even if logged in)
const showOrgBranding = computed(
  () => isOnOrgPage.value
);

const handleLogout = async () => {
  try {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  } catch (error) {
    toast.error("Failed to logout");
  }
};

// Legacy userStatusBadge - kept for backwards compatibility but prefer contextAwareStatusBadge
const userStatusBadge = computed(() => {
  // Use context-aware badge which properly checks current domain membership
  return contextAwareStatusBadge.value;
});

// Marketing nav items (for main domain)
const marketingNavItems = [
  { label: "Features", path: "/#features" },
  { label: "Pricing", path: "/#plans" },
];

// User avatar URL - show Directus avatar if available
const userAvatarUrl = computed(() => {
  if (user.value?.avatar) {
    return `${config.public.directus.url}/assets/${user.value.avatar}?key=small-contain`;
  }
  return null;
});

// The workspace has one chrome — the floating dock — so the dock-appearance
// settings apply everywhere there is an org context. An organization's theme no
// longer selects a nav shape (that choice dressed its public landing page, not
// the tool), which is why there is nothing here reading settings.theme.

</script>

<template>
  <nav
    ref="navEl"
    class="app-nav glass-bar sticky top-0 z-40 border-b px-4 sm:px-6"
    :class="earnedRule ? ['app-nav--earned', { 'app-nav--ruled': titleCollapsed }] : 't-border'"
    data-app-nav
  >
    <div class="max-w-7xl mx-auto py-2.5 sm:py-4">
      <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <!-- Logo / Brand — centered org identity -->
        <!-- On org page (slug route): link to org root -->
        <!-- Otherwise (main domain or custom domain): link to home -->
        <div
          class="app-nav__centre col-start-2 row-start-1 justify-self-center"
          :class="{ 'app-nav__centre--title': showChromeTitle }"
        >
        <NuxtLink
          :to="isOnOrgPage ? `/${route.params.slug}` : '/'"
          class="app-nav__brand flex min-w-0 max-w-full items-center gap-2 hover:opacity-80 transition"
          :tabindex="showChromeTitle ? -1 : undefined"
          :aria-hidden="showChromeTitle ? 'true' : undefined"
        >
          <!-- Show org logo when on org page or logged in with org logo -->
          <template v-if="showOrgBranding && orgLogoUrl">
            <!-- object-contain + a height bound makes square logos render at the
                 height and wide/horizontal logos render larger (up to the width
                 cap) without distortion. Bigger on desktop; bounded on mobile. -->
            <img
              :src="orgLogoUrl"
              :alt="orgName || 'Organization logo'"
              class="h-9 sm:h-12 max-h-12 w-auto max-w-[9rem] sm:max-w-[280px] object-contain"
            />
          </template>
          <!-- Show org name when on org page or logged in but no logo -->
          <template v-else-if="showOrgBranding && orgName">
            <span
              class="block max-w-[11rem] truncate text-sm font-semibold tracking-wider uppercase t-text sm:max-w-none sm:tracking-extra-wide"
              >{{ orgName }}</span
            >
          </template>
          <!-- Default brand for main home page -->
          <template v-else>
            <span class="text-xl font-semibold uppercase tracking-extra-wide t-text"
              ><span class="font-light">HOA</span>Connect</span
            >
          </template>
        </NuxtLink>
        <!-- The page title, once its large copy has scrolled under the bar.
             Tapping it returns to the top, as a status-bar tap does on iOS. -->
        <button
          type="button"
          class="app-nav__title"
          :tabindex="showChromeTitle ? undefined : -1"
          :aria-hidden="showChromeTitle ? undefined : 'true'"
          data-chrome-title
          @click="scrollToTop"
        >
          {{ pageTitle.title }}
        </button>
        </div>

        <!-- Org switcher — the community's round mark, top-left, at every
             width (a phone has no other way to switch). Off a community page
             it shows on a phone only: the desktop's left cell carries the
             marketing links there. -->
        <div
          v-if="user"
          class="col-start-1 row-start-1 justify-self-start flex items-center gap-2"
          :class="{ 'md:hidden': isMainMarketingDomain }"
        >
          <OrgSelector />
        </div>

        <!-- Marketing Nav Links - Show on main marketing domain (even if logged in) -->
        <div v-if="isMainMarketingDomain" class="col-start-1 row-start-1 justify-self-start hidden md:flex gap-6">
          <a
            v-for="item in marketingNavItems"
            :key="item.path"
            :href="item.path"
            class="t-text-secondary hover:t-text transition uppercase text-xs tracking-wider"
          >
            {{ item.label }}
          </a>
        </div>

        <!-- User Menu (Authenticated): + New, Search, and the avatar, which
             carries notifications, messages and the assistant in one menu with
             one badge (plan §2.4, "One account menu"). -->
        <div v-if="user" class="col-start-3 row-start-1 justify-self-end flex items-center gap-0 sm:gap-2">
          <!-- "+ New": the create verbs this viewer may run here (useCreateVerbs).
               Renders nothing for members. On a phone it lives in the dock's
               Apps card instead. -->
          <ClientOnly>
            <div v-if="isOnOrgPage" class="hidden sm:flex">
              <AppCreateMenu />
            </div>
          </ClientOnly>

          <!-- Spotlight (⌘K) — search records, jump anywhere in the workspace, or
               (for the assistant's audience) ask it a question:
               a labelled field-like pill from sm, a plain glyph on a phone. -->
          <button
            v-if="isOnOrgPage"
            type="button"
            class="hidden sm:inline-flex items-center gap-2 header-pill header-pill--wide app-nav__search"
            :title="`${showAssistant ? 'Search or ask the assistant' : 'Search'} (${spotlightShortcut})`"
            :aria-label="showAssistant ? 'Search or ask the assistant' : 'Search'"
            aria-keyshortcuts="Meta+K Control+K"
            data-spotlight-trigger
            @click="spotlight.open()"
          >
            <Icon name="i-lucide-search" class="w-4 h-4 shrink-0" />
            <span class="text-sm">{{ showAssistant ? "Search or ask" : "Search" }}</span>
            <kbd class="app-nav__kbd text-xs">{{ spotlightShortcut }}</kbd>
          </button>
          <button
            v-if="isOnOrgPage"
            type="button"
            class="inline-grid place-items-center sm:hidden app-nav__icon-btn"
            :aria-label="showAssistant ? 'Search or ask the assistant' : 'Search'"
            @click="spotlight.open()"
          >
            <Icon name="i-lucide-search" class="w-5 h-5" />
          </button>

          <!-- Messages: its own door and its own badge (unread messages), at
               every width, between Search and the avatar (asked 2026-11-19,
               Session 18; option A). Opens the Channels slide-over. A round
               pill from sm, a 44px glyph on a phone. Client-only: the unread
               count and channel access are client state. -->
          <ClientOnly>
            <template v-if="showChat">
              <button
                type="button"
                class="hidden sm:inline-grid place-items-center header-pill app-nav__msg"
                :class="{ 'is-active': channelsPanel.isOpen.value }"
                :aria-label="messagesLabel"
                :aria-expanded="channelsPanel.isOpen.value"
                data-messages-trigger
                @click="channelsPanel.open()"
              >
                <Icon name="i-lucide-messages-square" class="w-4 h-4" />
                <span v-if="messagesBadge" class="app-nav__badge text-[0.625rem]" aria-hidden="true">{{ messagesBadge }}</span>
              </button>
              <button
                type="button"
                class="inline-grid place-items-center sm:hidden app-nav__icon-btn app-nav__msg"
                :aria-label="messagesLabel"
                :aria-expanded="channelsPanel.isOpen.value"
                @click="channelsPanel.open()"
              >
                <Icon name="i-lucide-messages-square" class="w-5 h-5" />
                <span v-if="messagesBadge" class="app-nav__badge text-[0.625rem]" aria-hidden="true">{{ messagesBadge }}</span>
              </button>
            </template>
          </ClientOnly>

          <ClientOnly>
            <AppAccountMenu
              :user="user"
              :avatar-url="userAvatarUrl"
              :status-badge="userStatusBadge"
              :is-on-org-page="isOnOrgPage"
              :is-custom-domain="isCustomDomain"
              :account-url="accountUrl"
              :can-open-ops="canOpenOps"
              :show-notifications="isOnOrgPage"
              :show-assistant="showAssistant"
              :assistant-pending="aiPendingCount"
              @logout="handleLogout"
            />
          </ClientOnly>
        </div>

        <!-- Public User Menu -->
        <div v-else class="col-start-3 row-start-1 justify-self-end flex items-center gap-4">
          <NuxtLink
            to="/auth/login"
            class="t-text-secondary hover:t-text uppercase text-xs tracking-wider"
          >
            Login
          </NuxtLink>
          <!-- Hide Get Started on org pages -->
          <Button
            v-if="!isOnOrgPage"
            as-child
            class="uppercase font-body tracking-widest text-xs"
          >
            <NuxtLink to="/setup"> Get Started </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Mobile Nav (Marketing) - Show on main marketing domain (even if logged in) -->
      <div v-if="isMainMarketingDomain" class="md:hidden flex gap-4 mt-4">
        <a
          v-for="item in marketingNavItems"
          :key="item.path"
          :href="item.path"
          class="flex-1 text-center py-2 text-sm hover:t-bg-subtle rounded"
        >
          {{ item.label }}
        </a>
      </div>

    </div>
  </nav>
</template>

<style scoped>
/* The earned rule: in the workspace the hairline appears only once content is
   scrolling under the bar. `border-b` stays on so the box never changes size —
   only the colour moves. */
.app-nav--earned {
  border-bottom-color: transparent;
  transition: border-bottom-color var(--motion-base, 240ms) ease;
}
.app-nav--earned.app-nav--ruled {
  border-bottom-color: var(--theme-border-primary);
}

/* The centre cell holds the org mark and the page title in ONE grid cell, so
   they cross-fade in place and the cell is as wide as the wider of the two. */
.app-nav__centre {
  display: grid;
  /* Never wider than its cell: on a phone the cell is what the switcher and
     the three buttons leave, and the name truncates inside it. */
  grid-template-columns: minmax(0, 100%);
  max-width: 100%;
  align-items: center;
  justify-items: center;
  min-width: 0;
}
.app-nav__centre > * {
  grid-area: 1 / 1;
}
.app-nav__brand,
.app-nav__title {
  transition:
    opacity var(--motion-base, 240ms) var(--spring),
    transform var(--motion-base, 240ms) var(--spring);
}
.app-nav__title {
  max-width: min(60vw, 28rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--theme-text-primary);
  background: transparent;
  border: 0;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
}
.app-nav__centre--title .app-nav__title {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.app-nav__centre--title .app-nav__brand {
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-nav__brand,
  .app-nav__title {
    transition: none;
  }
}

/* Search: a field-like pill with the shortcut in it, from sm. */
.app-nav__search {
  min-width: 12rem;
  padding-inline: 0.75rem 0.375rem;
  justify-content: flex-start;
}
.app-nav__kbd {
  margin-left: auto;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.375rem;
  background: var(--theme-bg-secondary);
  color: var(--theme-text-tertiary);
  font-family: inherit;
  font-weight: 600;
}
/* The phone's search glyph: a 44px target, no pill. */
/* (Display comes from the Tailwind classes, so `sm:hidden` keeps working.) */
.app-nav__icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  color: var(--theme-text-secondary);
}
.app-nav__icon-btn:hover {
  color: var(--theme-text-primary);
}
.app-nav__icon-btn:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: -4px;
}

/* Messages: the badge sits on the glyph's corner, like the avatar's. */
.app-nav__msg {
  position: relative;
}
.app-nav__badge {
  position: absolute;
  top: -0.25rem;
  right: -0.375rem;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--destructive);
  color: var(--destructive-foreground);
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--theme-bg-elevated);
  pointer-events: none;
  animation: badge-pop var(--motion-base, 240ms) var(--spring) both;
}
/* On a phone the glyph is in a 44px target: tuck the badge onto the glyph. */
.app-nav__icon-btn .app-nav__badge {
  top: 0.25rem;
  right: 0.125rem;
}
@media (prefers-reduced-motion: reduce) {
  .app-nav__badge {
    animation: none;
  }
}
</style>
