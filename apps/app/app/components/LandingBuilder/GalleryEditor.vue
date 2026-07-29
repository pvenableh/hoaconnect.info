<script setup lang="ts">
// Inline editor for the Gallery section (single instance; lives on
// landing.gallery). Hand-picked images (upload/library) or a live storage folder.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";
import type { PickedFile } from "#core/app/composables/useOrgStorage";

const { landing, builder, uploadImage, fileUrl } = useLandingBuilderContext();
const g = computed(() => builder.ensureGallery());

async function onUpload(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const id = await uploadImage(f, "Gallery image");
  if (id) g.value.images.push(id);
  (e.target as HTMLInputElement).value = "";
}
function onPick(files: PickedFile[]) {
  for (const f of files) if (f?.id) g.value.images.push(f.id);
}
const removeImage = (i: number) => g.value.images.splice(i, 1);
</script>

<template>
  <div v-if="landing.gallery" class="space-y-4">
    <div class="space-y-1.5">
      <Label>Caption</Label>
      <Input v-model="landing.gallery.caption" placeholder="A Closer Look" />
    </div>
    <div class="space-y-1.5">
      <Label>Image source</Label>
      <div class="inline-flex rounded-lg border t-border p-0.5">
        <button
          v-for="src in (['manual', 'folder'] as const)"
          :key="src"
          type="button"
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
          :class="landing.gallery.source === src ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
          @click="landing.gallery.source = src"
        >
          {{ src === "manual" ? "Hand-picked" : "From a folder" }}
        </button>
      </div>
    </div>

    <template v-if="landing.gallery.source === 'manual'">
      <div class="flex items-center justify-between">
        <Label>Images</Label>
        <div class="flex items-center gap-1.5">
          <label class="inline-flex">
            <input type="file" accept="image/*" class="hidden" @change="onUpload" />
            <span class="inline-flex items-center gap-1.5 rounded-md border t-border px-2.5 h-8 text-xs font-medium cursor-pointer hover:t-bg-subtle">
              <Icon name="lucide:upload" class="w-3.5 h-3.5" /> Upload
            </span>
          </label>
          <StorageFilePickerButton accept="image" source="image" label="Library" icon="lucide:folder-open" variant="outline" size="sm" :multiple="true" @select="onPick" />
        </div>
      </div>
      <div v-if="!landing.gallery.images.length" class="text-xs t-text-muted">No images yet.</div>
      <div class="flex flex-wrap gap-3">
        <div v-for="(id, j) in landing.gallery.images" :key="id" class="relative">
          <img :src="fileUrl(id, 'small')" class="h-20 w-28 object-cover rounded border t-border" />
          <button
            type="button"
            class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
            @click="removeImage(j)"
          >
            <Icon name="lucide:x" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="space-y-1.5">
        <Label>Folder ID (optional)</Label>
        <Input v-model="landing.gallery.folder" placeholder="Leave blank for your main folder" class="font-mono text-xs" />
        <p class="text-xs t-text-muted">
          Pulls images live from this folder in your file library (and its subfolders). Leave blank
          to use your organization's main folder. Find a folder's ID under Settings → Files.
        </p>
      </div>
    </template>
  </div>
</template>
