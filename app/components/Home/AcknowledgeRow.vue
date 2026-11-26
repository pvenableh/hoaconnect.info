<script setup lang="ts">
/**
 * HomeAcknowledgeRow — one notice that asks the person to confirm they have
 * seen it. On touch, swipe the row left to reveal "Acknowledge" and tap it
 * (useSwipeRow); with a mouse or keyboard the row's own button does the same.
 */
import { isOverdue } from "#core/shared/home/acknowledgments";

const props = defineProps<{
  id: string;
  title: string;
  due: string | null;
  swipe: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ acknowledge: [id: string, method: "swipe" | "button"] }>();

const row = useSwipeRow({ actionWidth: 96 });
const today = new Date().toISOString().slice(0, 10);
const overdue = computed(() => isOverdue({ ack_due: props.due }, today));
const dueLabel = computed(() =>
  props.due ? `${overdue.value ? "Was due" : "Due"} ${new Date(props.due).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "No due date"
);
const { buildOrgPath } = useOrgNavigation();

function onSwipeConfirm() {
  emit("acknowledge", props.id, "swipe");
  row.close();
}
</script>

<template>
  <li class="relative overflow-hidden" data-testid="home-ack-row">
    <div v-if="swipe" class="absolute inset-y-0 right-0 grid w-24 place-items-center t-bg-accent">
      <!-- allow-raw-button: the revealed half of a swipe row, sized to the swipe distance -->
      <button
        type="button"
        class="h-full w-full text-sm font-medium text-primary-foreground"
        :tabindex="row.open.value ? 0 : -1"
        :aria-hidden="!row.open.value"
        :disabled="busy"
        data-testid="home-ack-swipe-action"
        @click="onSwipeConfirm"
      >
        Acknowledge
      </button>
    </div>
    <div
      class="relative flex items-center gap-3 bg-card px-4 py-3"
      :style="swipe ? { transform: `translate3d(${row.offset.value}px, 0, 0)`, transition: row.dragging.value ? 'none' : 'transform 240ms var(--spring-out)', touchAction: 'pan-y' } : undefined"
      v-on="swipe ? { pointerdown: row.handlers.onPointerDown, pointermove: row.handlers.onPointerMove, pointerup: row.handlers.onPointerUp, pointercancel: row.handlers.onPointerCancel } : {}"
    >
      <Icon name="i-lucide-megaphone" class="h-4 w-4 shrink-0 t-text-muted" />
      <NuxtLink :to="buildOrgPath('/announcements')" class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium t-text">{{ title }}</span>
        <span class="block truncate text-sm" :class="overdue ? 'text-destructive' : 't-text-muted'">{{ dueLabel }}</span>
      </NuxtLink>
      <AppButton size="sm" variant="outline" :disabled="busy" @click="emit('acknowledge', id, 'button')">Acknowledge</AppButton>
    </div>
  </li>
</template>
