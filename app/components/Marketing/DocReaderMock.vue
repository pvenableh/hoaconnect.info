<template>
  <!-- Designed mockup of the Voyage-powered document reader (RAG with citations). -->
  <div class="mock-frame t-bg-elevated t-border border rounded-xl overflow-hidden t-shadow-lg">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b t-border-divider">
      <Icon name="i-heroicons-document-magnifying-glass" class="w-4 h-4 t-text-accent" />
      <span class="text-sm font-medium t-text">Document Reader</span>
      <span
        class="ml-auto text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full t-bg-subtle t-text-tertiary flex items-center gap-1"
      >
        <span class="w-1.5 h-1.5 rounded-full t-bg-accent"></span>
        12 governing docs indexed
      </span>
    </div>

    <!-- Question -->
    <div class="px-4 py-4">
      <p class="text-[11px] tracking-wider uppercase t-text-tertiary mb-2">Question</p>
      <p class="text-sm t-text font-medium">
        Can an owner rent their unit for less than 30 days?
      </p>
    </div>

    <!-- Answer -->
    <div class="px-4 pb-4">
      <div class="t-bg-subtle rounded-lg p-3.5 text-sm t-text leading-relaxed">
        No. Your
        <span class="font-medium">Declaration</span> prohibits leases shorter than
        six months, and no more than twice per year — so nightly or weekly rentals
        aren't permitted.
      </div>

      <!-- Cited source -->
      <p class="text-[11px] tracking-wider uppercase t-text-tertiary mt-4 mb-2">
        Cited from your documents
      </p>
      <div class="border-l-2 t-border-accent pl-3 py-1">
        <p class="text-[13px] italic t-text-secondary leading-relaxed">
          “No Unit shall be leased for a term of less than six (6) months, nor more
          than twice in any calendar year…”
        </p>
        <div class="flex items-center gap-2 mt-2">
          <Icon name="i-heroicons-document-text" class="w-3.5 h-3.5 t-text-accent" />
          <span class="text-[11px] t-text-tertiary"
            >Declaration of Condominium · Article XIV, §2 ·
            <span class="t-text-accent">94% match</span></span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mock-frame {
  font-family: var(--theme-body-font, sans-serif);
}
</style>
