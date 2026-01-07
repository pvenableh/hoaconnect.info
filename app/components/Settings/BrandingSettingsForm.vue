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
          Choose a theme for your organization's site
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="theme">Site Theme</Label>
            <select
              id="theme"
              v-model="form.theme"
              class="w-full px-3 py-2 border rounded-md bg-background"
              :disabled="isSaving"
            >
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
            </select>
            <p class="text-sm text-muted-foreground mt-2">
              {{ form.theme === 'classic' ? 'Classic theme uses warm, elegant colors with serif fonts.' : 'Modern theme uses clean lines with a contemporary feel.' }}
            </p>
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

// Extract colors from settings
const getColors = () => {
  const colors = props.settings?.colors?.[0];
  return {
    primary: colors?.primary || "#2563eb",
    secondary: colors?.secondary || "#64748b",
    accent: colors?.accent || "#f59e0b",
  };
};

// Form data
const form = ref({
  primaryColor: getColors().primary,
  secondaryColor: getColors().secondary,
  accentColor: getColors().accent,
  headingFont: props.settings?.heading_font || "sans-serif",
  bodyFont: props.settings?.body_font || "sans-serif",
  title: props.settings?.title || "",
  description: props.settings?.description || "",
  theme: (props.settings?.theme as 'classic' | 'modern') || "classic",
});

// Watch for prop changes
watch(
  () => props.settings,
  (newSettings) => {
    if (newSettings) {
      const colors = newSettings.colors?.[0];
      form.value = {
        primaryColor: colors?.primary || "#2563eb",
        secondaryColor: colors?.secondary || "#64748b",
        accentColor: colors?.accent || "#f59e0b",
        headingFont: newSettings.heading_font || "sans-serif",
        bodyFont: newSettings.body_font || "sans-serif",
        title: newSettings.title || "",
        description: newSettings.description || "",
        theme: (newSettings.theme as 'classic' | 'modern') || "classic",
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
      heading_font: form.value.headingFont as "serif" | "sans-serif",
      body_font: form.value.bodyFont as "serif" | "sans-serif",
      colors: [
        {
          primary: form.value.primaryColor,
          secondary: form.value.secondaryColor,
          accent: form.value.accentColor,
        },
      ],
      theme: form.value.theme,
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
