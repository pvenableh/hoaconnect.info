<script setup lang="ts">
/**
 * One pile on the stacks home.
 *
 * Collapsed it is a single card with two ghost layers peeking beneath and a
 * count; tapping fans the whole group open. Clearing the last row lands the win
 * state rather than an empty gap — emptying a pile IS the point of the page, so
 * the page should say so.
 *
 * ── Motion policy (Round 2, Phase 7) ────────────────────────────────────────
 * · The reduced-motion guard runs FIRST, before GSAP is even asked for. A
 *   person who has asked for less motion never pays for the library.
 * · GSAP arrives through a dynamic import. The client plugin already registers
 *   it, so the module is warm and this costs no extra request — but the import
 *   keeps the component honest under SSR and under a plain vitest run, where
 *   `useNuxtApp().$gsap` does not exist.
 * · The pile's HEIGHT tweens alongside the row stagger. Without it the stacks
 *   below jump the instant the rows mount; with it they slide.
 * · `clearProps` hands layout back to CSS the moment the tween lands.
 * · `closing` keeps the non-top rows MOUNTED through the fold, so the reverse
 *   fan has something to animate.
 * · Transform, opacity and height only. No filter, no box-shadow, no layout
 *   thrash inside the tween.
 *
 * `defineExpose({ collapse })` lets the page fold a pile back down when the
 * walkthrough for it closes.
 */
import type { StackItem } from "#core/app/composables/useStackItems";

const props = defineProps<{
  title: string;
  /** Short muted phrase after the title — what this pile asks of you. */
  summary: string;
  items: StackItem[];
  clearedText?: string;
  defaultOpen?: boolean;
  /** Offer the one-card-at-a-time walkthrough. */
  walkable?: boolean;
  busyId?: string | null;
  proposingId?: string | null;
}>();

const emit = defineEmits<{
  (e: "handled", key: string): void;
  (e: "walk"): void;
  (e: "approve", id: string): void;
  (e: "reject", id: string): void;
  (e: "undo", id: string): void;
  (e: "edit", id: string, payload: Record<string, any>): void;
  (e: "dismiss", noticeId: string): void;
  (e: "propose", noticeId: string): void;
}>();

const open = ref(!!props.defaultOpen);
const closing = ref(false);
const pileEl = ref<HTMLElement | null>(null);
const footEl = ref<HTMLElement | null>(null);
const panelId = useId();

const prefersReduced = () =>
  import.meta.client && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Memoised so a page of piles shares one module resolution. */
let gsapPromise: Promise<typeof import("gsap").gsap> | null = null;
async function loadGsap() {
  if (!import.meta.client) return null;
  if (!gsapPromise) gsapPromise = import("gsap").then((m) => m.gsap);
  try {
    return await gsapPromise;
  } catch {
    gsapPromise = null;
    return null;
  }
}

async function expand() {
  if (open.value || closing.value) return;
  const pile = pileEl.value;
  const fromH = pile?.offsetHeight ?? 0;
  open.value = true;

  // Guard first: reduced motion never reaches the import below.
  if (prefersReduced() || !pile) return;

  const gsap = await loadGsap();
  if (!gsap) return;
  await nextTick();
  if (!open.value || closing.value) return;

  const rows = pile.querySelectorAll(".home-stack__item");
  gsap.from(pile, { height: fromH, duration: 0.5, ease: "expo.out", clearProps: "height" });
  gsap.from(rows, {
    y: -14,
    scale: 0.97,
    autoAlpha: 0,
    duration: 0.5,
    ease: "expo.out",
    stagger: 0.045,
    clearProps: "all",
    overwrite: "auto",
  });
  if (footEl.value) {
    gsap.from(footEl.value, { autoAlpha: 0, duration: 0.35, ease: "power1.out", delay: 0.15 });
  }
}

async function collapse() {
  if (!open.value || closing.value) return;
  closing.value = true;
  const pile = pileEl.value;

  const finish = () => {
    open.value = false;
    closing.value = false;
  };

  if (prefersReduced() || !pile) {
    finish();
    return;
  }

  const gsap = await loadGsap();
  if (!gsap) {
    finish();
    return;
  }

  const rows = Array.from(pile.querySelectorAll<HTMLElement>(".home-stack__item"));
  const rest = rows.slice(1);
  const targetH = rows[0]?.offsetHeight ?? 0;

  const tl = gsap.timeline({
    onComplete: () => {
      finish();
      gsap.set(pile, { clearProps: "height" });
      if (rest.length) gsap.set(rest, { clearProps: "all" });
    },
  });

  if (footEl.value) tl.to(footEl.value, { autoAlpha: 0, duration: 0.15, ease: "power1.in" }, 0);
  if (rest.length) {
    tl.to(
      rest,
      {
        y: -14,
        scale: 0.97,
        autoAlpha: 0,
        duration: 0.3,
        ease: "power2.in",
        stagger: { each: 0.03, from: "end" },
      },
      0
    );
  }
  tl.to(pile, { height: targetH, duration: 0.42, ease: "power3.inOut" }, 0.04);
}

function toggle() {
  if (open.value) void collapse();
  else void expand();
}

onUnmounted(() => {
  const pile = pileEl.value;
  if (!pile || !gsapPromise) return;
  void gsapPromise.then((gsap) =>
    gsap.killTweensOf([pile, ...pile.querySelectorAll(".home-stack__item")])
  );
});

defineExpose({ collapse, open });

// The win state only means anything if there was ever work here — an empty
// pile on a quiet Tuesday is not an achievement.
const hadItems = ref(props.items.length > 0);
watch(
  () => props.items.length,
  (n) => {
    if (n > 0) hadItems.value = true;
  }
);
const cleared = computed(() => hadItems.value && props.items.length === 0);

/** Tapping the collapsed pile anywhere but a control fans it open. */
function onPileClick(e: MouseEvent) {
  if (open.value) return;
  if ((e.target as HTMLElement | null)?.closest("button, a, input, textarea")) return;
  void expand();
}
</script>

<template>
  <section
    v-if="items.length || cleared"
    class="home-stack"
    :class="{ 'is-open': open, 'is-closing': closing }"
  >
    <button
      type="button"
      class="home-stack__head"
      :aria-expanded="open && !closing"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span class="t-overline shrink-0">{{ title }}</span>
      <span class="flex-1 min-w-0 truncate text-xs t-text-muted text-left">{{ summary }}</span>
      <span
        v-if="items.length"
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums t-bg-accent t-text-accent"
      >{{ items.length }}</span>
      <Icon
        name="i-lucide-chevron-right"
        class="w-3.5 h-3.5 shrink-0 t-text-muted home-stack__chevron"
      />
    </button>

    <div v-if="cleared" class="home-stack__cleared" role="status">
      <Icon name="i-lucide-check-circle-2" class="w-4 h-4" />
      {{ clearedText || "All clear." }}
    </div>

    <div
      v-else
      :id="panelId"
      ref="pileEl"
      class="home-stack__pile"
      :class="{ single: items.length === 1, 'cursor-pointer': !open }"
      @click="onPileClick"
    >
      <div class="home-stack__items">
        <HomeStackItemRow
          v-for="(item, i) in items"
          :key="item.key"
          :item="item"
          :busy-id="busyId"
          :proposing-id="proposingId"
          class="home-stack__item"
          :class="{ 'home-stack__item--peek': i === 0 && !open }"
          @handled="(k: string) => emit('handled', k)"
          @approve="(id: string) => emit('approve', id)"
          @reject="(id: string) => emit('reject', id)"
          @undo="(id: string) => emit('undo', id)"
          @edit="(id: string, payload: Record<string, any>) => emit('edit', id, payload)"
          @dismiss="(id: string) => emit('dismiss', id)"
          @propose="(id: string) => emit('propose', id)"
        />
      </div>
    </div>

    <div v-if="open && walkable && items.length >= 2" ref="footEl" class="mt-2 flex justify-end">
      <Button
        variant="outline"
        size="sm"
        class="rounded-full"
        title="Step through one card at a time"
        @click="emit('walk')"
      >
        <Icon name="i-lucide-fast-forward" class="w-3.5 h-3.5 mr-1.5" />
        Walk me through
      </Button>
    </div>
  </section>
</template>

<style scoped>
.home-stack__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 0 6px 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}
.home-stack__head:focus-visible {
  outline: 2px solid var(--theme-accent-primary, currentColor);
  outline-offset: 3px;
  border-radius: 6px;
}
.home-stack__chevron {
  transition: transform 0.3s cubic-bezier(0.36, 0.66, 0.04, 1);
}
.is-open .home-stack__chevron {
  transform: rotate(90deg);
}

.home-stack__pile {
  position: relative;
}
/* The pile: two ghost cards peeking beneath the top row. Pure CSS — they are a
   depth cue, not a thing to animate.

   Light and dark carry their own alphas rather than one value scaled, for the
   same reason the ambient field does: the ghost has to read as a CARD EDGE
   against the ground behind it, and near-white at 3.5% over #151d25 is a
   seven-unit shift nobody can see, where near-black at 3.5% over #ffffff is
   comfortably visible. `light-dark()` carries both off the `color-scheme` that
   `html.theme-app` already sets. */
.home-stack__pile::before,
.home-stack__pile::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -7px;
  height: 20px;
  border-radius: 16px;
  background: light-dark(
    color-mix(in srgb, var(--theme-text-primary, #000) 3.5%, transparent),
    color-mix(in srgb, var(--theme-text-primary, #fff) 7%, transparent)
  );
  border: 1px solid
    light-dark(
      color-mix(in srgb, var(--theme-text-primary, #000) 6%, transparent),
      color-mix(in srgb, var(--theme-text-primary, #fff) 12%, transparent)
    );
  z-index: 0;
  transition: opacity 0.25s ease;
}
.home-stack__pile::after {
  left: 20px;
  right: 20px;
  bottom: -13px;
  background: light-dark(
    color-mix(in srgb, var(--theme-text-primary, #000) 2%, transparent),
    color-mix(in srgb, var(--theme-text-primary, #fff) 4%, transparent)
  );
}
.home-stack__pile.single::before,
.home-stack__pile.single::after,
.is-open:not(.is-closing) .home-stack__pile::before,
.is-open:not(.is-closing) .home-stack__pile::after {
  opacity: 0;
}

.home-stack__items {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* Collapsed, only the top card exists. The fan and the fold are GSAP's job;
   these rules own nothing but which rows are in the DOM. */
.home-stack__item {
  display: none;
}
.home-stack__item--peek,
.is-open .home-stack__item {
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .home-stack__chevron,
  .home-stack__pile::before,
  .home-stack__pile::after {
    transition: none;
  }
}

.home-stack__cleared {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border: 1px dashed color-mix(in srgb, var(--success) 35%, transparent);
  border-radius: 16px;
  font-size: 13px;
  color: var(--success);
}
</style>
