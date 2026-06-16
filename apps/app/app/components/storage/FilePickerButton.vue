<script setup lang="ts">
/**
 * FilePickerButton — a self-contained trigger + FilePickerDialog.
 * Drop into any composer to let approved users attach existing org files.
 *
 *   <FilePickerButton source="comment" multiple @select="onPicked" />
 */
import type { PickedFile, StorageSource } from "#core/app/composables/useOrgStorage";

withDefaults(
  defineProps<{
    multiple?: boolean;
    accept?: "all" | "image";
    source?: StorageSource;
    title?: string;
    label?: string;
    icon?: string;
    variant?: string;
    size?: string;
    iconOnly?: boolean;
  }>(),
  {
    multiple: false,
    accept: "all",
    label: "Library",
    icon: "lucide:folder-open",
    variant: "ghost",
    size: "sm",
    iconOnly: false,
  }
);

const emit = defineEmits<{ select: [files: PickedFile[]] }>();

const open = ref(false);

function onSelect(files: PickedFile[]) {
  emit("select", files);
}
</script>

<template>
  <span>
    <Button
      :variant="variant as any"
      :size="size as any"
      type="button"
      :title="title || label"
      @click="open = true"
    >
      <Icon :name="icon" :class="iconOnly ? 'h-4 w-4' : 'mr-1.5 h-4 w-4'" />
      <span v-if="!iconOnly">{{ label }}</span>
    </Button>
    <StorageFilePickerDialog
      v-model:open="open"
      :multiple="multiple"
      :accept="accept"
      :source="source"
      :title="title || 'Add a file'"
      @select="onSelect"
    />
  </span>
</template>
