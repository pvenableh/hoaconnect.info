<!--
  AmbientBackground — the living backdrop behind the stacks home, in two looks.

  · waves — five layered translucent bands flowing sideways. Each band is one
            SVG path built from a WHOLE number of sine periods, so translating
            it by exactly one period loops seamlessly forever with a single
            linear tween and no re-draw. The geometry (and the whole-number
            invariant it depends on) lives in `#core/shared/home/waves`, where a
            test can hold it to that.
  · orbs  — four large soft gradient circles drifting and rotating.

  Both are cheap on purpose:
  · softness on the ORBS is BAKED into the gradient — no runtime filter
  · motion is transform-only (compositor work, no layout, no paint)
  · tweens pause when the tab is hidden
  · prefers-reduced-motion gets a static composition, and never loads GSAP
  · `useHomeAmbient` is the per-device kill switch (localStorage)

  ── Alpha is the whole effect ───────────────────────────────────────────────
  Light and dark are tuned as two independent numbers per band, not as one
  value with an opacity multiplier over the top. They are not the same problem:
  over the dark ground (#0b1015) a low alpha simply disappears, and over the
  light one (#f6f8fb) the alpha that reads as light in dark mode goes muddy.
  `light-dark()` carries both, keyed off the `color-scheme` that `html.theme-app`
  and `.dark` already set — so there is one declaration and no theme selector to
  keep in sync.

  ── Where it sits ───────────────────────────────────────────────────────────
  Mounted behind the home content via the page's `isolate` + this layer's own
  `-z-10`: a negative z-index inside the parent's stacking context paints above
  the parent's own background but under all of its in-flow content.
-->
<script setup lang="ts">
import { WAVE_BANDS, ORB_DRIFT, wavePath, VB_W, VB_H } from "#core/shared/home/waves";

const props = withDefaults(defineProps<{ variant?: "waves" | "orbs" }>(), {
  variant: "waves",
});

const root = ref<HTMLElement | null>(null);

const prefersReduced = () =>
  import.meta.client && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A theme-aware translucent version of a band or orb colour. */
const tint = (color: string, alphaLight: number, alphaDark: number) =>
  `light-dark(` +
  `color-mix(in srgb, ${color} ${(alphaLight * 100).toFixed(1)}%, transparent), ` +
  `color-mix(in srgb, ${color} ${(alphaDark * 100).toFixed(1)}%, transparent))`;

const bands = computed(() =>
  WAVE_BANDS.map((w) => ({
    ...w,
    d: wavePath(w),
    peak: tint(w.color, w.alphaLight, w.alphaDark),
    edge: tint(w.color, 0, 0),
  })),
);

// Gradient ids must be unique per instance or a second mount steals the fill.
const uid = useId();
const gradId = (key: string) => `ambient-wave-${uid}-${key}`;

// ── Orbs ─────────────────────────────────────────────────────────────────────
// Softness is the gradient's own transparent stop, never `filter: blur()`: a
// blur on a 66vmax element re-rasterises on every drift frame, which is the one
// thing that would make this expensive.
const ORBS = [
  { key: "1", color: "var(--theme-accent-primary)", light: 0.14, dark: 0.24, pos: "top:-22vmax;left:-14vmax;" },
  { key: "2", color: "var(--chart-2)", light: 0.12, dark: 0.2, pos: "top:-10vmax;right:-20vmax;" },
  { key: "3", color: "var(--chart-4)", light: 0.1, dark: 0.18, pos: "bottom:-24vmax;left:8vmax;" },
  { key: "4", color: "var(--chart-1)", light: 0.09, dark: 0.16, pos: "bottom:-18vmax;right:-12vmax;" },
];

const orbs = computed(() =>
  ORBS.map((o) => ({
    key: o.key,
    style:
      o.pos +
      `background:radial-gradient(circle at 50% 50%, ${tint(o.color, o.light, o.dark)}, transparent 64%);`,
  })),
);

// ── Motion ───────────────────────────────────────────────────────────────────
// The reduced-motion guard runs BEFORE the import, so a person who asked for
// less motion never pays for the library — the same policy Stack.vue follows.
type Gsap = typeof import("gsap").gsap;
type GsapTween = ReturnType<Gsap["to"]>;

let gsapPromise: Promise<Gsap> | null = null;
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

let tweens: GsapTween[] = [];

function onVisibility() {
  // A backdrop nobody is looking at should cost nothing. Without this the
  // tweens keep ticking in a hidden tab for as long as it stays open.
  if (document.hidden) tweens.forEach((t) => t.pause());
  else tweens.forEach((t) => t.resume());
}

function startWaves(gsap: Gsap) {
  const els = root.value?.querySelectorAll<SVGGElement>(".ambient__wave");
  if (!els?.length) return;

  els.forEach((band, i) => {
    const spec = WAVE_BANDS[i % WAVE_BANDS.length]!;

    // Slide exactly one period, linearly, forever — the seam lands on an
    // identical crest, so the loop is invisible. `ease: "none"` is required:
    // any easing would visibly stall at the wrap. Direction alternates per
    // band, which is what stops the field reading as one conveyor; the path's
    // left-hand slack is what keeps a rightward band covered.
    tweens.push(
      gsap.fromTo(
        band,
        { x: 0 },
        { x: spec.dir * spec.period, duration: spec.dur, ease: "none", repeat: -1 },
      ),
    );

    // A slow vertical bob keeps the bands from reading as a flat conveyor.
    tweens.push(
      gsap.to(band, {
        y: spec.bob,
        duration: spec.dur * 0.7,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      }),
    );
  });
}

function startOrbs(gsap: Gsap) {
  const els = root.value?.querySelectorAll<HTMLElement>(".ambient__orb");
  if (!els?.length) return;

  els.forEach((orb, i) => {
    const d = ORB_DRIFT[i % ORB_DRIFT.length]!;
    tweens.push(
      gsap.to(orb, {
        xPercent: d.x,
        yPercent: d.y,
        scale: d.scale,
        duration: d.dur,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      }),
      gsap.to(orb, {
        rotation: d.rotation,
        duration: d.dur * 1.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      }),
    );
  });
}

function stop() {
  tweens.forEach((t) => t.kill());
  tweens = [];
}

async function start() {
  if (prefersReduced()) return;
  const gsap = await loadGsap();
  if (!gsap) return;
  await nextTick();
  if (!root.value) return;
  if (props.variant === "orbs") startOrbs(gsap);
  else startWaves(gsap);
}

onMounted(() => {
  void start();
  if (import.meta.client) document.addEventListener("visibilitychange", onVisibility);
});

// Switching look re-runs the field rather than leaving orphan tweens on
// elements that no longer exist.
watch(
  () => props.variant,
  () => {
    stop();
    void start();
  },
);

onUnmounted(() => {
  if (import.meta.client) document.removeEventListener("visibilitychange", onVisibility);
  stop();
});
</script>

<template>
  <div ref="root" class="ambient" aria-hidden="true">
    <svg
      v-if="variant === 'waves'"
      class="ambient__svg"
      :viewBox="`0 0 ${VB_W} ${VB_H}`"
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        <!--
          Three stops, not two. A gradient that starts at full alpha draws a
          hard line exactly along the crest — the band reads as cut paper rather
          than as light. Fading UP from transparent to the peak just below the
          crest is what makes the edge diffuse.
        -->
        <linearGradient v-for="w in bands" :id="gradId(w.key)" :key="w.key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="w.edge" />
          <stop offset="26%" :stop-color="w.peak" />
          <stop offset="100%" :stop-color="w.edge" />
        </linearGradient>
      </defs>
      <g v-for="w in bands" :key="w.key" class="ambient__wave">
        <path :d="w.d" :fill="`url(#${gradId(w.key)})`" />
      </g>
    </svg>

    <template v-else>
      <span v-for="o in orbs" :key="o.key" class="ambient__orb" :style="o.style" />
    </template>
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  z-index: -10;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
}

/* ── Waves ────────────────────────────────────────────────────────────────── */
.ambient__svg {
  position: absolute;
  /* Overhangs the frame on every side. Two reasons: a band mid-slide must never
     expose its trailing edge, and `filter: blur()` fades to transparent at the
     element's own bounds — if those bounds were the viewport you would see a
     vignette outlining the layer. The overhang puts that falloff off-screen. */
  left: -20%;
  top: -12%;
  width: 140%;
  height: 138%;
  /* The one runtime filter here, and it is what turns five legible bands into a
     single blended field. Affordable because this layer holds nothing but flat
     gradient fills — but it DOES re-rasterise as the bands move, so it is the
     most expensive thing on the page's idle frame. Keep the band count low if
     this ever needs to get cheaper. The ORBS deliberately have no equivalent. */
  filter: blur(38px);
}
.ambient__wave {
  will-change: transform;
}

/* ── Orbs ─────────────────────────────────────────────────────────────────── */
.ambient__orb {
  position: absolute;
  width: 66vmax;
  height: 66vmax;
  border-radius: 50%;
  will-change: transform;
  transform: translateZ(0);
}

/* Reduced motion keeps the composition and drops the movement — the field is
   still there, it simply holds still. GSAP is never loaded in this case, so
   this is the whole of what renders. */
@media (prefers-reduced-motion: reduce) {
  .ambient__wave,
  .ambient__orb {
    will-change: auto;
  }
}
</style>
