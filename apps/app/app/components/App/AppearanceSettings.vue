<script setup lang="ts">
import { Switch } from "@/components/ui/switch";
import type { PaletteId } from "~/composables/useAppNav";

const {
  palette,
  dockPosition,
  showLabels,
  glassChrome,
  swatchesFor,
  setPalette,
  setPosition,
  setShowLabels,
  setGlassChrome,
  PALETTES,
  PALETTE_IDS,
} = useAppNav();
</script>

<template>
  <div class="appearance">
    <!-- Palette -->
    <p class="appearance__heading">App palette</p>
    <div class="appearance__palettes">
      <button
        v-for="id in PALETTE_IDS"
        :key="id"
        type="button"
        class="palette-row"
        :class="{ 'palette-row--active': palette === id }"
        @click="setPalette(id as PaletteId)"
      >
        <span class="palette-row__body">
          <span class="palette-row__label">{{ PALETTES[id].label }}</span>
          <span class="palette-row__swatches" aria-hidden="true">
            <span
              v-for="(sw, idx) in swatchesFor(id as PaletteId)"
              :key="idx"
              class="palette-row__swatch"
              :style="{ backgroundColor: sw }"
            />
          </span>
        </span>
        <Icon
          v-if="palette === id"
          name="i-lucide-check"
          class="size-4 t-accent-app shrink-0"
        />
      </button>
    </div>

    <!-- Toggles -->
    <div class="appearance__toggle" @click="setShowLabels(!showLabels)">
      <Icon name="i-lucide-case-sensitive" class="appearance__toggle-icon" />
      <span class="appearance__toggle-body">
        <span class="appearance__toggle-title">Show app names</span>
        <span class="appearance__toggle-hint">Labels under each dock icon.</span>
      </span>
      <Switch :model-value="showLabels" @update:model-value="setShowLabels" @click.stop />
    </div>

    <div class="appearance__toggle" @click="setGlassChrome(!glassChrome)">
      <Icon name="i-lucide-gem" class="appearance__toggle-icon" />
      <span class="appearance__toggle-body">
        <span class="appearance__toggle-title">Glass chrome</span>
        <span class="appearance__toggle-hint">Frosted chips with colored icons.</span>
      </span>
      <Switch :model-value="glassChrome" @update:model-value="setGlassChrome" @click.stop />
    </div>

    <!-- Dock position -->
    <p class="appearance__heading">Dock position</p>
    <div class="appearance__positions">
      <button
        type="button"
        class="pos-btn"
        :class="{ 'pos-btn--active': dockPosition === 'bottom' }"
        @click="setPosition('bottom')"
      >
        <Icon name="i-lucide-panel-bottom" class="size-4" /> Bottom
      </button>
      <button
        type="button"
        class="pos-btn"
        :class="{ 'pos-btn--active': dockPosition === 'top' }"
        @click="setPosition('top')"
      >
        <Icon name="i-lucide-panel-top" class="size-4" /> Top
      </button>
    </div>
  </div>
</template>

<style scoped>
.appearance {
  padding: 0.25rem 0;
}
.appearance__heading {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-text-muted, #9a9a9a);
  margin: 0.5rem 0 0.4rem;
}
.appearance__palettes {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.palette-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.6rem;
  border: 1px solid color-mix(in srgb, var(--theme-border-primary, #e5e5e5) 60%, transparent);
  background: transparent;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.palette-row:hover {
  background: color-mix(in srgb, var(--theme-bg-tertiary, #eee) 50%, transparent);
}
.palette-row--active {
  border-color: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
}
.palette-row__body {
  flex: 1;
  min-width: 0;
}
.palette-row__label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-text-primary, #454545);
  margin-bottom: 0.3rem;
}
.palette-row__swatches {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 12px;
}
.palette-row__swatch {
  flex: 1;
  height: 100%;
  border-radius: 2px;
}

.appearance__toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.15rem;
  cursor: pointer;
}
.appearance__toggle-icon {
  width: 16px;
  height: 16px;
  color: var(--theme-text-secondary, #6c6c6c);
  flex-shrink: 0;
}
.appearance__toggle-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.appearance__toggle-title {
  font-size: 13px;
  color: var(--theme-text-primary, #454545);
  line-height: 1.2;
}
.appearance__toggle-hint {
  font-size: 11px;
  color: var(--theme-text-muted, #9a9a9a);
}

.appearance__positions {
  display: flex;
  gap: 0.5rem;
}
.pos-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.45rem 0.5rem;
  border-radius: 0.55rem;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-text-secondary, #6c6c6c);
  background: color-mix(in srgb, var(--theme-bg-tertiary, #eee) 60%, transparent);
}
.pos-btn--active {
  color: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
  background: hsl(var(--app-accent-h) var(--app-accent-s) 60% / 0.15);
}
</style>
