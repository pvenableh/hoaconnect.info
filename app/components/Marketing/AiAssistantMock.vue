<template>
  <!-- Designed mockup of the slide-over AI assistant — org-context aware. -->
  <div class="mock-frame t-bg-elevated t-border border rounded-xl overflow-hidden t-shadow-lg">
    <!-- Window chrome -->
    <div class="flex items-center gap-2 px-4 py-3 border-b t-border-divider">
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <span class="w-2.5 h-2.5 rounded-full" style="background: #e5e0d8"></span>
      <div class="flex items-center gap-2 ml-3">
        <Icon name="i-heroicons-sparkles" class="w-4 h-4 t-text-accent" />
        <span class="text-sm font-medium t-text">Assistant</span>
      </div>
      <span
        class="ml-auto text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full t-bg-subtle t-text-tertiary"
        >Flamingo Park Condo</span
      >
    </div>

    <!-- Context chip -->
    <div class="px-4 pt-4">
      <div
        class="flex items-center gap-2 text-[11px] t-text-tertiary border-b t-border-divider pb-3"
      >
        <Icon name="i-heroicons-bolt" class="w-3.5 h-3.5 t-text-accent" />
        <span>Aware of your association, residents, finances &amp; recent activity</span>
      </div>
    </div>

    <!-- Conversation -->
    <div class="px-4 py-4 space-y-4 text-sm">
      <!-- User turn -->
      <div class="flex justify-end">
        <div
          class="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-br-sm t-bg-accent t-text-inverse"
        >
          When's our next board meeting, and is the reserve study still outstanding?
        </div>
      </div>

      <!-- Assistant turn -->
      <div class="flex justify-start">
        <div class="max-w-[88%] space-y-2">
          <div
            class="px-3.5 py-2.5 rounded-2xl rounded-bl-sm t-bg-subtle t-text leading-relaxed"
          >
            Your next board meeting is
            <span class="font-medium t-text-accent">Thursday, July 9 at 6:30 PM</span>
            in the lobby. The agenda lists the landscaping bid and the
            <span class="font-medium">2026 budget review</span>.
            <br /><br />
            And yes — the
            <span class="font-medium">reserve study</span> is still marked
            <span class="font-medium" style="color: #b4541f">outstanding</span>; it
            was last referenced in the May 2 announcement.
          </div>
          <div class="flex items-center gap-2 text-[10px] t-text-tertiary pl-1">
            <Icon name="i-heroicons-cpu-chip" class="w-3 h-3" />
            <span>Answered from live association data · 412 credits</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Composer -->
    <div class="px-4 pb-4">
      <div
        class="flex items-center gap-2 t-bg border t-border rounded-full px-4 py-2.5"
      >
        <span class="text-sm t-text-tertiary flex-1">Ask about your building…</span>
        <span
          class="w-7 h-7 rounded-full t-bg-accent flex items-center justify-center"
        >
          <Icon name="i-heroicons-arrow-up" class="w-4 h-4 t-text-inverse" />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mock-frame {
  font-family: var(--theme-body-font, sans-serif);
}
</style>
