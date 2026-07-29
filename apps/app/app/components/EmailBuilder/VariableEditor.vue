<script setup lang="ts">
// Schema-driven form for one block's variables. Renders a field per schema entry
// keyed by type (text/html/url/color/image/boolean) and emits a single-key patch
// on change. Ported from Earnest's BlockVariableEditor, on HOA Connect's tokens.
import { parseVariablesSchema, type BlockVariableDefinition } from "#core/shared/email/blocks";
import type { HoaNewsletterBlock } from "#core/types/directus";

const props = defineProps<{
  block: HoaNewsletterBlock;
  variables: Record<string, any>;
}>();
const emit = defineEmits<{ (e: "update", key: string, value: any): void }>();

const schema = computed<BlockVariableDefinition[]>(() =>
  parseVariablesSchema(props.block.variables_schema, props.block.mjml_source)
);

const debounced = useDebounceFn((key: string, value: any) => emit("update", key, value), 250);

function colorValue(v: any): string {
  const s = String(v ?? "");
  return /^#([0-9a-fA-F]{6})$/.test(s) ? s : "#333333";
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="!schema.length" class="text-xs t-text-muted">This block has no options to edit.</p>
    <div v-for="field in schema" :key="field.key" class="space-y-1">
      <Label class="text-xs font-medium t-text-secondary">{{ field.label }}</Label>

      <!-- boolean -->
      <label v-if="field.type === 'boolean'" class="flex items-center gap-2 text-sm t-text">
        <input
          type="checkbox"
          :checked="String(variables[field.key]) === 'true'"
          class="rounded border t-border"
          @change="emit('update', field.key, ($event.target as HTMLInputElement).checked ? 'true' : 'false')"
        />
        <span class="t-text-muted">{{ field.description || 'Enabled' }}</span>
      </label>

      <!-- color -->
      <div v-else-if="field.type === 'color'" class="flex items-center gap-2">
        <input
          type="color"
          :value="colorValue(variables[field.key])"
          class="h-8 w-10 rounded border t-border cursor-pointer bg-transparent"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
        <Input
          :model-value="variables[field.key] ?? ''"
          placeholder="#000000 or transparent"
          class="h-8 text-xs font-mono"
          @update:model-value="(v: string | number) => debounced(field.key, v)"
        />
      </div>

      <!-- html / long text -->
      <textarea
        v-else-if="field.type === 'html'"
        :value="variables[field.key] ?? ''"
        rows="3"
        class="w-full rounded-lg border t-border t-bg-subtle p-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
        :placeholder="field.description || 'Text or basic HTML…'"
        @input="debounced(field.key, ($event.target as HTMLTextAreaElement).value)"
      />

      <!-- image / url / text -->
      <div v-else class="relative">
        <Icon
          v-if="field.type === 'image' || field.type === 'url'"
          :name="field.type === 'image' ? 'lucide:image' : 'lucide:link'"
          class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 t-text-muted"
        />
        <Input
          :model-value="variables[field.key] ?? ''"
          :placeholder="field.description || (field.type === 'image' ? 'https://…/image.jpg' : field.type === 'url' ? 'https://…' : field.label)"
          class="h-8 text-sm"
          :class="{ 'pl-8': field.type === 'image' || field.type === 'url' }"
          @update:model-value="(v: string | number) => debounced(field.key, v)"
        />
      </div>
    </div>
  </div>
</template>
