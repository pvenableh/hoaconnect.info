<template>
  <div class="space-y-6">
    <!-- SEO Metadata -->
    <Card>
      <CardHeader>
        <CardTitle>Search Engine Optimization</CardTitle>
        <CardDescription>
          Optimize how your site appears in search results
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- SEO Title -->
          <div class="space-y-2">
            <Label for="seoTitle">SEO Title</Label>
            <Input
              id="seoTitle"
              v-model="form.title"
              placeholder="Your HOA Name | Community Management"
              :disabled="isSaving"
              maxlength="60"
            />
            <p class="text-xs text-muted-foreground">
              {{ form.title?.length || 0 }}/60 characters (recommended max)
            </p>
          </div>

          <!-- Meta Description -->
          <div class="space-y-2">
            <Label for="metaDescription">Meta Description</Label>
            <textarea
              id="metaDescription"
              v-model="form.metaDescription"
              rows="3"
              class="w-full px-3 py-2 border rounded-md bg-background resize-none"
              placeholder="A compelling description of your HOA community that will appear in search results..."
              :disabled="isSaving"
              maxlength="160"
            />
            <p class="text-xs text-muted-foreground">
              {{ form.metaDescription?.length || 0 }}/160 characters (recommended max)
            </p>
          </div>

          <!-- Search Preview -->
          <div class="mt-6 p-4 rounded-lg border bg-muted/30">
            <p class="text-xs font-medium text-muted-foreground mb-2">Search Preview</p>
            <div class="space-y-1">
              <p class="text-blue-600 text-lg hover:underline cursor-pointer">
                {{ form.title || "Your Page Title" }}
              </p>
              <p class="text-green-700 text-sm">
                {{ previewUrl }}
              </p>
              <p class="text-sm text-muted-foreground">
                {{ form.metaDescription || "Your meta description will appear here..." }}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Open Graph / Social Media -->
    <Card>
      <CardHeader>
        <CardTitle>Social Media Preview</CardTitle>
        <CardDescription>
          How your site appears when shared on social media
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- OG Image Upload -->
          <div class="space-y-2">
            <Label>Social Share Image</Label>
            <div
              class="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              @click="triggerOgImageUpload"
              @drop.prevent="handleOgImageDrop"
              @dragover.prevent
            >
              <input
                ref="ogImageInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleOgImageChange"
              />
              <div v-if="ogImagePreview || currentOgImageUrl" class="mb-4">
                <img
                  :src="ogImagePreview || currentOgImageUrl"
                  alt="OG image preview"
                  class="max-h-40 mx-auto object-cover rounded"
                />
              </div>
              <div v-else>
                <Icon name="lucide:image-plus" class="h-12 w-12 mx-auto text-muted-foreground" />
              </div>
              <p class="text-sm text-muted-foreground mt-2">
                {{ ogImagePreview ? "Click to change" : "Click or drag to upload" }}
              </p>
              <p class="text-xs text-muted-foreground">
                Recommended: 1200x630px, PNG or JPG
              </p>
            </div>
            <Button
              v-if="ogImagePreview || currentOgImageUrl"
              variant="outline"
              size="sm"
              @click="removeOgImage"
              :disabled="isSaving"
            >
              <Icon name="lucide:trash-2" class="h-4 w-4 mr-1" />
              Remove Image
            </Button>
          </div>

          <!-- Social Preview Card -->
          <div class="mt-6 border rounded-lg overflow-hidden max-w-md">
            <div class="aspect-[1.91/1] bg-muted flex items-center justify-center">
              <img
                v-if="ogImagePreview || currentOgImageUrl"
                :src="ogImagePreview || currentOgImageUrl"
                alt="Preview"
                class="w-full h-full object-cover"
              />
              <Icon v-else name="lucide:image" class="h-16 w-16 text-muted-foreground" />
            </div>
            <div class="p-3 bg-background">
              <p class="text-xs text-muted-foreground uppercase">{{ previewDomain }}</p>
              <p class="font-semibold text-sm mt-1 line-clamp-1">
                {{ form.title || "Page Title" }}
              </p>
              <p class="text-xs text-muted-foreground mt-1 line-clamp-2">
                {{ form.metaDescription || "Page description..." }}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Advanced Settings -->
    <Card>
      <CardHeader>
        <CardTitle>Advanced Settings</CardTitle>
        <CardDescription>
          Additional SEO configuration options
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- No Index -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label>Hide from Search Engines</Label>
              <p class="text-sm text-muted-foreground">
                Prevent search engines from indexing this site
              </p>
            </div>
            <Switch v-model:checked="form.noIndex" :disabled="isSaving" />
          </div>

          <!-- No Follow -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label>No Follow Links</Label>
              <p class="text-sm text-muted-foreground">
                Prevent search engines from following links on this site
              </p>
            </div>
            <Switch v-model:checked="form.noFollow" :disabled="isSaving" />
          </div>

          <!-- Sitemap Settings -->
          <div class="pt-4 border-t">
            <Label class="mb-3 block">Sitemap Configuration</Label>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="changeFrequency" class="text-sm">Change Frequency</Label>
                <select
                  id="changeFrequency"
                  v-model="form.changeFrequency"
                  class="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  :disabled="isSaving"
                >
                  <option value="always">Always</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="never">Never</option>
                </select>
              </div>
              <div class="space-y-2">
                <Label for="priority" class="text-sm">Priority</Label>
                <select
                  id="priority"
                  v-model="form.priority"
                  class="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  :disabled="isSaving"
                >
                  <option value="1.0">1.0 (Highest)</option>
                  <option value="0.9">0.9</option>
                  <option value="0.8">0.8</option>
                  <option value="0.7">0.7</option>
                  <option value="0.6">0.6</option>
                  <option value="0.5">0.5 (Default)</option>
                  <option value="0.4">0.4</option>
                  <option value="0.3">0.3</option>
                  <option value="0.2">0.2</option>
                  <option value="0.1">0.1 (Lowest)</option>
                </select>
              </div>
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
        {{ isSaving ? "Saving..." : "Save SEO Settings" }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockSetting, ExtensionSeoMetadata } from "~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  settings: BlockSetting | null;
}>();

const emit = defineEmits<{
  updated: [settings: BlockSetting];
}>();

const config = useRuntimeConfig();
const { upload: uploadFile } = useDirectusFiles();
const { update: updateSettings } = useDirectusItems<BlockSetting>("block_settings");

const isSaving = ref(false);
const ogImageInput = ref<HTMLInputElement | null>(null);
const ogImageFile = ref<File | null>(null);
const ogImagePreview = ref<string | null>(null);
const removedOgImage = ref(false);

// Current OG image URL
const currentOgImageUrl = computed(() => {
  if (removedOgImage.value) return null;
  const ogImage = props.settings?.seo?.og_image;
  if (!ogImage) return null;
  // Check if it's a full URL or just a file ID
  if (ogImage.startsWith("http")) return ogImage;
  return `${config.public.directus.url}/assets/${ogImage}`;
});

// Preview URL
const previewUrl = computed(() => {
  const baseUrl = config.public.appUrl || "https://propertyflow.app";
  return baseUrl;
});

const previewDomain = computed(() => {
  try {
    const url = new URL(previewUrl.value);
    return url.hostname;
  } catch {
    return "propertyflow.app";
  }
});

// Form data
const form = ref({
  title: props.settings?.seo?.title || "",
  metaDescription: props.settings?.seo?.meta_description || "",
  noIndex: props.settings?.seo?.no_index || false,
  noFollow: props.settings?.seo?.no_follow || false,
  changeFrequency: props.settings?.seo?.sitemap?.change_frequency || "weekly",
  priority: props.settings?.seo?.sitemap?.priority || "0.5",
});

// Watch for prop changes
watch(
  () => props.settings,
  (newSettings) => {
    if (newSettings?.seo) {
      form.value = {
        title: newSettings.seo.title || "",
        metaDescription: newSettings.seo.meta_description || "",
        noIndex: newSettings.seo.no_index || false,
        noFollow: newSettings.seo.no_follow || false,
        changeFrequency: newSettings.seo.sitemap?.change_frequency || "weekly",
        priority: newSettings.seo.sitemap?.priority || "0.5",
      };
    }
  },
  { deep: true }
);

// File upload handlers
const triggerOgImageUpload = () => {
  ogImageInput.value?.click();
};

const handleOgImageChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    ogImageFile.value = file;
    ogImagePreview.value = URL.createObjectURL(file);
    removedOgImage.value = false;
  }
};

const handleOgImageDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    ogImageFile.value = file;
    ogImagePreview.value = URL.createObjectURL(file);
    removedOgImage.value = false;
  }
};

const removeOgImage = () => {
  ogImageFile.value = null;
  ogImagePreview.value = null;
  removedOgImage.value = true;
  if (ogImageInput.value) ogImageInput.value.value = "";
};

// Save changes
const saveChanges = async () => {
  if (!props.settings?.id) {
    toast.error("Please save branding settings first");
    return;
  }

  isSaving.value = true;

  try {
    // Upload OG image if provided
    let ogImageUrl = removedOgImage.value ? undefined : props.settings?.seo?.og_image;
    if (ogImageFile.value) {
      const uploaded = await uploadFile(ogImageFile.value, {
        title: "Social Share Image",
      });
      ogImageUrl = (uploaded as any)?.id || undefined;
    }

    // Build SEO object
    const seoData: ExtensionSeoMetadata = {
      title: form.value.title || undefined,
      meta_description: form.value.metaDescription || undefined,
      og_image: ogImageUrl,
      no_index: form.value.noIndex || undefined,
      no_follow: form.value.noFollow || undefined,
      sitemap: {
        change_frequency: form.value.changeFrequency as any,
        priority: form.value.priority,
      },
    };

    // Update settings
    const updated = await updateSettings(props.settings.id, {
      seo: seoData,
    });

    // Clear file refs
    ogImageFile.value = null;
    ogImagePreview.value = null;
    removedOgImage.value = false;

    emit("updated", updated);
  } catch (error: any) {
    console.error("Failed to save SEO settings:", error);
    toast.error(error.message || "Failed to save SEO settings");
  } finally {
    isSaving.value = false;
  }
};
</script>
