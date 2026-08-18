<template>
  <!-- Designed mockup of the branded resident portal (mobile). -->
  <div class="mock-frame t-bg-elevated t-border border rounded-xl overflow-hidden t-shadow-lg">
    <!-- Branded header -->
    <div class="px-4 py-4 border-b t-border-divider">
      <p class="text-[10px] tracking-[0.3em] uppercase t-text-tertiary mb-1">
        Resident Portal
      </p>
      <h4 class="t-heading text-xl t-text">Flamingo Park</h4>
    </div>

    <div class="p-4 space-y-3">
      <!-- Announcement card -->
      <div class="t-bg-subtle rounded-lg p-3.5">
        <div class="flex items-center gap-2 mb-1.5">
          <Icon name="i-heroicons-megaphone" class="w-3.5 h-3.5 t-text-accent" />
          <span class="text-[10px] tracking-wider uppercase t-text-tertiary"
            >Latest announcement</span
          >
        </div>
        <p class="text-sm font-medium t-text mb-1">Pool reopens this Friday</p>
        <p class="text-[13px] t-text-secondary leading-relaxed">
          Resurfacing is complete — the pool deck is open again starting 9 AM Friday.
        </p>
      </div>

      <!-- Quick links -->
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="link in links"
          :key="link.label"
          class="t-bg-subtle rounded-lg p-3 flex flex-col gap-2"
        >
          <span
            class="w-8 h-8 rounded-lg t-bg-accent flex items-center justify-center"
          >
            <Icon :name="link.icon" class="w-4 h-4 t-text-inverse" />
          </span>
          <span class="text-[13px] font-medium t-text">{{ link.label }}</span>
        </div>
      </div>

      <!-- Next meeting -->
      <div
        class="flex items-center gap-3 t-bg-subtle rounded-lg p-3 border-l-2 t-border-accent"
      >
        <Icon name="i-heroicons-calendar-days" class="w-5 h-5 t-text-accent" />
        <div>
          <p class="text-[13px] font-medium t-text">Board meeting</p>
          <p class="text-[11px] t-text-tertiary">Thu, Jul 9 · 6:30 PM · Lobby</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const links = [
  { icon: "i-heroicons-document-text", label: "Documents" },
  { icon: "i-heroicons-credit-card", label: "Pay dues" },
  { icon: "i-heroicons-wrench-screwdriver", label: "Maintenance" },
  { icon: "i-heroicons-users", label: "Directory" },
];
</script>

<style scoped>
.mock-frame {
  font-family: var(--theme-body-font, sans-serif);
}
</style>
