<!--
  "Available in the community" — admin-curated real-estate listing links
  (settings.landing.listings). Renders its own themed section; hides when empty.
-->
<template>
  <section v-if="listings.length" id="listings" class="py-24 sm:py-32 t-bg-elevated border-t t-border">
    <div class="container mx-auto px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-16">
          <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-5">Available now</p>
          <h2 class="font-serif text-4xl sm:text-5xl t-text">For Sale &amp; Rent</h2>
          <div class="mx-auto w-14 h-px mt-8" style="background: var(--theme-accent-primary)" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <a
            v-for="(l, i) in listings"
            :key="i"
            :href="l.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group block t-card overflow-hidden hover:t-shadow-lg transition-shadow"
          >
            <div class="aspect-[4/3] t-bg-subtle overflow-hidden">
              <img
                v-if="l.image"
                :src="imgUrl(l.image)"
                :alt="l.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <Icon name="lucide:home" class="w-10 h-10 t-text-muted" />
              </div>
            </div>
            <div class="p-5">
              <span
                class="inline-block text-[10px] uppercase tracking-ultra-wide px-2 py-0.5 rounded-full mb-2"
                :class="l.type === 'rental' ? 't-bg-subtle t-text-secondary' : ''"
                :style="l.type === 'sale' ? 'background: var(--theme-accent-primary); color: var(--theme-text-inverse)' : ''"
              >
                {{ l.type === "rental" ? "For Rent" : "For Sale" }}
              </span>
              <h3 class="font-serif text-xl t-text leading-snug">{{ l.title }}</h3>
              <div class="mt-2 flex items-center justify-between">
                <span v-if="l.price" class="t-text-secondary font-medium">{{ l.price }}</span>
                <span class="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide t-text-accent">
                  View <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LandingListing } from "~~/shared/utils/landing";

const props = defineProps<{ listings: LandingListing[] }>();
const config = useRuntimeConfig();

const listings = computed(() => props.listings || []);
const imgUrl = (id: string) => `${config.public.directus.url}/assets/${id}?key=medium`;
</script>
