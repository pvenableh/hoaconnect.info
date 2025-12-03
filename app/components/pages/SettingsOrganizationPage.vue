<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <!-- Loading State -->
      <div
        v-if="isLoading || !isHydrated"
        class="flex items-center justify-center min-h-[400px]"
      >
        <div class="text-center">
          <div
            class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"
            role="status"
          />
          <p class="mt-4 text-muted-foreground">Loading organization...</p>
        </div>
      </div>

      <template v-else-if="organization">
        <!-- Page Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold">Organization Settings</h1>
          <p class="text-muted-foreground mt-2">
            Manage your organization's information, branding, and subscription
          </p>
        </div>

        <!-- Settings Tabs -->
        <div class="flex space-x-1 border-b mb-6 overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors relative whitespace-nowrap',
              activeTab === tab.id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <Icon :name="tab.icon" class="h-4 w-4 mr-2 inline-block" />
            {{ tab.label }}
            <span
              v-if="activeTab === tab.id"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
            />
          </button>
        </div>

        <!-- General Tab -->
        <div v-if="activeTab === 'general'" class="space-y-6">
          <SettingsOrganizationInfoForm
            :organization="organization"
            @updated="handleOrganizationUpdate"
          />
        </div>

        <!-- Branding Tab -->
        <div v-if="activeTab === 'branding'" class="space-y-6">
          <SettingsBrandingSettingsForm
            :organization="organization"
            :settings="settings"
            @updated="handleSettingsUpdate"
          />
        </div>

        <!-- SEO Tab -->
        <div v-if="activeTab === 'seo'" class="space-y-6">
          <SettingsSeoSettingsForm
            :settings="settings"
            @updated="handleSettingsUpdate"
          />
        </div>

        <!-- Subscription Tab -->
        <div v-if="activeTab === 'subscription'" class="space-y-6">
          <SettingsSubscriptionSettingsCard :organization="organization" />
        </div>

        <!-- Payment Settings Tab -->
        <div v-if="activeTab === 'payments'" class="space-y-6">
          <SettingsPaymentSettingsForm
            :organization="organization"
            @updated="handleOrganizationUpdate"
          />
        </div>
      </template>

      <!-- No Organization -->
      <div v-else class="text-center py-12">
        <Icon
          name="lucide:building-2"
          class="h-12 w-12 mx-auto text-muted-foreground"
        />
        <h2 class="mt-4 text-lg font-medium">No Organization Selected</h2>
        <p class="text-muted-foreground mt-2">
          Please select an organization to manage its settings.
        </p>
        <Button @click="navigateToOrg('/dashboard')" class="mt-4">
          Go to Dashboard
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, BlockSetting } from "~~/types/directus";
import { toast } from "vue-sonner";

const { navigateToOrg } = useOrgNavigation();

// Track client-side hydration
const isHydrated = ref(false);
onMounted(() => {
  isHydrated.value = true;
});

// Get selected organization
const { selectedOrgId, isLoading } = await useSelectedOrg();
const { get: getOrganization } =
  useDirectusItems<HoaOrganization>("hoa_organizations");
const { get: getSettings } =
  useDirectusItems<BlockSetting>("block_settings");

// Tab management
const tabs = [
  { id: "general", label: "General", icon: "lucide:building-2" },
  { id: "branding", label: "Branding", icon: "lucide:palette" },
  { id: "seo", label: "SEO", icon: "lucide:search" },
  { id: "payments", label: "Payment Settings", icon: "lucide:credit-card" },
  { id: "subscription", label: "Subscription", icon: "lucide:sparkles" },
];
const activeTab = ref("general");

// Organization data
const organization = ref<HoaOrganization | null>(null);
const settings = ref<BlockSetting | null>(null);

// Fetch organization details with settings
const fetchOrganization = async () => {
  if (!selectedOrgId.value) return;

  try {
    const org = await getOrganization(selectedOrgId.value, {
      fields: ["*", "settings.*", "subscription_plan.*", "hero.*"],
    });
    organization.value = org;

    // Get or create settings
    if (org.settings && typeof org.settings === "object") {
      settings.value = org.settings as BlockSetting;
    } else if (org.settings && typeof org.settings === "string") {
      const settingsData = await getSettings(org.settings, {
        fields: ["*"],
      });
      settings.value = settingsData;
    } else {
      settings.value = null;
    }
  } catch (error: any) {
    console.error("Failed to fetch organization:", error);
    toast.error("Failed to load organization settings");
  }
};

// Watch for org changes
watch(
  () => selectedOrgId.value,
  async (newOrgId) => {
    if (newOrgId) {
      await fetchOrganization();
    }
  },
  { immediate: true }
);

// Handle organization update
const handleOrganizationUpdate = async (updatedOrg: HoaOrganization) => {
  organization.value = updatedOrg;
  toast.success("Organization settings saved");
};

// Handle settings update
const handleSettingsUpdate = async (updatedSettings: BlockSetting) => {
  settings.value = updatedSettings;
  toast.success("Settings saved");
};
</script>
