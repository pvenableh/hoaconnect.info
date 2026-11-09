<script setup lang="ts">
/** A status word with its tone: community, subscription, invoice or charge. */
import { STATUS_LABEL, STATUS_TONE } from "#core/shared/ops/format";

const props = defineProps<{ status: string | null | undefined }>();

const tone = computed(() => STATUS_TONE[props.status ?? ""] ?? "muted");
const label = computed(() => STATUS_LABEL[props.status ?? ""] ?? props.status ?? "—");
const classes: Record<string, string> = {
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  muted: "t-bg-subtle t-text-muted",
};
</script>

<template>
  <span :class="['inline-flex items-center rounded-full px-2 py-0.5 type-micro font-medium whitespace-nowrap', classes[tone]]">
    {{ label }}
  </span>
</template>
