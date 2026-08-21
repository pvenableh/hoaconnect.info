<template>
  <div class="min-h-screen t-bg">
    <PageContainer>
      <!-- Loading State -->
      <div
        v-if="isLoading || !isHydrated"
        class="flex flex-col items-center justify-center min-h-[400px] gap-3"
      >
        <span class="spinner-ios" />
        <p class="type-meta">Loading organization…</p>
      </div>

      <template v-else-if="organization">
        <AppPageHeader
          eyebrow="Settings"
          title="Organization"
          description="Identity, branding, features, and billing for your community."
        >
          <template #actions>
            <Button variant="outline" @click="navigateToOrg('/admin/settings/domains')">
              <Icon name="lucide:globe" />
              Edit public site
            </Button>
          </template>
        </AppPageHeader>

        <AppSegmentedControl
          v-model="activeTab"
          :items="tabItems"
          label="Settings sections"
          class="mb-6"
        />

        <AppTabPanels :value="activeTab" :items="tabItems">

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
            <SettingsEmailSenderForm :organization="organization" />
          </div>

          <!-- SEO Tab -->
          <div v-if="activeTab === 'seo'" class="space-y-6">
            <SettingsSeoSettingsForm
              :settings="settings"
              @updated="handleSettingsUpdate"
            />
          </div>

          <!-- Modules Tab -->
          <div v-if="activeTab === 'modules'" class="space-y-6">
            <SettingsModulesForm
              :organization="organization"
              @updated="handleOrganizationUpdate"
            />
          </div>

          <!-- Subscription Tab -->
          <div v-if="activeTab === 'subscription'" class="space-y-6">
            <SettingsSubscriptionSettingsCard :organization="organization" />
          </div>

          <!-- Payment Settings Tab (surfaces Stripe Connect payouts + dues/late fees) -->
          <div v-if="activeTab === 'payments'" class="space-y-6">
            <SettingsPaymentSettingsForm
              :organization="organization"
              @updated="handleOrganizationUpdate"
            />
          </div>
        </AppTabPanels>
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
        <Button @click="navigateToOrg('/')" class="mt-4">
          Go to Dashboard
        </Button>
      </div>
      </PageContainer>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, BlockSetting } from "#core/types/directus";
import { toast } from "vue-sonner";
const { navigateToOrg } = useOrgNavigation();
const { patchActiveHoa } = useActiveHoa();

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
  { id: "payments", label: "Payment Settings", icon: "lucide:credit-card" },
  { id: "modules", label: "Modules", icon: "lucide:toggle-right" },
  { id: "subscription", label: "Subscription", icon: "lucide:sparkles" },
];

// Filter out subscription tab for free accounts
// A free account has no subscription to manage, so that tab is dropped rather
// than shown leading nowhere.
const tabItems = computed(() => {
  const list = organization.value?.is_free_account
    ? allTabs.filter((tab) => tab.id !== "subscription")
    : allTabs;
  return list.map((t) => ({ value: t.id, label: t.label, icon: t.icon }));
});

// Deep-linkable via ?tab= — the Settings hub links straight to a tab.
// Validated against the STATIC list, not the `tabs` computed, which reads
// `organization` declared further down (touching it here would be a TDZ error).
const activeTab = useTabQuery({
  values: allTabs.map((t) => t.id),
  fallback: "general",
});

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
  // Keep the dock / nav / module gates (which read activeHoa) in sync without a
  // reload — push just the nav-relevant fields that can change here.
  patchActiveHoa({
    id: updatedOrg.id,
    modules: (updatedOrg as any).modules,
    show_board: (updatedOrg as any).show_board,
    maintenance_mode: (updatedOrg as any).maintenance_mode,
    name: updatedOrg.name,
  });
  toast.success("Organization settings saved");
};

// Handle settings update
const handleSettingsUpdate = async (updatedSettings: BlockSetting) => {
  settings.value = updatedSettings;
  toast.success("Settings saved");
};
</script>
