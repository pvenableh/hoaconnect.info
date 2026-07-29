<script setup lang="ts">
// The live WYSIWYG preview. An iframe to the admin-only /{slug}/admin/site-preview
// route renders the REAL public landing (PublicLanding.vue) from the in-progress
// draft, pushed over postMessage — so theming (which is global on <html>) stays
// isolated from the admin chrome, and the hero's min-h-screen gets a real
// viewport. A classic/modern theme toggle and desktop/mobile width toggle drive
// the frame; the wide "desktop" frame is scaled to fit the pane.
const props = defineProps<{
  slug: string;
  draft: Record<string, any>;
  /** Which theme the preview forces (classic | modern | luxury). */
  theme: string;
}>();

const device = ref<"desktop" | "mobile">("desktop");
const LOGICAL: Record<string, number> = { desktop: 1280, mobile: 390 };

const iframe = ref<HTMLIFrameElement | null>(null);
const pane = ref<HTMLElement | null>(null);
const paneW = ref(0);
const paneH = ref(0);
const ready = ref(false);

const logicalWidth = computed(() => LOGICAL[device.value]!);
const scale = computed(() => (paneW.value ? Math.min(1, paneW.value / logicalWidth.value) : 1));
const frameHeight = computed(() => (scale.value ? paneH.value / scale.value : paneH.value));

const src = computed(() => `/${props.slug}/admin/site-preview`);

function post() {
  const win = iframe.value?.contentWindow;
  if (!win) return;
  win.postMessage(
    { type: "landing-preview", payload: { ...props.draft, theme: props.theme } },
    window.location.origin
  );
}

function onMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "landing-preview-ready") {
    ready.value = true;
    post();
  }
}

// Re-push whenever the draft or forced theme changes (debounced by rAF batching).
let scheduled = false;
watch(
  () => [props.draft, props.theme, device.value],
  () => {
    if (!ready.value || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      post();
    });
  },
  { deep: true }
);

let ro: ResizeObserver | null = null;
onMounted(() => {
  window.addEventListener("message", onMessage);
  if (pane.value) {
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        paneW.value = r.width;
        paneH.value = r.height;
      }
    });
    ro.observe(pane.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  ro?.disconnect();
});

function reload() {
  ready.value = false;
  if (iframe.value) iframe.value.src = src.value;
}
</script>

<template>
  <div class="rounded-xl border t-border overflow-hidden flex flex-col h-full">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2 px-3 py-2 border-b t-border t-bg-subtle/50">
      <span class="text-xs font-medium t-text-secondary flex items-center gap-1.5">
        <Icon name="lucide:eye" class="w-3.5 h-3.5" /> Live preview
      </span>
      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-lg border t-border p-0.5">
          <button
            v-for="d in (['desktop', 'mobile'] as const)"
            :key="d"
            type="button"
            class="px-2 py-1 rounded-md transition-colors"
            :class="device === d ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
            :title="d === 'desktop' ? 'Desktop' : 'Mobile'"
            @click="device = d"
          >
            <Icon :name="d === 'desktop' ? 'lucide:monitor' : 'lucide:smartphone'" class="w-4 h-4" />
          </button>
        </div>
        <button type="button" class="p-1.5 rounded-md hover:t-bg-subtle t-text-muted" title="Reload preview" @click="reload">
          <Icon name="lucide:rotate-cw" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Frame pane -->
    <div ref="pane" class="relative flex-1 t-bg-subtle/30 overflow-hidden" style="min-height: 60vh">
      <div
        v-if="!ready"
        class="absolute inset-0 flex items-center justify-center t-text-muted pointer-events-none z-10"
      >
        <Icon name="lucide:loader-circle" class="w-6 h-6 animate-spin" />
      </div>
      <iframe
        ref="iframe"
        :src="src"
        title="Public site preview"
        class="border-0 bg-white origin-top-left"
        :style="{
          width: logicalWidth + 'px',
          height: frameHeight + 'px',
          transform: `scale(${scale})`,
        }"
      />
    </div>
  </div>
</template>
