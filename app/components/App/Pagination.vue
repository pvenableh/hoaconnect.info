<!--
  AppPagination — HOA Connect's page picker, composed from the stock shadcn-vue
  pagination parts (left as shipped in app/components/ui/, so they can be updated
  by re-pulling them):

  - the current page wears the active thumb (`glass-active-thumb`) instead of the
    stock outline button: "one filled button per view", and the current page is
    a state, not an action. It is rendered as a ghost item with aria-current,
    so the thumb is its only material;
  - Previous / Next are chevrons only (reka gives them their aria-labels);
  - page numbers are tabular, so the row does not jitter as they change;
  - every item is a pill, like every button (`appButtonClasses`).

  `v-model:page`, `total`, `itemsPerPage`, `siblingCount`, `showEdges` and the
  rest are reka's PaginationRoot props, passed through.
-->
<script setup lang="ts">
import type { PaginationRootEmits, PaginationRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { useForwardPropsEmits } from "reka-ui";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { appButtonClasses } from "./button-variants";

const props = defineProps<PaginationRootProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<PaginationRootEmits>();

const forwarded = useForwardPropsEmits(reactiveOmit(props, "class"), emits);

// The stock items apply buttonVariants() (ghost) themselves; this adds the pill.
const pill = appButtonClasses({ variant: "ghost" });
</script>

<template>
  <Pagination v-slot="{ page }" v-bind="forwarded" :class="props.class">
    <PaginationContent v-slot="{ items }">
      <PaginationPrevious :class="cn(pill, 'sm:px-2.5')">
        <Icon name="lucide:chevron-left" class="size-4" />
      </PaginationPrevious>
      <template v-for="(item, index) in items" :key="index">
        <PaginationItem
          v-if="item.type === 'page'"
          :value="item.value"
          :aria-current="item.value === page ? 'page' : undefined"
          :class="cn(pill, 'tabular-nums', item.value === page && 'glass-active-thumb text-foreground hover:bg-transparent')"
        >
          {{ item.value }}
        </PaginationItem>
        <PaginationEllipsis v-else :index="index" class="text-muted-foreground" />
      </template>
      <PaginationNext :class="cn(pill, 'sm:px-2.5')">
        <Icon name="lucide:chevron-right" class="size-4" />
      </PaginationNext>
    </PaginationContent>
  </Pagination>
</template>
