<template>
  <div class="min-h-screen t-bg">
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
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
        <Tabs v-model="activeTab" default-value="general">
          <TabsList class="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger
              v-for="tab in tabs"
              :key="tab.id"
              :value="tab.id"
              class="whitespace-nowrap"
            >
              <Icon :name="tab.icon" class="h-4 w-4 mr-2" />
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>

          <!-- General Tab -->
          <TabsContent value="general" class="space-y-6">
            <SettingsOrganizationInfoForm
              :organization="organization"
              @updated="handleOrganizationUpdate"
            />
          </TabsContent>

          <!-- Branding Tab -->
          <TabsContent value="branding" class="space-y-6">
            <SettingsBrandingSettingsForm
              :organization="organization"
              :settings="settings"
              @updated="handleSettingsUpdate"
            />
          </TabsContent>

          <!-- SEO Tab -->
          <TabsContent value="seo" class="space-y-6">
            <SettingsSeoSettingsForm
              :settings="settings"
              @updated="handleSettingsUpdate"
            />
          </TabsContent>

          <!-- Subscription Tab -->
          <TabsContent value="subscription" class="space-y-6">
            <SettingsSubscriptionSettingsCard :organization="organization" />
          </TabsContent>

          <!-- Payment Settings Tab - Hidden for now -->
          <!-- <TabsContent value="payments" class="space-y-6">
            <SettingsPaymentSettingsForm
              :organization="organization"
              @updated="handleOrganizationUpdate"
            />
          </TabsContent> -->
        </Tabs>
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
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, BlockSetting } from "~~/types/directus";
import { toast } from "vue-sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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

// Tab management - hide subscription tab for free accounts, hide payments tab for now
const allTabs = [
  { id: "general", label: "General", icon: "lucide:building-2" },
  { id: "branding", label: "Branding", icon: "lucide:palette" },
  { id: "seo", label: "SEO", icon: "lucide:search" },
  // { id: "payments", label: "Payment Settings", icon: "lucide:credit-card" }, // Hidden for now
  { id: "subscription", label: "Subscription", icon: "lucide:sparkles" },
];

// Filter out subscription tab for free accounts
const tabs = computed(() => {
  if (organization.value?.is_free_account) {
    return allTabs.filter((tab) => tab.id !== "subscription");
  }
  return allTabs;
});

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
