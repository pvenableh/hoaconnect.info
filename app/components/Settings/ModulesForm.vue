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
import type { HoaOrganization } from "#core/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
}>();

const emit = defineEmits<{
  updated: [organization: HoaOrganization];
}>();

const { update: updateOrganization } =
  useDirectusItems<HoaOrganization>("hoa_organizations");

// The module catalogue lives in useModules (auto-imported) so this form and the
// Settings health strip count against the same list — see MODULE_GROUPS.
const GROUPS = MODULE_GROUPS;

const ALL_KEYS = ALL_MODULE_KEYS;

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

// Hold off the silent background update while this form is dirty — a
// backgrounded client reloads itself, and that must never eat unsaved input.
useUnsavedWork().guardUnsaved(hasChanges);

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
