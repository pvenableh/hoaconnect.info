<template>
  <!-- Designed mockup of the HOA Connect management dashboard. -->
  <div class="mock-frame t-bg-elevated t-border border rounded-xl overflow-hidden t-shadow-lg">
    <!-- Top bar -->
    <div class="flex items-center gap-2 px-4 py-3 border-b t-border-divider">
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <span class="ml-3 t-heading text-sm t-text">Flamingo Park · Overview</span>
      <span class="ml-auto w-7 h-7 rounded-full t-bg-subtle"></span>
    </div>

    <div class="p-4">
      <!-- KPI cards -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="t-bg-subtle rounded-lg p-3">
          <p class="text-[10px] tracking-wider uppercase t-text-tertiary mb-1">
            Operating
          </p>
          <p class="t-heading text-lg t-text">$184k</p>
        </div>
        <div class="t-bg-subtle rounded-lg p-3">
          <p class="text-[10px] tracking-wider uppercase t-text-tertiary mb-1">
            Reserve
          </p>
          <p class="t-heading text-lg t-text-accent">$612k</p>
        </div>
        <div class="t-bg-subtle rounded-lg p-3">
          <p class="text-[10px] tracking-wider uppercase t-text-tertiary mb-1">
            Delinquency
          </p>
          <p class="t-heading text-lg t-text">3.1%</p>
        </div>
      </div>

      <!-- Budget vs actual bars -->
      <div class="t-bg-subtle rounded-lg p-3 mb-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] tracking-wider uppercase t-text-tertiary">
            Budget vs. actual
          </p>
          <p class="text-[10px] t-text-tertiary">YTD</p>
        </div>
        <div class="flex items-end gap-2 h-20">
          <div
            v-for="(h, i) in [60, 45, 72, 38, 80, 55]"
            :key="i"
            class="flex-1 flex flex-col justify-end gap-0.5"
          >
            <div
              class="w-full rounded-sm"
              :style="{ height: h + '%', background: '#c9a96e' }"
            ></div>
            <div
              class="w-full rounded-sm"
              :style="{ height: h * 0.7 + '%', background: '#e5e0d8' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Activity list -->
      <div class="space-y-2">
        <div
          v-for="item in activity"
          :key="item.label"
          class="flex items-center gap-3 text-sm"
        >
          <span
            class="w-6 h-6 rounded-md flex items-center justify-center t-bg-subtle flex-shrink-0"
          >
            <Icon :name="item.icon" class="w-3.5 h-3.5 t-text-accent" />
          </span>
          <span class="t-text-secondary flex-1 truncate">{{ item.label }}</span>
          <span class="text-[11px] t-text-tertiary">{{ item.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const activity = [
  { icon: "i-heroicons-wrench-screwdriver", label: "Maintenance: roof leak resolved", time: "2h" },
  { icon: "i-heroicons-banknotes", label: "Reserve transfer recorded", time: "1d" },
  { icon: "i-heroicons-megaphone", label: "Pool reopening announced", time: "2d" },
];
</script>

<style scoped>
.mock-frame {
  font-family: var(--theme-body-font, sans-serif);
}
</style>
