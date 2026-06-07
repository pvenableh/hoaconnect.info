<!--
  Board teaser — links to the full board roster. Respects the org-level
  `show_board` toggle (in addition to the block's own enabled flag, which the
  dispatcher already filters on). Extracted from PublicLanding.
-->
<template>
  <section
    v-if="organization?.show_board !== false"
    class="landing-section py-24 sm:py-36 t-bg border-t t-border"
  >
    <div class="container mx-auto px-6">
      <div class="reveal max-w-2xl mx-auto text-center">
        <p class="landing-eyebrow mb-5">Governance</p>
        <h2 class="landing-heading text-4xl sm:text-5xl">Board of Directors</h2>
        <div class="landing-rule mx-auto my-8" />
        <p class="landing-lede text-lg leading-relaxed mb-10">
          A dedicated group of residents who volunteer their time to guide our community.
        </p>
        <NuxtLink
          :to="`/${slug}/board`"
          class="inline-flex items-center gap-2 text-[11px] uppercase tracking-ultra-wide t-text hover:opacity-60 transition-opacity"
        >
          Meet the board
          <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
});
</script>
