<script setup lang="ts">
/**
 * One row of a pile. Every row obeys the same contract regardless of which
 * source produced it: domain dot · title · evidence · ONE primary verb, plus a
 * quiet escape.
 *
 * ── Proposals reuse <AiActionCard> ──────────────────────────────────────────
 * A proposal row does not draw its own card. It renders `<AiActionCard>`, the
 * same card the assistant panel, the Director pill and the Board Room's steps
 * already use. Session 8 made this call for the Board Room and the reasoning is
 * unchanged: a third proposal card would be a third place the `outbound`
 * warning, the Undo affordance and the expired-vs-rejected distinction can
 * drift apart. It also means `send_email` arrives here already carrying its
 * expandable To / Subject / body preview — nothing outbound is ever approved
 * blind, and that safety net is maintained in one file.
 *
 * Decisions are emitted upward rather than posted here, because the page owns
 * `useAiActions` and its shared pending count; a row that fetched on its own
 * would leave the launcher badge disagreeing with the screen.
 */
import type { StackItem } from "#core/app/composables/useStackItems";
import { DOMAIN_DOT, DOMAIN_LABEL } from "#core/app/composables/useStackItems";

const props = defineProps<{
  item: StackItem;
  /** Wizard mode renders the row larger, one card at a time. */
  big?: boolean;
  busyId?: string | null;
  /** The notice currently being turned into a proposal, if any. */
  proposingId?: string | null;
}>();

const emit = defineEmits<{
  (e: "handled", key: string): void;
  (e: "approve", id: string): void;
  (e: "reject", id: string): void;
  (e: "undo", id: string): void;
  (e: "edit", id: string, payload: Record<string, any>): void;
  (e: "dismiss", noticeId: string): void;
  (e: "propose", noticeId: string): void;
}>();

const { buildOrgPath, navigateToOrg } = useOrgNavigation();

const dotClass = computed(() =>
  props.item.domain ? DOMAIN_DOT[props.item.domain] : "bg-slate-400"
);
const dotLabel = computed(() =>
  props.item.domain ? DOMAIN_LABEL[props.item.domain] : "General"
);

const busy = computed(() => !!props.busyId && props.busyId === props.item.action?.id);

function openRoute() {
  if (!props.item.route) return;
  navigateToOrg(props.item.route);
}

// Turning a notice into a proposal is emitted upward for the same reason a
// decision is: the page owns the queue the new row lands in, so it is the only
// place that can refresh Decide once the row exists.
</script>

<template>
  <!-- Proposals render the shared card whole — no wrapper chrome, or the row
       would gain a second border around a card that already has one. -->
  <AiActionCard
    v-if="item.kind === 'proposal' && item.action"
    :action="item.action"
    :busy="busy"
    @approve="(id: string) => emit('approve', id)"
    @reject="(id: string) => emit('reject', id)"
    @undo="(id: string) => emit('undo', id)"
    @edit="(id: string, payload: Record<string, any>) => emit('edit', id, payload)"
  />

  <div v-else class="ios-card" :class="big ? 'p-5' : 'p-3.5'">
    <!-- `flex-wrap` plus a full-width action group is the whole mobile fix: on a
         375px screen the verb column was taking two fifths of the row and
         squeezing a one-line title into three. Below `sm` the controls drop to
         their own line, right-aligned; from `sm` up they sit back alongside. -->
    <div class="flex items-start gap-3 flex-wrap">
      <span
        class="mt-1.5 w-2 h-2 rounded-full shrink-0"
        :class="dotClass"
        :title="dotLabel"
        aria-hidden="true"
      />
      <div class="flex-1 min-w-0">
        <p class="font-medium t-text leading-snug" :class="big ? 'text-base' : 'text-sm'">
          {{ item.title }}
        </p>
        <p class="text-xs t-text-muted mt-0.5" :class="big ? '' : 'line-clamp-2'">
          {{ item.sub }}
        </p>
      </div>

      <!-- One primary verb; the escape stays quiet. -->
      <div
        class="flex items-center gap-1.5 shrink-0 w-full justify-end sm:w-auto sm:justify-start"
        @click.stop
      >
        <template v-if="item.kind === 'notice'">
          <Button
            v-if="item.notice?.proposedAction"
            size="sm"
            class="rounded-full"
            :disabled="proposingId === item.notice.id"
            :title="item.notice.proposedAction.title"
            @click="emit('propose', item.notice.id)"
          >
            <Icon
              :name="proposingId === item.notice.id ? 'i-lucide-loader-2' : 'i-lucide-sparkles'"
              class="w-3.5 h-3.5 mr-1.5"
              :class="proposingId === item.notice.id ? 'animate-spin' : ''"
            />
            Propose
          </Button>
          <NuxtLink v-else-if="item.route" :to="buildOrgPath(item.route)">
            <Button variant="outline" size="sm" class="rounded-full">
              {{ item.routeLabel || "Open" }}
            </Button>
          </NuxtLink>
          <button
            type="button"
            class="p-1.5 rounded-full t-text-muted hover:t-text transition-colors"
            :title="`Dismiss “${item.title}”`"
            :aria-label="`Dismiss ${item.title}`"
            @click="emit('dismiss', item.notice!.id)"
          >
            <Icon name="i-lucide-x" class="w-3.5 h-3.5" />
          </button>
        </template>

        <template v-else-if="item.kind === 'channel'">
          <Button variant="outline" size="sm" class="rounded-full" @click="openRoute">
            {{ item.routeLabel || "Open" }}
          </Button>
        </template>

        <!-- Know rows ask nothing: a quiet open, and that is all. -->
        <template v-else-if="item.route">
          <button
            type="button"
            class="p-1.5 rounded-full t-text-muted hover:t-text transition-colors"
            :title="item.routeLabel || 'Open'"
            :aria-label="item.routeLabel || 'Open'"
            @click="openRoute"
          >
            <Icon name="i-lucide-arrow-right" class="w-4 h-4" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
