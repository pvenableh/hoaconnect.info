<!--
  Frosted glass-widget shell shared by every landing widget. Renders the
  headline row (value / label / icon chip) + optional sub line; extra content
  goes in the default slot. Styling lives in core/app/assets/css/earnest-ui.css
  (the "LANDING GLASS SYSTEM" block at the end; it was its own glass.css until
  the Phase 8 consolidation).
-->
<template>
  <div class="glass-widget min-w-[8.5rem]">
    <div class="glass-widget__head">
      <span v-if="value !== null && value !== undefined" class="glass-widget__value">{{ value }}</span>
      <span v-if="label" class="opacity-90">{{ value !== null && value !== undefined ? "/ " : "" }}{{ label }}</span>
      <span v-if="icon" class="glass-widget__icon">
        <Icon :name="icon" class="w-3.5 h-3.5" />
      </span>
    </div>
    <span v-if="sub" class="glass-widget__sub">{{ sub }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  value?: string | number | null;
  label?: string;
  icon?: string;
  sub?: string;
}>();
</script>
