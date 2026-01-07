<template>
  <div class="space-y-6">
    <!-- Logo & Icon -->
    <Card>
      <CardHeader>
        <CardTitle>Logo & Icon</CardTitle>
        <CardDescription>
          Upload your organization's logo and favicon
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Logo Upload -->
          <div class="space-y-4">
            <Label>Logo</Label>
            <div
              class="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              @click="triggerLogoUpload"
              @drop.prevent="handleLogoDrop"
              @dragover.prevent
            >
              <input
                ref="logoInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleLogoChange"
              />
              <div v-if="logoPreview || currentLogoUrl" class="mb-4">
                <img
                  :src="logoPreview || currentLogoUrl"
                  alt="Logo preview"
                  class="max-h-24 mx-auto object-contain"
                />
              </div>
              <div v-else>
                <Icon name="lucide:image" class="h-12 w-12 mx-auto text-muted-foreground" />
              </div>
              <p class="text-sm text-muted-foreground mt-2">
                {{ logoPreview ? "Click to change" : "Click or drag to upload" }}
              </p>
              <p class="text-xs text-muted-foreground">
                Recommended: 400x100px, PNG or SVG
              </p>
            </div>
            <Button
              v-if="logoPreview || currentLogoUrl"
              variant="outline"
              size="sm"
              @click="removeLogo"
              :disabled="isSaving"
            >
              <Icon name="lucide:trash-2" class="h-4 w-4 mr-1" />
              Remove Logo
            </Button>
          </div>

          <!-- Icon Upload -->
          <div class="space-y-4">
            <Label>Favicon / Icon</Label>
            <div
              class="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              @click="triggerIconUpload"
              @drop.prevent="handleIconDrop"
              @dragover.prevent
            >
              <input
                ref="iconInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleIconChange"
              />
              <div v-if="iconPreview || currentIconUrl" class="mb-4">
                <img
                  :src="iconPreview || currentIconUrl"
                  alt="Icon preview"
                  class="h-16 w-16 mx-auto object-contain"
                />
              </div>
              <div v-else>
                <Icon name="lucide:square" class="h-12 w-12 mx-auto text-muted-foreground" />
              </div>
              <p class="text-sm text-muted-foreground mt-2">
                {{ iconPreview ? "Click to change" : "Click or drag to upload" }}
              </p>
              <p class="text-xs text-muted-foreground">
                Recommended: 512x512px, PNG
              </p>
            </div>
            <Button
              v-if="iconPreview || currentIconUrl"
              variant="outline"
              size="sm"
              @click="removeIcon"
              :disabled="isSaving"
            >
              <Icon name="lucide:trash-2" class="h-4 w-4 mr-1" />
              Remove Icon
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Theme -->
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Choose a color theme for your organization's site
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="theme">Color Theme</Label>
            <select
              id="theme"
              v-model="form.theme"
              class="w-full px-3 py-2 border rounded-md bg-background"
              :disabled="isSaving"
            >
              <option value="light">Light - Clean and bright</option>
              <option value="dark">Dark - Modern and sleek</option>
              <option value="ocean">Ocean - Cool blues and teals</option>
              <option value="forest">Forest - Natural greens</option>
              <option value="sunset">Sunset - Warm oranges and reds</option>
              <option value="midnight">Midnight - Deep purple and blue</option>
            </select>
          </div>

          <!-- Theme Preview -->
          <div class="mt-4 p-4 rounded-lg border">
            <p class="text-sm font-medium mb-3">Preview</p>
            <div class="flex items-center gap-2 flex-wrap">
              <div
                v-for="theme in themeOptions"
                :key="theme.value"
                class="flex flex-col items-center gap-1 cursor-pointer p-2 rounded-lg border-2 transition-all"
                :class="form.theme === theme.value ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted'"
                @click="form.theme = theme.value"
              >
                <div class="flex gap-0.5">
                  <div
                    class="h-8 w-4 rounded-l"
                    :style="{ backgroundColor: theme.colors.primary }"
                  />
                  <div
                    class="h-8 w-4"
                    :style="{ backgroundColor: theme.colors.secondary }"
                  />
                  <div
                    class="h-8 w-4 rounded-r"
                    :style="{ backgroundColor: theme.colors.accent }"
                  />
                </div>
                <span class="text-xs text-muted-foreground">{{ theme.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Site Title & Description -->
    <Card>
      <CardHeader>
        <CardTitle>Site Content</CardTitle>
        <CardDescription>
          Title and description shown on your landing page
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Title -->
          <div class="space-y-2">
            <Label for="title">Site Title</Label>
            <Input
              id="title"
              v-model="form.title"
              placeholder="Welcome to Our Community"
              :disabled="isSaving"
            />
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label for="description">Site Description</Label>
            <textarea
              id="description"
              v-model="form.description"
              rows="3"
              class="w-full px-3 py-2 border rounded-md bg-background resize-none"
              placeholder="A brief description of your HOA community..."
              :disabled="isSaving"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Save Button -->
    <div class="flex justify-end">
      <Button @click="saveChanges" :disabled="isSaving">
        <Icon
          v-if="isSaving"
          name="lucide:loader-2"
          class="mr-2 h-4 w-4 animate-spin"
        />
        {{ isSaving ? "Saving..." : "Save Branding" }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, BlockSetting, DirectusFile } from "~~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
  settings: BlockSetting | null;
}>();

const emit = defineEmits<{
  updated: [settings: BlockSetting];
}>();

const config = useRuntimeConfig();
const { upload: uploadFile } = useDirectusFiles();
const { update: updateSettings, create: createSettings } = useDirectusItems<BlockSetting>("block_settings");
const { update: updateOrganization } = useDirectusItems<HoaOrganization>("hoa_organizations");

const isSaving = ref(false);
const logoInput = ref<HTMLInputElement | null>(null);
const iconInput = ref<HTMLInputElement | null>(null);
const logoFile = ref<File | null>(null);
const iconFile = ref<File | null>(null);
const logoPreview = ref<string | null>(null);
const iconPreview = ref<string | null>(null);
const removedLogo = ref(false);
const removedIcon = ref(false);

// Theme options with preview colors
const themeOptions = [
  { value: 'light', label: 'Light', colors: { primary: '#2563eb', secondary: '#64748b', accent: '#f59e0b' } },
  { value: 'dark', label: 'Dark', colors: { primary: '#3b82f6', secondary: '#94a3b8', accent: '#fbbf24' } },
  { value: 'ocean', label: 'Ocean', colors: { primary: '#0891b2', secondary: '#0e7490', accent: '#06b6d4' } },
  { value: 'forest', label: 'Forest', colors: { primary: '#16a34a', secondary: '#15803d', accent: '#84cc16' } },
  { value: 'sunset', label: 'Sunset', colors: { primary: '#ea580c', secondary: '#dc2626', accent: '#fbbf24' } },
  { value: 'midnight', label: 'Midnight', colors: { primary: '#7c3aed', secondary: '#6366f1', accent: '#a78bfa' } },
];

// Helper to get file ID
const getFileId = (file: DirectusFile | string | null | undefined): string | null => {
  if (!file) return null;
  if (typeof file === "string") return file;
  return file.id || null;
};

// Current image URLs
const currentLogoUrl = computed(() => {
  if (removedLogo.value) return null;
  const logoId = getFileId(props.settings?.logo);
  if (!logoId) return null;
  return `${config.public.directus.url}/assets/${logoId}`;
});

const currentIconUrl = computed(() => {
  if (removedIcon.value) return null;
  const iconId = getFileId(props.settings?.icon);
  if (!iconId) return null;
  return `${config.public.directus.url}/assets/${iconId}`;
});

// Form data
const form = ref({
  theme: props.settings?.theme || "light",
  title: props.settings?.title || "",
  description: props.settings?.description || "",
});

// Watch for prop changes
watch(
  () => props.settings,
  (newSettings) => {
    if (newSettings) {
      form.value = {
        theme: newSettings.theme || "light",
        title: newSettings.title || "",
        description: newSettings.description || "",
      };
    }
  },
  { deep: true }
);

// File upload handlers
const triggerLogoUpload = () => {
  logoInput.value?.click();
};

const triggerIconUpload = () => {
  iconInput.value?.click();
};

const handleLogoChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    logoFile.value = file;
    logoPreview.value = URL.createObjectURL(file);
    removedLogo.value = false;
  }
};

const handleIconChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    iconFile.value = file;
    iconPreview.value = URL.createObjectURL(file);
    removedIcon.value = false;
  }
};

const handleLogoDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    logoFile.value = file;
    logoPreview.value = URL.createObjectURL(file);
    removedLogo.value = false;
  }
};

const handleIconDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    iconFile.value = file;
    iconPreview.value = URL.createObjectURL(file);
    removedIcon.value = false;
  }
};

const removeLogo = () => {
  logoFile.value = null;
  logoPreview.value = null;
  removedLogo.value = true;
  if (logoInput.value) logoInput.value.value = "";
};

const removeIcon = () => {
  iconFile.value = null;
  iconPreview.value = null;
  removedIcon.value = true;
  if (iconInput.value) iconInput.value.value = "";
};

// Save changes
const saveChanges = async () => {
  isSaving.value = true;

  try {
    // Get org folder ID for file uploads
    const folderId = typeof props.organization.folder === "object"
      ? props.organization.folder?.id
      : props.organization.folder;

    // Upload new logo if provided
    let logoId = removedLogo.value ? null : getFileId(props.settings?.logo);
    if (logoFile.value) {
      const uploadedLogo = await uploadFile(logoFile.value, {
        title: `${props.organization.name} Logo`,
        folder: folderId || undefined,
      });
      logoId = (uploadedLogo as any)?.id || null;
    }

    // Upload new icon if provided
    let iconId = removedIcon.value ? null : getFileId(props.settings?.icon);
    if (iconFile.value) {
      const uploadedIcon = await uploadFile(iconFile.value, {
        title: `${props.organization.name} Icon`,
        folder: folderId || undefined,
      });
      iconId = (uploadedIcon as any)?.id || null;
    }

    // Prepare settings data
    const settingsData: Partial<BlockSetting> = {
      title: form.value.title,
      description: form.value.description,
      theme: form.value.theme as BlockSetting['theme'],
      logo: logoId,
      icon: iconId,
      status: "published",
    };

    let updatedSettings: BlockSetting;

    if (props.settings?.id) {
      // Update existing settings
      updatedSettings = await updateSettings(props.settings.id, settingsData);
    } else {
      // Create new settings
      const newSettings = await createSettings({
        ...settingsData,
        organization: props.organization.id,
      });

      // Link settings to organization
      await updateOrganization(props.organization.id, {
        settings: newSettings.id,
      });

      updatedSettings = newSettings;
    }

    // Clear file refs
    logoFile.value = null;
    iconFile.value = null;
    logoPreview.value = null;
    iconPreview.value = null;
    removedLogo.value = false;
    removedIcon.value = false;

    emit("updated", updatedSettings);
  } catch (error: any) {
    console.error("Failed to save branding:", error);
    toast.error(error.message || "Failed to save branding settings");
  } finally {
    isSaving.value = false;
  }
};
</script>
