<script setup lang="ts">
// Appearance, in two settings (Phase 4; plan §2.4, decisions 4 and 8):
//   Appearance — Light, Dark or Auto (follows the device). Stored on the
//     account (`directus_users.appearance`), as it always was.
//   Tint — On or Off. Off: clear, neutral glass, and buttons in the
//     community's colour. On: the glass carries a colour and is a little more
//     opaque, and the row of swatches appears; the first is the community's
//     own colour and is the default. Stored with the person's app prefs, so it
//     follows them to another device.
//   Show app names — the dock's names under its icons (Session 18). Off by
//     default: the icons, the open app's ring and a pointer's tooltip carry
//     it. Stored with the tint, so it follows the person too.
//   Solid surfaces — no blur, opaque surfaces, drawn edges: what Reduce
//     Transparency and Increase Contrast give where the device reports them.
//     iOS does not report either to a page, so this is the only way to get
//     them there (plan-apple-platform-direction §7, session 2). Per device.
// Everything else the old panel offered is gone: dock palettes (the tint
// replaces them) and dock position (bottom).
import { Switch } from "@/components/ui/switch";
import { TINT_SWATCHES, swatchAccent, type TintSwatchId } from "#core/shared/branding/accent";
import type { AppearanceMode } from "#core/app/composables/useAppearance";

const { mode, isDark, setMode, tintOn, tintSwatch, communityColor, setTintOn, setTintSwatch, dockNames, setDockNames } =
  useAppearance();
const { solidSurfaces, setSolidSurfaces } = useSolidSurfaces();

const MODES = [
  { value: "light", label: "Light", icon: "lucide:sun" },
  { value: "dark", label: "Dark", icon: "lucide:moon" },
  { value: "system", label: "Auto", icon: "lucide:sun-moon" },
];

// Each swatch drawn in the ink it will paint in this mode, so what you pick is
// what the buttons become.
const swatches = computed(() =>
  TINT_SWATCHES.map((s) => {
    const ink = swatchAccent(s.id, communityColor.value).ink[isDark.value ? "dark" : "light"];
    return { id: s.id, label: s.id === "community" ? "Community colour" : s.label, color: `hsl(${ink.h} ${ink.s}% ${ink.l}%)` };
  }),
);

const swatchEls = ref<HTMLElement[]>([]);
function onSwatchKey(e: KeyboardEvent, i: number) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const n = swatches.value.length;
  const next = (i + step + n) % n;
  setTintSwatch(swatches.value[next]!.id as TintSwatchId);
  swatchEls.value[next]?.focus();
}
</script>

<template>
  <div class="appearance">
    <p class="type-micro appearance__heading" id="appearance-mode-label">Appearance</p>
    <AppSegmentedControl
      :model-value="mode"
      :items="MODES"
      size="sm"
      fill
      label="Appearance"
      @update:model-value="(v) => setMode(v as AppearanceMode)"
    />

    <div class="appearance__toggle" @click="setTintOn(!tintOn)">
      <Icon name="lucide:droplet" class="appearance__toggle-icon" />
      <span class="appearance__toggle-body">
        <span class="type-body t-text">Tint</span>
        <span class="type-meta t-text-muted">{{ tintOn ? "Glass carries a colour." : "Clear glass." }}</span>
      </span>
      <Switch :model-value="tintOn" aria-label="Tint" @update:model-value="setTintOn" @click.stop />
    </div>

    <div v-if="tintOn" class="appearance__swatches" role="radiogroup" aria-label="Tint colour">
      <!-- allow-raw-button: a radio in the tint row, a colour dot with roving tabindex -->
      <button
        v-for="(s, i) in swatches"
        :key="s.id"
        :ref="(el) => { if (el) swatchEls[i] = el as HTMLElement }"
        type="button"
        role="radio"
        class="appearance__swatch"
        :class="{ 'appearance__swatch--on': tintSwatch === s.id }"
        :style="{ '--swatch': s.color }"
        :aria-checked="tintSwatch === s.id"
        :aria-label="s.label"
        :title="s.label"
        :tabindex="tintSwatch === s.id ? 0 : -1"
        @click="setTintSwatch(s.id as TintSwatchId)"
        @keydown="onSwatchKey($event, i)"
      >
        <Icon v-if="s.id === 'community'" name="lucide:house" class="appearance__swatch-icon" aria-hidden="true" />
      </button>
    </div>

    <div class="appearance__toggle" data-appearance-dock-names @click="setDockNames(!dockNames)">
      <Icon name="lucide:tag" class="appearance__toggle-icon" />
      <span class="appearance__toggle-body">
        <span class="type-body t-text">Show app names</span>
        <span class="type-meta t-text-muted">{{ dockNames ? "Under each icon in the dock." : "Icons only." }}</span>
      </span>
      <Switch :model-value="dockNames" aria-label="Show app names" @update:model-value="setDockNames" @click.stop />
    </div>

    <div class="appearance__toggle" data-appearance-solid @click="setSolidSurfaces(!solidSurfaces)">
      <Icon name="lucide:square" class="appearance__toggle-icon" />
      <span class="appearance__toggle-body">
        <span class="type-body t-text">Solid surfaces</span>
        <span class="type-meta t-text-muted">{{
          solidSurfaces ? "No glass: opaque, with clear edges. This device only." : "Glass, unless the device asks otherwise."
        }}</span>
      </span>
      <Switch
        :model-value="solidSurfaces"
        aria-label="Solid surfaces"
        @update:model-value="setSolidSurfaces"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
.appearance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.appearance__heading {
  margin-top: 0.25rem;
}
.appearance__toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0;
  cursor: pointer;
}
.appearance__toggle-icon {
  width: 1rem;
  height: 1rem;
  color: var(--theme-text-secondary);
  flex-shrink: 0;
}
.appearance__toggle-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* One row of six in the narrowest home (the account menu, ~250px): each
   target takes a sixth, up to 44px, and the dot sits 8px inside it, so the
   ring of the chosen one shares the dot's centre and the dots never move. */
.appearance__swatches {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 2.75rem));
  justify-content: space-between;
  padding-bottom: 0.25rem;
}
.appearance__swatch {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 9999px;
  background: transparent;
}
.appearance__swatch::before {
  content: "";
  position: absolute;
  inset: 0.5rem;
  border-radius: 9999px;
  background: var(--swatch);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-text-primary) 12%, transparent);
}
.appearance__swatch--on::after {
  content: "";
  position: absolute;
  inset: 0.125rem;
  border-radius: 9999px;
  box-shadow: 0 0 0 2px var(--swatch);
}
.appearance__swatch:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 0;
}
.appearance__swatch-icon {
  position: relative;
  width: 0.875rem;
  height: 0.875rem;
  color: var(--theme-button-text);
}
</style>
