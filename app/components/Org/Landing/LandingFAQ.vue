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
          <!-- On an editorial theme the FAQ can take its place in the numbered
               sequence ("09 / FAQ") like any content section, if the block names
               one. Without a label it keeps the plain "Questions" eyebrow, which
               is what every existing site shows. -->
          <p
            v-if="numbered && (block?.number_label || block?.category)"
            class="mb-5 flex items-center justify-center gap-3"
          >
            <span v-if="block?.number_label" class="t-heading text-[26px] leading-6 t-text-accent">
              {{ block.number_label }}
            </span>
            <span v-if="block?.category" class="text-sm tracking-wider uppercase t-text-tertiary">
              {{ block.category }}
            </span>
          </p>
          <p v-else class="landing-eyebrow mb-5">Questions</p>
          <h2 class="landing-heading text-4xl sm:text-5xl">{{ block?.title || "Frequently Asked" }}</h2>
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
              <!-- Sans, not the display serif. The reference sets its questions in
                   Proxima Nova at 15/500 — a serif here reads as another heading
                   and makes the list harder to scan. -->
              <span class="text-[0.9375rem] font-medium t-text pr-2">{{ f.question }}</span>
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
import type { LandingFaqItem } from "#core/shared/utils/landing";

defineProps<{
  items: LandingFaqItem[];
  /** The block itself, so the section can carry a number/category/title. */
  block?: Record<string, any>;
  /** Editorial themes (classic/luxury) show the numbered chrome; modern does not. */
  numbered?: boolean;
}>();
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
