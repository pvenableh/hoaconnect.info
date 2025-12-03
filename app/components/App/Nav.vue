<script setup lang="ts">
import { toast } from "vue-sonner";

const { user, logout } = useDirectusAuth();
const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

// Check if we're on an organization page (slug route)
const isOnOrgPage = computed(() => !!route.params.slug);

// Get active HOA for public org pages (when viewing /my-org)
const { activeHoa } = useActiveHoa();

// Get current organization for logged-in users
const { currentOrg } = user.value
  ? await useSelectedOrg()
  : { currentOrg: ref(null) };

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

// Determine if we should show org branding (logged in OR on org page)
const showOrgBranding = computed(() => user.value || isOnOrgPage.value);

const handleLogout = async () => {
  try {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  } catch (error) {
    toast.error("Failed to logout");
  }
};

// Authenticated nav items
const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: "layout-dashboard" },
  { label: "Documents", path: "/documents", icon: "file" },
  { label: "Units", path: "/units", icon: "door-closed" },
  { label: "Members", path: "/members", icon: "users" },
  { label: "Settings", path: "/settings/organization", icon: "settings" },
];

// Public nav items
const publicNavItems = [
  { label: "Features", path: "/#features" },
  { label: "Pricing", path: "/#plans" },
];
</script>

<template>
  <nav class="bg-white border-b border-stone-200">
    <div class="max-w-7xl mx-auto px-6 py-4">
      <div class="flex justify-between items-center">
        <!-- Logo / Brand -->
        <NuxtLink
          :to="
            user ? '/dashboard' : isOnOrgPage ? `/${route.params.slug}` : '/'
          "
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
            <span class="text-xl font-bold text-blue-600">{{ orgName }}</span>
          </template>
          <!-- Default brand for main home page -->
          <template v-else>
            <span class="text-xl font-bold text-blue-600">HOA Connect</span>
          </template>
        </NuxtLink>

        <!-- Authenticated Nav Links -->
        <div v-if="user" class="hidden md:flex gap-6">
          <NuxtLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2 hover:text-stone-600 transition-colors uppercase text-xs tracking-wider"
            active-class="text-stone-900 font-medium"
          >
            <Icon :name="'i-lucide-' + item.icon" class="w-4 h-4" />
            {{ item.label }}
          </NuxtLink>
        </div>

        <!-- Public Nav Links - Only show on main home page, not on org pages -->
        <div v-else-if="!isOnOrgPage" class="hidden md:flex gap-6">
          <a
            v-for="item in publicNavItems"
            :key="item.path"
            :href="item.path"
            class="text-gray-600 hover:text-blue-600 transition uppercase text-xs tracking-wider"
          >
            {{ item.label }}
          </a>
        </div>

        <!-- Empty spacer when on org page but not logged in -->
        <div v-else class="hidden md:flex"></div>

        <!-- User Menu (Authenticated) -->
        <div v-if="user" class="flex items-center gap-4">
          <OrgSelector />
          <span class="text-xs text-stone-600 uppercase tracking-wider">
            {{ user?.firstName }} {{ user?.lastName }}
          </span>
          <Button
            @click="handleLogout"
            variant="outline"
            size="sm"
            class="uppercase tracking-wider text-xs"
          >
            Logout
          </Button>
        </div>

        <!-- Public User Menu -->
        <div v-else class="flex items-center gap-4">
          <NuxtLink
            to="/auth/login"
            class="text-gray-600 hover:text-blue-600 uppercase text-xs tracking-wider"
          >
            Login
          </NuxtLink>
          <!-- Hide Get Started on org pages -->
          <NuxtLink
            v-if="!isOnOrgPage"
            to="/setup"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-xs uppercase tracking-wider"
          >
            Get Started
          </NuxtLink>
        </div>
      </div>

      <!-- Mobile Nav (Authenticated) -->
      <div v-if="user" class="md:hidden flex gap-4 mt-4 overflow-x-auto">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex-shrink-0 text-center py-2 px-3 text-sm hover:bg-stone-100 rounded whitespace-nowrap"
          active-class="bg-stone-100 font-medium"
        >
          <Icon :name="'i-lucide-' + item.icon" class="w-4 h-4 inline mr-1" />
          {{ item.label }}
        </NuxtLink>
      </div>

      <!-- Mobile Nav (Public) - Only show on main home page -->
      <div v-else-if="!isOnOrgPage" class="md:hidden flex gap-4 mt-4">
        <a
          v-for="item in publicNavItems"
          :key="item.path"
          :href="item.path"
          class="flex-1 text-center py-2 text-sm hover:bg-stone-100 rounded"
        >
          {{ item.label }}
        </a>
      </div>
    </div>
  </nav>
</template>
