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

// Get active HOA for public org pages (when viewing /my-org or custom domain)
const { activeHoa, isCustomDomain } = useActiveHoa();

// Check if we're on the main marketing domain (not custom domain, not org page)
const isMainMarketingDomain = computed(
  () => !isCustomDomain.value && !isOnOrgPage.value
);

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

// Determine if we should show org branding (on org page OR on custom domain, but NOT on main marketing domain even if logged in)
const showOrgBranding = computed(
  () => isOnOrgPage.value || isCustomDomain.value
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

// Public navigation items (visible to all authenticated users)
const publicNavItems = computed(() => [
  { label: "Home", path: buildPath("/"), icon: "home" },
  { label: "Board", path: buildPath("/board"), icon: "award" },
  { label: "Documents", path: buildPath("/documents"), icon: "file" },
]);

// Admin-only navigation items
const adminNavItems = computed(() => [
  {
    label: "Dashboard",
    path: buildPath("/dashboard"),
    icon: "layout-dashboard",
  },
  {
    label: "Documents",
    path: buildPath("/admin/documents"),
    icon: "file-text",
  },
  { label: "Units", path: buildPath("/admin/units"), icon: "door-closed" },
  { label: "Members", path: buildPath("/admin/members"), icon: "users" },
  {
    label: "Settings",
    path: buildPath("/admin/settings/organization"),
    icon: "settings",
  },
]);

// Get role/status badge text for user
const userStatusBadge = computed(() => {
  if (isAdmin.value) return "Admin";
  if (isBoardMember.value && boardTitleDisplay.value) {
    return boardTitleDisplay.value;
  }
  if (memberType.value === "owner") return "Owner";
  if (memberType.value === "tenant") return "Resident";
  return null;
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

// Close mobile menu on route change
watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false;
  }
);
</script>

<template>
  <nav class="bg-white border-b border-stone-200 px-6">
    <div class="max-w-7xl mx-auto py-4">
      <div class="flex justify-between items-center">
        <!-- Logo / Brand -->
        <!-- On org page (slug route): link to org root -->
        <!-- Otherwise (main domain or custom domain): link to home -->
        <NuxtLink
          :to="isOnOrgPage ? `/${route.params.slug}` : '/'"
          class="flex items-center gap-2 hover:opacity-80 transition"
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
              class="text-sm font-semibold tracking-extra-wide uppercase text-zinc-800"
              >{{ orgName }}</span
            >
          </template>
          <!-- Default brand for main home page -->
          <template v-else>
            <span class="text-xl font-semibold uppercase tracking-extra-wide"
              ><span class="font-light">HOA</span>Connect</span
            >
          </template>
        </NuxtLink>

        <!-- Marketing Nav Links - Show on main marketing domain (even if logged in) -->
        <div v-if="isMainMarketingDomain" class="hidden md:flex gap-6">
          <a
            v-for="item in marketingNavItems"
            :key="item.path"
            :href="item.path"
            class="text-gray-600 hover:text-zinc-300 transition uppercase text-xs tracking-wider"
          >
            {{ item.label }}
          </a>
        </div>

        <!-- Authenticated Nav Links - Show on org pages and custom domains when logged in -->
        <div v-else-if="user" class="hidden md:flex gap-6">
          <!-- Public Navigation Items -->
          <NuxtLink
            v-for="item in publicNavItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2 hover:text-stone-600 transition-colors uppercase text-xs tracking-wider"
            active-class="text-stone-900 font-medium"
          >
            <Icon :name="'i-lucide-' + item.icon" class="w-4 h-4" />
            {{ item.label }}
          </NuxtLink>
        </div>

        <!-- Empty spacer when on org page or custom domain but not logged in -->
        <div v-else class="hidden md:flex"></div>

        <!-- User Menu (Authenticated) -->
        <div v-if="user" class="flex items-center gap-4">
          <OrgSelector class="hidden sm:flex" />
          <!-- User status badge -->
          <span
            v-if="userStatusBadge && !isMainMarketingDomain"
            class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
            :class="{
              'bg-amber-100 text-amber-800': isAdmin,
              'bg-blue-100 text-blue-800': isBoardMember && !isAdmin,
              'bg-stone-100 text-stone-700': !isAdmin && !isBoardMember,
            }"
          >
            {{ userStatusBadge }}
          </span>
          <NuxtLink
            to="/account"
            target="_blank"
            class="hover:opacity-80 transition hidden sm:block"
            title="My Profile"
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
          </NuxtLink>
          <Button
            @click="handleLogout"
            variant="outline"
            size="sm"
            class="uppercase tracking-wider text-xs hidden sm:flex"
          >
            Logout
          </Button>

          <!-- Mobile Menu Trigger -->
          <Sheet v-model:open="mobileMenuOpen">
            <SheetTrigger class="sm:hidden p-2 -mr-2">
              <Icon name="i-lucide-menu" class="w-6 h-6" />
            </SheetTrigger>
            <SheetContent side="right" class="w-[300px] sm:w-[350px]">
              <SheetHeader class="text-left">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <!-- User Info in Mobile Menu -->
              <div
                class="flex items-center gap-3 py-4 border-b border-stone-200"
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
                      'bg-amber-100 text-amber-800': isAdmin,
                      'bg-blue-100 text-blue-800': isBoardMember && !isAdmin,
                      'bg-stone-100 text-stone-700': !isAdmin && !isBoardMember,
                    }"
                  >
                    {{ userStatusBadge }}
                  </span>
                </div>
              </div>

              <!-- Organization Selector in Mobile Menu -->
              <div class="py-4 border-b border-stone-200">
                <p class="text-xs uppercase tracking-wider text-stone-500 mb-2">
                  Organization
                </p>
                <OrgSelector class="w-full" />
              </div>

              <!-- Public Navigation -->
              <div class="py-4">
                <p class="text-xs uppercase tracking-wider text-stone-500 mb-3">
                  Navigation
                </p>
                <nav class="space-y-1">
                  <NuxtLink
                    v-for="item in publicNavItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-stone-100 transition-colors"
                    active-class="bg-stone-100 font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 text-stone-600"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </nav>
              </div>

              <!-- Admin Navigation -->
              <div v-if="isAdmin" class="py-4 border-t border-stone-200">
                <p class="text-xs uppercase tracking-wider text-stone-500 mb-3">
                  Admin
                </p>
                <nav class="space-y-1">
                  <NuxtLink
                    v-for="item in adminNavItems"
                    :key="item.path"
                    :to="item.path"
                    class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-stone-100 transition-colors"
                    active-class="bg-stone-100 font-medium"
                  >
                    <Icon
                      :name="'i-lucide-' + item.icon"
                      class="w-5 h-5 text-stone-600"
                    />
                    <span>{{ item.label }}</span>
                  </NuxtLink>
                </nav>
              </div>

              <!-- Account & Logout -->
              <div class="py-4 border-t border-stone-200 space-y-1">
                <NuxtLink
                  to="/account"
                  target="_blank"
                  class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-stone-100 transition-colors"
                >
                  <Icon name="i-lucide-user" class="w-5 h-5 text-stone-600" />
                  <span>My Profile</span>
                </NuxtLink>
                <button
                  @click="handleLogout"
                  class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-stone-100 transition-colors w-full text-left text-red-600"
                >
                  <Icon name="i-lucide-log-out" class="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <!-- Public User Menu -->
        <div v-else class="flex items-center gap-4">
          <NuxtLink
            to="/auth/login"
            class="text-gray-600 hover:text-stone-600 uppercase text-xs tracking-wider"
          >
            Login
          </NuxtLink>
          <!-- Hide Get Started on org pages and custom domains -->
          <Button
            v-if="!isOnOrgPage && !isCustomDomain"
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
          class="flex-1 text-center py-2 text-sm hover:bg-stone-100 rounded"
        >
          {{ item.label }}
        </a>
      </div>

      <!-- Admin Navigation Row - Desktop only -->
      <div
        v-if="user && isAdmin && !isMainMarketingDomain"
        class="hidden md:flex items-center gap-1 mt-3 pt-3 border-t border-stone-100"
      >
        <span class="text-xs uppercase tracking-wider text-stone-400 mr-4"
          >Admin</span
        >
        <NuxtLink
          v-for="item in adminNavItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-stone-100 transition-colors text-xs uppercase tracking-wider text-stone-600"
          active-class="bg-stone-100 text-stone-900 font-medium"
        >
          <Icon :name="'i-lucide-' + item.icon" class="w-3.5 h-3.5" />
          {{ item.label }}
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>
