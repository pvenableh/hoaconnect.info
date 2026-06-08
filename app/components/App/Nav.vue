<script setup lang="ts">
import { toast } from "vue-sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const { user, logout } = useDirectusAuth();
const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// Mobile sheet open state
const mobileMenuOpen = ref(false);

// Check if we're on an organization page (slug route)
const isOnOrgPage = computed(() => !!route.params.slug);

// Get the current org slug from route or selectedOrg
const currentSlug = computed(() => {
  if (route.params.slug) return route.params.slug as string;
  return null;
});

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
const isMainDomain = useState<boolean>("isMainDomain", () => true);
const isCustomDomain = computed(
  () => isMainDomain.value === false && isOnOrgPage.value
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
  managerCan,
} = useCurrentDomainAccess();

// Per-org module toggles (gate optional member-facing nav links).
const { isEnabled: isModuleEnabled } = useModules();

// Channels moved off the dock into a top-nav chat button: it's chat, popped open
// as a slide-over (useChannelsPanel) over the current page. Shown to admins,
// active board members, and any member invited into at least one channel.
const channelsPanel = useChannelsPanel();
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

// Determine if admin UI should be shown
// On org context (slug route): only show if admin of THAT org
// On main domain: show based on selected org admin status
const showAdminUI = computed(() => {
  // If not logged in, never show admin UI
  if (!user.value) return false;

  // If on org context (slug route), check current domain access
  if (isOnOrgPage.value) {
    return isAdminOfCurrentDomain.value;
  }

  // On main domain, use selected org admin status
  return isAdmin.value;
});

// Property managers (not admins) see a scoped "Manage" section with only the
// areas the admin granted them.
const showManagerUI = computed(() => {
  if (!user.value || !isOnOrgPage.value) return false;
  return isPropertyManagerOfCurrentDomain.value && !isAdminOfCurrentDomain.value;
});
const managerNavItems = computed(() =>
  [
    { label: "Overview", path: buildPath("/manage"), icon: "layout-dashboard", show: true },
    { label: "Inquiries", path: buildPath("/manage/inquiries"), icon: "inbox", show: managerCan("inquiries") },
    { label: "Directory", path: buildPath("/manage/directory"), icon: "users", show: managerCan("directory") },
    { label: "Documents", path: buildPath("/documents"), icon: "file-text", show: managerCan("documents") },
    { label: "Communications", path: buildPath("/manage/communications"), icon: "mail", show: managerCan("communications") },
  ].filter((i) => i.show)
);

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

// Helper to build org-prefixed paths
const buildPath = (path: string) => {
  if (!currentSlug.value) return path;
  // Home path just goes to org root
  if (path === "/") return `/${currentSlug.value}`;
  // Other paths get prefixed
  return `/${currentSlug.value}${path}`;
};

// Check if board should be shown (defaults to true if not set)
const showBoard = computed(() => {
  // Check activeHoa for public pages, fall back to true if not set
  return activeHoa.value?.show_board !== false;
});

// Check if maintenance mode is enabled (hide public nav when true for non-admins)
const isMaintenanceMode = computed(() => {
  return activeHoa.value?.maintenance_mode === true;
});

// Should hide navigation for maintenance mode (only for non-admins)
const hideNavForMaintenance = computed(() => {
  return isMaintenanceMode.value && !isAdminOfCurrentDomain.value;
});

// Public navigation items (visible to all authenticated users)
const publicNavItems = computed(() => {
  const items = [{ label: "Home", path: buildPath("/"), icon: "home" }];

  // Only show Board link if show_board is not false
  if (showBoard.value) {
    items.push({ label: "Board", path: buildPath("/board"), icon: "award" });
  }

  items.push({
    label: "Announcements",
    path: buildPath("/announcements"),
    icon: "megaphone",
  });
  items.push({
    label: "Documents",
    path: buildPath("/documents"),
    icon: "file",
  });

  if (isModuleEnabled("vendors")) {
    items.push({ label: "Vendors", path: buildPath("/vendors"), icon: "contact" });
  }

  return items;
});

// Admin-only navigation items — derived from the SAME dock registry (useAppNav
// ADMIN_APPS) so the mobile sheet and the desktop dock can never drift apart.
// Module gating + the always-on Settings gear come through for free. Less-used
// destinations (Users, Teams, Announcements) live under Settings → People/Features.
const { appsFor } = useAppNav();
const adminNavItems = computed(() =>
  appsFor(true).map((app) => ({
    label: app.label,
    path: buildPath(app.path),
    icon: app.icon,
  }))
);

// Lower-frequency admin destinations that aren't dock icons (reached on desktop
// via dashboard launcher widgets / hub cards). Listed here so the mobile sheet
// still has a stable, complete path to them.
const adminExtraItems = computed(() =>
  [
    { label: "Requests", path: buildPath("/admin/requests"), icon: "clipboard-list", show: isModuleEnabled("requests") },
    { label: "Moderation", path: buildPath("/admin/moderation"), icon: "shield-alert", show: isModuleEnabled("moderation") },
  ].filter((i) => i.show)
);

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

// Premium gating for the Luxury theme in the avatar dropdown.
// Free accounts have full access; otherwise require an active/trial subscription.
const hasPremiumTheme = computed(() => {
  const org = currentOrg.value?.organization as any;
  if (!org) return false;
  if (org.is_free_account === true) return true;
  return ["active", "trial"].includes(org.subscription_status);
});

function handlePremiumRequired() {
  toast.info("The Luxury theme requires a premium plan");
  router.push("/settings/subscription");
}

// Close mobile menu on route change
watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false;
  }
);
</script>

<template>
  <nav class="t-bg-elevated border-b t-border px-6">
    <div class="max-w-7xl mx-auto py-4">
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <!-- Logo / Brand — centered org identity -->
        <!-- On org page (slug route): link to org root -->
        <!-- Otherwise (main domain or custom domain): link to home -->
        <NuxtLink
          :to="isOnOrgPage ? `/${route.params.slug}` : '/'"
          class="col-start-2 row-start-1 justify-self-center flex items-center gap-2 hover:opacity-80 transition"
        >
          <!-- Show org logo when on org page or logged in with org logo -->
          <template v-if="showOrgBranding && orgLogoUrl">
            <img
              :src="orgLogoUrl"
              :alt="orgName || 'Organization logo'"
              class="h-8 max-w-[150px] object-contain"
            />
          </template>
          <!-- Show org name when on org page or logged in but no logo -->
          <template v-else-if="showOrgBranding && orgName">
            <span
              class="text-sm font-semibold tracking-extra-wide uppercase t-text"
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

        <!-- Org switcher — Earnest-style avatar + dropdown, top-left. Shows for
             authenticated users off the marketing domain (which uses the left
             rail for marketing links). -->
        <div
          v-if="user && !isMainMarketingDomain"
          class="col-start-1 row-start-1 justify-self-start hidden sm:flex"
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

        <!-- User Menu (Authenticated) -->
        <div v-if="user" class="col-start-3 row-start-1 justify-self-end flex items-center gap-4">
          <!-- Channels quick-peek (chat) — admins, board, and channel-invited members -->
          <button
            v-if="showChat"
            type="button"
            class="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full hover:t-bg-subtle transition"
            title="Channels"
            aria-label="Open channels"
            @click="channelsPanel.toggle()"
          >
            <Icon name="i-lucide-messages-square" class="w-5 h-5 t-text-secondary" />
          </button>
          <!-- Notification Bell - show on org pages/custom domains -->
          <NotificationBell
            v-if="!isMainMarketingDomain"
            class="hidden sm:block"
          />
          <!-- Avatar dropdown (desktop) -->
          <DropdownMenu>
            <DropdownMenuTrigger
              class="hidden sm:block rounded-full transition hover:opacity-80 focus:outline-none"
              title="Account menu"
            >
              <Avatar>
                <AvatarImage
                  v-if="userAvatarUrl"
                  :src="userAvatarUrl"
                  :alt="user?.firstName + ' ' + user?.lastName"
                />
                <AvatarImage
                  v-else
                  :src="
                    'https://ui-avatars.com/api/?background=00bfff&color=fff&name=' +
                    user?.firstName +
                    '+' +
                    user?.lastName
                  "
                  :alt="user?.firstName + ' ' + user?.lastName"
                />
                <AvatarFallback>
                  {{ user?.firstName?.[0] }}{{ user?.lastName?.[0] }}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-72">
              <DropdownMenuLabel class="flex flex-col gap-0.5">
                <span class="font-medium">
                  {{ user?.firstName }} {{ user?.lastName }}
                </span>
                <span class="text-xs font-normal t-text-muted">
                  {{ user?.email }}
                </span>
                <span
                  v-if="userStatusBadge"
                  class="mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider t-bg-accent/20 t-text-accent"
                >
                  {{ userStatusBadge }}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem as-child>
                <a
                  v-if="isCustomDomain"
                  :href="accountUrl"
                  target="_blank"
                  rel="noopener"
                  class="cursor-pointer"
                >
                  <Icon name="i-lucide-user" class="size-4" />
                  My HOA Connect profile
                  <Icon
                    name="i-lucide-external-link"
                    class="size-3.5 ml-auto opacity-60"
                  />
                </a>
                <NuxtLink v-else to="/account" class="cursor-pointer">
                  <Icon name="i-lucide-user" class="size-4" />
                  My Profile
                </NuxtLink>
              </DropdownMenuItem>

              <!-- Resident self-service: edit your own contact, mailing address,
                   vehicles, and pets (submitted for review). Org-scoped. -->
              <DropdownMenuItem v-if="isOnOrgPage" as-child>
                <NuxtLink :to="`/${route.params.slug}/profile`" class="cursor-pointer">
                  <Icon name="i-lucide-home" class="size-4" />
                  My household
                </NuxtLink>
              </DropdownMenuItem>

              <!-- Any logged-in user can view their org's public landing without
                   leaving their workspace (opens the chromeless site in a new tab) -->
              <DropdownMenuItem v-if="isOnOrgPage" as-child>
                <a
                  :href="`/${route.params.slug}?preview`"
                  target="_blank"
                  rel="noopener"
                  class="cursor-pointer"
                >
                  <Icon name="i-lucide-external-link" class="size-4" />
                  View public site
                </a>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <!-- Appearance: theme style + dark mode (reuses ThemeSelector) -->
              <div class="px-2 pb-1">
                <ThemeSelector
                  :has-premium="hasPremiumTheme"
                  @premium-required="handlePremiumRequired"
                />
              </div>

              <DropdownMenuSeparator />

              <!-- App dock appearance: palette, labels, glass chrome, position -->
              <div class="px-2 pb-1" @click.stop @keydown.stop>
                <AppAppearanceSettings />
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                class="cursor-pointer"
                @select="handleLogout"
              >
                <Icon name="i-lucide-log-out" class="size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- Mobile Menu Trigger -->
          <Sheet v-model:open="mobileMenuOpen">
            <SheetTrigger class="sm:hidden p-2 -mr-2">
              <Icon name="i-lucide-menu" class="w-6 h-6" />
            </SheetTrigger>
            <SheetContent side="right" class="w-[300px] sm:w-[350px]">
              <SheetHeader class="text-left">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <!-- Notifications Quick Access in Mobile Menu -->
              <div
                v-if="!isMainMarketingDomain"
                class="py-3 border-b t-border flex items-center gap-2"
              >
                <NotificationBell />
                <button
                  v-if="showChat"
                  type="button"
                  class="inline-flex items-center gap-2 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                  @click="channelsPanel.open(); mobileMenuOpen = false"
                >
                  <Icon name="i-lucide-messages-square" class="w-5 h-5 t-text-secondary" />
                  <span class="text-sm">Channels</span>
                </button>
              </div>

              <!-- User Info in Mobile Menu -->
              <div
                class="flex items-center gap-3 py-4 border-b t-border"
              >
                <Avatar>
                  <AvatarImage
                    v-if="userAvatarUrl"
                    :src="userAvatarUrl"
                    :alt="user?.firstName + ' ' + user?.lastName"
                  />
                  <AvatarImage
                    v-else
                    :src="
                      'https://ui-avatars.com/api/?background=00bfff&color=fff&name=' +
                      user?.firstName +
                      '+' +
                      user?.lastName
                    "
                    :alt="user?.firstName + ' ' + user?.lastName"
                  />
                  <AvatarFallback>
                    {{ user?.firstName?.[0] }}{{ user?.lastName?.[0] }}
                  </AvatarFallback>
                </Avatar>
                <div class="flex-1">
                  <p class="font-medium text-sm">
                    {{ user?.firstName }} {{ user?.lastName }}
                  </p>
                  <span
                    v-if="userStatusBadge"
                    class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full"
                    :class="{
                      't-bg-accent/20 t-text-accent': showAdminUI,
                      't-bg-subtle t-text-accent':
                        !showAdminUI && userStatusBadge === 'Board Member',
                      't-bg-subtle t-text-secondary':
                        !showAdminUI && userStatusBadge !== 'Board Member',
                    }"
                  >
                    {{ userStatusBadge }}
                  </span>
                </div>
              </div>

              <!-- Organization Selector in Mobile Menu -->
              <div class="py-4 border-b t-border">
                <p class="text-xs uppercase tracking-wider t-text-muted mb-2">
                  Organization
                </p>
                <OrgSelector class="w-full" />
              </div>

              <!-- Public Navigation (hidden in maintenance mode for non-admins) -->
              <div v-if="!hideNavForMaintenance" class="py-4">
                <p class="text-xs uppercase tracking-wider t-text-muted mb-3">
                  Navigation
                </p>
                <nav class="space-y-1">
                  <NuxtLink
                    v-for="item in publicNavItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                    active-class="t-bg-subtle font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 t-text-secondary hidden"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </nav>
              </div>

              <!-- Admin Navigation - only show if user is admin of current domain's org -->
              <div v-if="showAdminUI" class="py-4 border-t t-border">
                <p class="text-xs uppercase tracking-wider t-text-muted mb-3">
                  Admin
                </p>
                <nav class="space-y-1">
                  <NuxtLink
                    v-for="item in adminNavItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                    active-class="t-bg-subtle font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 t-text-secondary hidden"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                  <NuxtLink
                    v-for="item in adminExtraItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                    active-class="t-bg-subtle font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 t-text-secondary hidden"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </nav>
              </div>

              <!-- Manager Navigation - property managers (non-admin) only -->
              <div v-if="showManagerUI" class="py-4 border-t t-border">
                <p class="text-xs uppercase tracking-wider t-text-muted mb-3">
                  Manage
                </p>
                <nav class="space-y-1">
                  <NuxtLink
                    v-for="item in managerNavItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                    active-class="t-bg-subtle font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 t-text-secondary hidden"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </nav>
              </div>

              <!-- Account & Logout -->
              <div class="py-4 border-t t-border space-y-1">
                <NuxtLink
                  to="/account"
                  target="_blank"
                  class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                >
                  <Icon name="i-lucide-user" class="w-5 h-5 t-text-secondary" />
                  <span>My Profile</span>
                </NuxtLink>
                <a
                  v-if="isOnOrgPage"
                  :href="`/${route.params.slug}?preview`"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors"
                >
                  <Icon name="i-lucide-external-link" class="w-5 h-5 t-text-secondary" />
                  <span>View public site</span>
                </a>
                <button
                  @click="handleLogout"
                  class="flex items-center gap-3 px-3 py-2 rounded-md hover:t-bg-subtle transition-colors w-full text-left text-red-600"
                >
                  <Icon name="i-lucide-log-out" class="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>
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
