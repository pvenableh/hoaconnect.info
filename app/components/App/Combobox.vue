<!--
  AppCombobox — HOA Connect's type-to-pick field, composed from the stock
  shadcn-vue combobox parts (left as shipped in app/components/ui/, so they can
  be updated by re-pulling them):

  - ONE glass pill (`glass-field` on the anchor) holds a bare input and the
    chevron trigger, so focus-within lights the whole control. The stock
    ComboboxInput is command-palette shaped (its own search icon and bottom
    rule), so the bare input here is reka's ComboboxInput;
  - the list is floating chrome, the same material as Popover / DropdownMenu,
    opening from the start edge at the trigger's width;
  - items keep room on the right for an absolute check, so labels never shift.

  `.glass-surface` paints background, border and shadow unlayered, so it beats
  the stock list's `bg-popover border shadow-md`; the rest are class swaps
  tailwind-merge resolves.

  <AppCombobox v-model="assignee" :options="names" placeholder="Assign to…" />
  Attributes (class, data-*) land on the pill, not the root.
  Options are strings or { value, label }. The default slot replaces an item's
  label: <template #default="{ option }">…</template>.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ComboboxInput as ComboboxInputBare } from "reka-ui";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

type Option = string | { value: string; label: string };

const props = withDefaults(
  defineProps<{
    options: Option[];
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  { placeholder: undefined, emptyText: "Nothing matches.", disabled: false, class: undefined },
);

const model = defineModel<string>();

const items = computed(() =>
  props.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
);
const labelOf = (value: unknown) =>
  items.value.find((i) => i.value === value)?.label ?? (typeof value === "string" ? value : "");
</script>

<template>
  <Combobox v-model="model" :disabled="disabled">
    <ComboboxAnchor
      :class="cn('glass-field relative flex h-10 w-[200px] items-center gap-1 rounded-full pl-3.5 pr-1', props.class)"
      v-bind="$attrs"
    >
      <ComboboxInputBare
        data-slot="combobox-input"
        :display-value="labelOf"
        :placeholder="placeholder"
        class="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      />
      <ComboboxTrigger
        tabindex="-1"
        aria-label="Show options"
        class="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center rounded-full transition-colors"
      >
        <Icon name="lucide:chevrons-up-down" class="size-4" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxList
      align="start"
      :side-offset="6"
      class="glass-surface glass-surface--strong chrome-float w-(--reka-combobox-trigger-width) min-w-[8rem] rounded-xl p-1"
    >
      <ComboboxViewport class="max-h-72">
        <ComboboxEmpty class="helper-text text-xs">{{ emptyText }}</ComboboxEmpty>
        <ComboboxGroup>
          <ComboboxItem
            v-for="option in items"
            :key="option.value"
            :value="option.value"
            class="relative w-full rounded-lg pr-8"
          >
            <slot :option="option">{{ option.label }}</slot>
            <ComboboxItemIndicator class="absolute right-2 flex size-3.5 items-center justify-center">
              <Icon name="lucide:check" class="size-4" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
