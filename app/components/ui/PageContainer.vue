<script setup lang="ts">
// Standard page container for authenticated app pages. One width everywhere so
// the layout never jumps between empty and full states. Pass `wide` for the few
// pages that need the extra room (e.g. the Directory grid). Inner spacing /
// extra classes can be merged via the `class` prop (tailwind-merge resolves
// any width override).
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  class?: HTMLAttributes["class"];
  /** Opt into the wider container for grid-heavy pages */
  wide?: boolean;
}

const props = defineProps<Props>();

// Publish the active width so the breadcrumb row can match it (stays left-aligned
// with content). The breadcrumb resets to standard (pre-flush) on every route
// change; we publish in onMounted (post-flush) so this always wins for the
// destination page. Pages that render their own container (no PageContainer)
// keep the standard width.
const { setPageWide } = usePageWidth();
onMounted(() => setPageWide(!!props.wide));
</script>

<template>
  <div
    :class="
      cn(
        'mx-auto w-full px-4 sm:px-6 py-6',
        props.wide ? 'max-w-7xl' : 'max-w-6xl',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
