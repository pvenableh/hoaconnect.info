<template>
  <!-- Designed mockup of the context-aware "Draft with AI" communications composer. -->
  <div class="mock-frame t-bg-elevated t-border border rounded-xl overflow-hidden t-shadow-lg">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b t-border-divider">
      <Icon name="i-heroicons-pencil-square" class="w-4 h-4 t-text-accent" />
      <span class="text-sm font-medium t-text">New Announcement</span>
      <span
        class="ml-auto text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full t-bg-accent t-text-inverse flex items-center gap-1"
      >
        <Icon name="i-heroicons-sparkles" class="w-3 h-3" />
        Draft with AI
      </span>
    </div>

    <!-- Prompt -->
    <div class="px-4 py-4 border-b t-border-divider">
      <p class="text-[11px] tracking-wider uppercase t-text-tertiary mb-2">
        Your instruction
      </p>
      <div class="t-bg-subtle rounded-lg px-3.5 py-2.5 text-sm t-text">
        Notice about Saturday's elevator maintenance, 8am–noon
      </div>
    </div>

    <!-- Generated draft -->
    <div class="px-4 py-4">
      <div class="flex items-center gap-2 mb-3">
        <span
          class="inline-block w-1.5 h-1.5 rounded-full t-bg-accent animate-pulse"
        ></span>
        <p class="text-[11px] tracking-wider uppercase t-text-tertiary">
          Generated in your building's voice
        </p>
      </div>

      <p class="text-[13px] t-text-tertiary mb-1">Subject</p>
      <p class="text-sm font-medium t-text mb-4">
        Elevator Maintenance This Saturday, 8 AM–Noon
      </p>

      <div class="text-sm t-text-secondary leading-relaxed space-y-2">
        <p>Dear Flamingo Park residents,</p>
        <p>
          Please note that our elevator will be temporarily out of service this
          <span class="font-medium t-text">Saturday from 8:00 AM to noon</span> for
          scheduled maintenance. We recommend planning any moves or large deliveries
          around this window.
        </p>
        <p class="t-text-tertiary">Warm regards, The Board</p>
      </div>
    </div>

    <!-- Footer actions -->
    <div
      class="flex items-center gap-3 px-4 py-3 border-t t-border-divider t-bg-subtle"
    >
      <span class="t-btn px-4 py-1.5 text-xs font-medium">Send to residents</span>
      <span class="text-xs t-text-tertiary">Regenerate</span>
      <span class="ml-auto text-[10px] t-text-tertiary">~$0.01 · 9 credits</span>
    </div>
  </div>
</template>

<style scoped>
.mock-frame {
  font-family: var(--theme-body-font, sans-serif);
}
</style>
