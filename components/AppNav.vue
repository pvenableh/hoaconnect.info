<script setup lang="ts">
import { toast } from "vue-sonner";

const { user, logout } = useDirectusAuth();
const router = useRouter();

const handleLogout = async () => {
  try {
    await logout();
    toast.success("Logged out successfully");
  } catch (error) {
    toast.error("Failed to logout");
  }
};

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: "layout-dashboard" },
  { label: "Documents", path: "/documents", icon: "file" },
  { label: "Units", path: "/units", icon: "door-closed" },
  { label: "People", path: "/people", icon: "users" },
];
</script>

<template>
  <nav class="bg-white border-b border-stone-200">
    <div class="max-w-7xl mx-auto px-6 py-4">
      <div class="flex justify-between items-center">
        <!-- Logo / Brand -->
        <NuxtLink to="/dashboard" class="text-xl font-bold">
          HOA Manage
        </NuxtLink>

        <!-- Nav Links -->
        <div class="hidden md:flex gap-6">
          <NuxtLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2 hover:text-stone-600 transition-colors uppercase text-xs tracking-wider"
            active-class="text-stone-900 font-medium "
          >
            <Icon :name="'i-lucide-' + item.icon" class="w-4 h-4" />
            {{ item.label }}
          </NuxtLink>
        </div>

        <!-- User Menu -->
        <div class="flex items-center gap-4">
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
      </div>

      <!-- Mobile Nav -->
      <div class="md:hidden flex gap-4 mt-4">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex-1 text-center py-2 text-sm hover:bg-stone-100 rounded"
          active-class="bg-stone-100 font-medium"
        >
          {{ item.icon }} {{ item.label }}
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>
