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
                Recommended: 400x100px. Use a transparent PNG for the public site —
                or an SVG to enable the animated color-fill logo in the header.
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
              <option value="luxury">Luxury (Premium)</option>
            </select>
            <p class="text-sm text-muted-foreground mt-2">
              {{ themeDescriptions[form.theme] }}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Brand Palette -->
    <Card>
      <CardHeader>
        <CardTitle>Brand Palette</CardTitle>
        <CardDescription>
          Your community's colors — used on your site and to brand outgoing emails
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="space-y-2">
              <Label for="primaryColor">Primary</Label>
              <div class="flex items-center gap-2">
                <input
                  id="primaryColor"
                  type="color"
                  v-model="form.primaryColor"
                  class="h-9 w-12 rounded border cursor-pointer bg-background"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
                <Input
                  v-model="form.primaryColor"
                  class="font-mono"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
              </div>
              <p class="text-xs text-muted-foreground">Email header &amp; footer bands</p>
            </div>
            <div class="space-y-2">
              <Label for="secondaryColor">Secondary</Label>
              <div class="flex items-center gap-2">
                <input
                  id="secondaryColor"
                  type="color"
                  v-model="form.secondaryColor"
                  class="h-9 w-12 rounded border cursor-pointer bg-background"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
                <Input
                  v-model="form.secondaryColor"
                  class="font-mono"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
              </div>
              <p class="text-xs text-muted-foreground">Site accents</p>
            </div>
            <div class="space-y-2">
              <Label for="accentColor">Accent</Label>
              <div class="flex items-center gap-2">
                <input
                  id="accentColor"
                  type="color"
                  v-model="form.accentColor"
                  class="h-9 w-12 rounded border cursor-pointer bg-background"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
                <Input
                  v-model="form.accentColor"
                  class="font-mono"
                  :disabled="isSaving"
                  @input="markPaletteDirty"
                />
              </div>
              <p class="text-xs text-muted-foreground">Email type badge</p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <p class="text-xs text-muted-foreground">
              {{ usingPlatformPalette
                ? "Using the platform's default email colors. Pick colors above to brand your emails."
                : "Alert emails keep their red badge regardless of your palette, so urgent messages stay urgent." }}
            </p>
            <Button
              v-if="!usingPlatformPalette"
              variant="outline"
              size="sm"
              @click="resetPalette"
              :disabled="isSaving"
            >
              Reset to defaults
            </Button>
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

    <!-- Email Branding -->
    <Card>
      <CardHeader>
        <CardTitle>Email Branding</CardTitle>
        <CardDescription>
          Defaults for outgoing emails &amp; the "view on web" page. Each send can override these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Header line -->
          <div class="space-y-2">
            <Label for="header_text">Header line</Label>
            <Input
              id="header_text"
              v-model="form.headerText"
              placeholder="Official Communication of {name}"
              :disabled="isSaving"
            />
            <p class="text-xs text-muted-foreground">
              Shown under the logo. Use <code>{name}</code> or <code>{legal_name}</code> as placeholders.
            </p>
          </div>

          <!-- CC/BCC threshold -->
          <div class="space-y-2">
            <Label for="cc_bcc_threshold">CC/BCC visibility cutoff</Label>
            <Input
              id="cc_bcc_threshold"
              v-model.number="form.ccBccThreshold"
              type="number"
              min="1"
              class="w-32"
              :disabled="isSaving"
            />
            <p class="text-xs text-muted-foreground">
              At or below this many recipients, CC/BCC are attached to each email so everyone
              sees the copy (e.g. a violation notice). Above it, CC/BCC contacts each get one copy.
            </p>
          </div>

          <!-- Homepage URL -->
          <div class="space-y-2">
            <Label for="homepage_url">Footer homepage link</Label>
            <Input
              id="homepage_url"
              v-model="form.homepageUrl"
              placeholder="https://yourbuilding.com"
              :disabled="isSaving"
            />
            <p class="text-xs text-muted-foreground">
              Optional. Falls back to your external site, then your resident portal.
            </p>
          </div>

          <!-- Footer building photo -->
          <div class="space-y-2">
            <Label>Footer building photo</Label>
            <div
              class="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              @click="triggerFooterUpload"
              @drop.prevent="handleFooterDrop"
              @dragover.prevent
            >
              <input
                ref="footerInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFooterChange"
              />
              <div v-if="footerPreview || currentFooterImageUrl" class="mb-4">
                <img
                  :src="footerPreview || currentFooterImageUrl"
                  alt="Footer building photo preview"
                  class="max-h-40 w-full mx-auto object-cover rounded"
                />
              </div>
              <div v-else>
                <Icon name="lucide:building" class="h-12 w-12 mx-auto text-muted-foreground" />
              </div>
              <p class="text-sm text-muted-foreground mt-2">
                {{ footerPreview ? "Click to change" : "Click or drag to upload" }}
              </p>
              <p class="text-xs text-muted-foreground">
                Shown full-width at the bottom of emails. Recommended: 1200px wide.
              </p>
            </div>
            <Button
              v-if="footerPreview || currentFooterImageUrl"
              variant="outline"
              size="sm"
              @click="removeFooterImage"
              :disabled="isSaving"
            >
              <Icon name="lucide:trash-2" class="h-4 w-4 mr-1" />
              Remove Photo
            </Button>
          </div>

          <!-- Live email preview -->
          <div class="space-y-2 pt-2 border-t">
            <div class="flex items-center justify-between gap-4 pt-2">
              <Label for="emailPreviewType">Email preview</Label>
              <select
                id="emailPreviewType"
                v-model="previewType"
                class="px-3 py-1.5 border rounded-md bg-background text-sm"
              >
                <option value="notice">Notice</option>
                <option value="announcement">Announcement</option>
                <option value="newsletter">Newsletter</option>
                <option value="reminder">Reminder</option>
                <option value="alert">Alert</option>
                <option value="basic">Basic</option>
              </select>
            </div>
            <p class="text-xs text-muted-foreground">
              How this email type will look for your community — including unsaved palette changes.
            </p>
            <div class="relative rounded-lg border overflow-hidden bg-white">
              <div
                v-if="previewLoading && !previewHtml"
                class="flex items-center justify-center h-[560px] text-muted-foreground"
              >
                <Icon name="lucide:loader-2" class="h-6 w-6 animate-spin" />
              </div>
              <iframe
                v-else
                :srcdoc="previewHtml"
                sandbox=""
                title="Email preview"
                class="w-full h-[560px] bg-white"
                :class="{ 'opacity-60': previewLoading }"
              />
            </div>
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
import type { HoaOrganization, BlockSetting, DirectusFile } from "#core/types/directus";
import { DEFAULT_CC_BCC_THRESHOLD } from "#core/shared/email/cc";
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
const footerInput = ref<HTMLInputElement | null>(null);
const logoFile = ref<File | null>(null);
const iconFile = ref<File | null>(null);
const footerFile = ref<File | null>(null);
const logoPreview = ref<string | null>(null);
const iconPreview = ref<string | null>(null);
const footerPreview = ref<string | null>(null);
const removedLogo = ref(false);
const removedIcon = ref(false);
const removedFooter = ref(false);

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

const currentFooterImageUrl = computed(() => {
  if (removedFooter.value) return null;
  const footerId = getFileId(props.settings?.footer_image);
  if (!footerId) return null;
  return `${config.public.directus.url}/assets/${footerId}`;
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
  theme: (props.settings?.theme as 'classic' | 'modern' | 'luxury') || "classic",
  headerText: props.settings?.header_text || "",
  homepageUrl: props.settings?.homepage_url || "",
  ccBccThreshold: props.settings?.cc_bcc_threshold ?? DEFAULT_CC_BCC_THRESHOLD,
});

// Palette state. The form has always carried colour values (defaulted when the
// org has none), but emails now consume the palette — so `colors` is only
// written when the org already had one or the user actually touched a picker,
// and never silently defaulted into existence by an unrelated save.
const paletteDirty = ref(false);
const paletteCleared = ref(false);
const hadPalette = computed(() => !!props.settings?.colors?.length);
const usingPlatformPalette = computed(
  () => paletteCleared.value || (!paletteDirty.value && !hadPalette.value)
);

const markPaletteDirty = () => {
  paletteDirty.value = true;
  paletteCleared.value = false;
};

const resetPalette = () => {
  const defaults = { primary: "#2563eb", secondary: "#64748b", accent: "#f59e0b" };
  form.value.primaryColor = defaults.primary;
  form.value.secondaryColor = defaults.secondary;
  form.value.accentColor = defaults.accent;
  paletteDirty.value = false;
  paletteCleared.value = true;
};

// The palette to save/preview: null = platform defaults, undefined = keep stored.
const effectivePalette = computed(() => {
  if (paletteCleared.value) return null;
  if (paletteDirty.value || hadPalette.value) {
    return [
      {
        primary: form.value.primaryColor,
        secondary: form.value.secondaryColor,
        accent: form.value.accentColor,
      },
    ];
  }
  return undefined;
});

// Live email preview
const previewType = ref("notice");
const previewHtml = ref("");
const previewLoading = ref(false);

const refreshPreview = async () => {
  previewLoading.value = true;
  try {
    const res = await $fetch<{ html: string }>("/api/email/branding-preview", {
      method: "POST",
      body: {
        organizationId: props.organization.id,
        emailType: previewType.value,
        colors: effectivePalette.value,
      },
    });
    previewHtml.value = res.html;
  } catch (error) {
    console.error("Failed to render email preview:", error);
  } finally {
    previewLoading.value = false;
  }
};

const refreshPreviewDebounced = useDebounceFn(refreshPreview, 400);

watch([previewType, effectivePalette], () => refreshPreviewDebounced(), { deep: true });
onMounted(refreshPreview);

// Theme descriptions for the settings form
const themeDescriptions: Record<'classic' | 'modern' | 'luxury', string> = {
  classic: 'Classic theme uses warm, elegant colors with serif fonts.',
  modern: 'Modern theme uses clean lines with a contemporary feel.',
  luxury: 'Luxury theme features gallery whites, aged brass accents, and refined typography.',
};

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
        theme: (newSettings.theme as 'classic' | 'modern' | 'luxury') || "classic",
        headerText: newSettings.header_text || "",
        homepageUrl: newSettings.homepage_url || "",
        ccBccThreshold: newSettings.cc_bcc_threshold ?? DEFAULT_CC_BCC_THRESHOLD,
      };
      paletteDirty.value = false;
      paletteCleared.value = false;
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

const triggerFooterUpload = () => {
  footerInput.value?.click();
};

const handleFooterChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    footerFile.value = file;
    footerPreview.value = URL.createObjectURL(file);
    removedFooter.value = false;
  }
};

const handleFooterDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    footerFile.value = file;
    footerPreview.value = URL.createObjectURL(file);
    removedFooter.value = false;
  }
};

const removeFooterImage = () => {
  footerFile.value = null;
  footerPreview.value = null;
  removedFooter.value = true;
  if (footerInput.value) footerInput.value.value = "";
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

    // Upload new footer building photo if provided
    let footerImageId = removedFooter.value ? null : getFileId(props.settings?.footer_image);
    if (footerFile.value) {
      const uploadedFooter = await uploadFile(footerFile.value, {
        title: `${props.organization.name} Email Footer Photo`,
        folder: folderId || undefined,
      });
      footerImageId = (uploadedFooter as any)?.id || null;
    }

    // Prepare settings data
    const settingsData: Partial<BlockSetting> = {
      title: form.value.title,
      description: form.value.description,
      heading_font: form.value.headingFont as "serif" | "sans-serif",
      body_font: form.value.bodyFont as "serif" | "sans-serif",
      theme: form.value.theme as BlockSetting["theme"],
      logo: logoId,
      icon: iconId,
      header_text: form.value.headerText || null,
      homepage_url: form.value.homepageUrl || null,
      footer_image: footerImageId,
      cc_bcc_threshold: Number(form.value.ccBccThreshold) || DEFAULT_CC_BCC_THRESHOLD,
      status: "published",
    };

    // Only write the palette when it means something (see the note above).
    if (effectivePalette.value !== undefined) {
      settingsData.colors = effectivePalette.value;
    }

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
    footerFile.value = null;
    logoPreview.value = null;
    iconPreview.value = null;
    footerPreview.value = null;
    removedLogo.value = false;
    removedIcon.value = false;
    removedFooter.value = false;
    paletteDirty.value = false;
    paletteCleared.value = false;

    emit("updated", updatedSettings);
    refreshPreviewDebounced();
  } catch (error: any) {
    console.error("Failed to save branding:", error);
    toast.error(error.message || "Failed to save branding settings");
  } finally {
    isSaving.value = false;
  }
};
</script>
