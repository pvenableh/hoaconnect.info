<template>
  <div class="space-y-6">
    <Card v-for="group in GROUPS" :key="group.label">
      <CardHeader>
        <CardTitle>{{ group.label }}</CardTitle>
        <CardDescription>{{ group.description }}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="divide-y">
          <div
            v-for="mod in group.modules"
            :key="mod.key"
            class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div class="space-y-0.5 pr-4">
              <Label>{{ mod.label }}</Label>
              <p class="text-sm text-muted-foreground">{{ mod.description }}</p>
            </div>
            <Switch v-model="form[mod.key]" :disabled="isSaving" />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Save Button -->
    <div class="flex justify-end">
      <Button @click="saveChanges" :disabled="isSaving || !hasChanges">
        <Icon
          v-if="isSaving"
          name="lucide:loader-2"
          class="mr-2 h-4 w-4 animate-spin"
        />
        {{ isSaving ? "Saving..." : "Save Modules" }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization } from "~~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
}>();

const emit = defineEmits<{
  updated: [organization: HoaOrganization];
}>();

const { update: updateOrganization } =
  useDirectusItems<HoaOrganization>("hoa_organizations");

// Toggleable modules, grouped for the UI. Keys match useModules / the dock app
// keys. Core apps (dashboard, settings) are intentionally absent — never off.
const GROUPS: {
  label: string;
  description: string;
  modules: { key: string; label: string; description: string }[];
}[] = [
  {
    label: "Community",
    description: "Social and engagement features for residents.",
    modules: [
      { key: "feed", label: "Building Feed", description: "Community posts and activity feed (shown as a Dashboard tab)." },
      { key: "meetings", label: "Meetings", description: "Agendas, minutes, and RSVPs." },
      { key: "polls", label: "Polls", description: "Community votes and surveys." },
      { key: "requests", label: "Requests", description: "Maintenance and service tickets." },
      { key: "moderation", label: "Moderation", description: "Comment reports and review queue." },
    ],
  },
  {
    label: "Records",
    description: "Documents and resident record-keeping.",
    modules: [
      { key: "documents", label: "Documents", description: "Shared files and document library." },
      { key: "files", label: "Files", description: "Dropbox-style storage manager for the org's folders and files." },
      { key: "rules", label: "Rules", description: "By-laws, CC&Rs, and searchable governance." },
      { key: "directory", label: "Directory", description: "Members, units, and teams." },
      { key: "vendors", label: "Vendors", description: "Service-provider directory (management, attorney, elevator, …), member-visible per vendor." },
      { key: "pets", label: "Pets", description: "Pet registration records." },
      { key: "vehicles", label: "Vehicles", description: "Vehicle and parking records." },
      { key: "leases", label: "Leases", description: "Tenant lease records." },
    ],
  },
  {
    label: "Money",
    description: "Dues, payments, and expense tracking.",
    modules: [
      { key: "payments", label: "Payments", description: "Resident dues and online payments." },
      { key: "expenses", label: "Expenses", description: "Track money out (vendors, bills)." },
    ],
  },
  {
    label: "Internal",
    description: "Admin and board tools, not member-facing.",
    modules: [
      { key: "channels", label: "Channels", description: "Internal chat for admins and board, with per-channel member invites." },
    ],
  },
  {
    label: "Other",
    description: "Additional tools.",
    modules: [
      { key: "board", label: "Board", description: "Board member roster and terms." },
      { key: "email", label: "Communications", description: "Email broadcasts, newsletters, alerts, templates, and delivery activity." },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((g) => g.modules.map((m) => m.key));

const isSaving = ref(false);

// Build the working map, defaulting any missing key to enabled (matches
// useModules — existing orgs whose column is null lose nothing).
const buildForm = (org: HoaOrganization): Record<string, boolean> => {
  const stored = ((org as any).modules ?? {}) as Record<string, boolean>;
  const out: Record<string, boolean> = {};
  for (const key of ALL_KEYS) out[key] = stored[key] !== false;
  return out;
};

const form = ref<Record<string, boolean>>(buildForm(props.organization));

const hasChanges = computed(() => {
  const stored = ((props.organization as any).modules ?? {}) as Record<string, boolean>;
  return ALL_KEYS.some((key) => form.value[key] !== (stored[key] !== false));
});

watch(
  () => props.organization,
  (newOrg) => {
    form.value = buildForm(newOrg);
  },
  { deep: true }
);

const saveChanges = async () => {
  if (!hasChanges.value) return;
  isSaving.value = true;

  // Merge over any existing keys so unknown/future keys are preserved.
  const stored = ((props.organization as any).modules ?? {}) as Record<string, boolean>;
  const next = { ...stored, ...form.value };

  try {
    const updated = await updateOrganization(props.organization.id, {
      modules: next,
    } as Partial<HoaOrganization>);
    emit("updated", { ...props.organization, ...updated });
    toast.success("Modules saved");
  } catch (error: any) {
    console.error("Failed to save modules:", error);
    toast.error(error.message || "Failed to save modules");
  } finally {
    isSaving.value = false;
  }
};
</script>
