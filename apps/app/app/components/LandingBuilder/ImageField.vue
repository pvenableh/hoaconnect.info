<script setup lang="ts">
// A single-image field for the landing builder: shows the current image and
// lets the admin upload a new file OR pick one from the org library (the
// universal FilePicker). Emits the chosen Directus file id (or null on clear).
// Reused by the content / gallery / lifestyle / listing editors.
import { toast } from "vue-sonner";
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";
import type { PickedFile } from "#core/app/composables/useOrgStorage";

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined;
    label?: string;
    /** Tailwind size classes for the thumbnail (default 16:10-ish tile). */
    thumbClass?: string;
    title?: string;
  }>(),
  { label: "Image", thumbClass: "h-16 w-24", title: "Section image" }
);
const emit = defineEmits<{ (e: "update:modelValue", id: string | null): void }>();

const { uploadImage, fileUrl } = useLandingBuilderContext();
const uploading = ref(false);

const src = computed(() => (props.modelValue ? fileUrl(props.modelValue, "small") : ""));

async function onUpload(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  uploading.value = true;
  try {
    const id = await uploadImage(f, props.title);
    if (id) emit("update:modelValue", id);
  } catch {
    toast.error("Image upload failed");
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}
function onPick(files: PickedFile[]) {
  const id = files?.[0]?.id;
  if (id) emit("update:modelValue", id);
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      v-if="src"
      class="rounded-lg bg-cover bg-center border t-border shrink-0"
      :class="thumbClass"
      :style="{ backgroundImage: `url('${src}')` }"
    />
    <div
      v-else
      class="rounded-lg border border-dashed t-border shrink-0 flex items-center justify-center t-text-muted"
      :class="thumbClass"
    >
      <Icon name="lucide:image" class="w-5 h-5" />
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <label class="inline-flex">
        <input type="file" accept="image/*" class="hidden" @change="onUpload" />
        <span
          class="inline-flex items-center gap-1.5 rounded-md border t-border px-2.5 h-8 text-xs font-medium cursor-pointer hover:t-bg-subtle transition-colors"
          :class="{ 'opacity-60 pointer-events-none': uploading }"
        >
          <Icon :name="uploading ? 'lucide:loader-circle' : 'lucide:upload'" class="w-3.5 h-3.5" :class="{ 'animate-spin': uploading }" />
          {{ modelValue ? "Replace" : "Upload" }}
        </span>
      </label>
      <StorageFilePickerButton
        accept="image"
        source="image"
        label="Library"
        icon="lucide:folder-open"
        variant="outline"
        size="sm"
        @select="onPick"
      />
      <Button
        v-if="modelValue"
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0"
        title="Remove image"
        @click="emit('update:modelValue', null)"
      >
        <Icon name="lucide:x" class="w-4 h-4 text-red-500" />
      </Button>
    </div>
  </div>
</template>
