<!--
  Frequently-asked questions — admin-curated Q&A (settings.landing.faq).
  Editorial accordion built on native <details>/<summary> (keyboard + a11y for
  free). Renders its own themed section; hides when empty.
-->
<template>
  <section v-if="items.length" id="faq" class="landing-section py-24 sm:py-36 t-bg border-t t-border">
    <div class="container mx-auto px-6">
      <div class="max-w-3xl mx-auto">
        <div class="reveal text-center mb-14">
          <p class="landing-eyebrow mb-5">Questions</p>
          <h2 class="landing-heading text-4xl sm:text-5xl">Frequently Asked</h2>
          <div class="landing-rule mx-auto mt-8" />
        </div>

        <div class="reveal border-t t-border">
          <details
            v-for="(f, i) in items"
            :key="i"
            class="landing-faq group border-b t-border"
          >
            <summary
              class="flex items-center justify-between gap-6 cursor-pointer list-none py-6 select-none"
            >
              <span class="landing-heading text-xl sm:text-2xl t-text pr-2">{{ f.question }}</span>
              <Icon
                name="lucide:plus"
                class="shrink-0 w-5 h-5 t-text-accent transition-transform duration-300 group-open:rotate-45"
              />
            </summary>
            <p class="landing-lede leading-relaxed pb-7 -mt-1 whitespace-pre-line">{{ f.answer }}</p>
          </details>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LandingFaqItem } from "~~/shared/utils/landing";

defineProps<{ items: LandingFaqItem[] }>();
</script>

<style scoped>
/* Hide the default disclosure triangle across engines. */
.landing-faq summary::-webkit-details-marker {
  display: none;
}
.landing-faq summary::marker {
  content: "";
}
</style>
