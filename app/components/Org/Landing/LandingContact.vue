<!--
  Contact block — phone/email, inquiry CTA, and an OpenStreetMap embed (shown
  once the weather route has cached coordinates). Emits `inquire` so the host
  (PublicLanding) opens the shared inquiry dialog. Extracted from PublicLanding.
-->
<template>
  <section id="contact" class="landing-section py-24 sm:py-36 t-bg-elevated border-t t-border">
    <div class="container mx-auto px-6">
      <div class="reveal max-w-3xl mx-auto text-center">
        <p class="landing-eyebrow mb-5">Contact</p>
        <h2 class="landing-heading text-4xl sm:text-5xl">Get in Touch</h2>
        <div class="landing-rule mx-auto my-8" />
        <p class="landing-lede text-lg mb-14">
          Questions or need assistance? Our community management team is here to help.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-12 sm:gap-20 mb-14">
          <div v-if="organization?.phone">
            <p class="landing-eyebrow mb-2">Call</p>
            <a :href="`tel:${organization.phone}`" class="landing-heading text-2xl hover:t-text-accent transition-colors">
              {{ organization.phone }}
            </a>
          </div>
          <div
            v-if="organization?.phone && organization?.email"
            class="hidden sm:block w-px h-10"
            style="background: var(--theme-border-secondary)"
          />
          <div v-if="organization?.email">
            <p class="landing-eyebrow mb-2">Email</p>
            <a :href="`mailto:${organization.email}`" class="landing-heading text-2xl hover:t-text-accent transition-colors break-all">
              {{ organization.email }}
            </a>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button v-if="inquiryEnabled" type="button" class="landing-btn" @click="$emit('inquire', 'general')">
            Send an inquiry
          </button>
          <NuxtLink v-if="!user" :to="`/${slug}/signup`" class="landing-btn-outline">
            Become a {{ memberNoun.singular }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Full-bleed grayscale Mapbox map (shown once coordinates are cached). -->
    <LandingMap
      v-if="geo"
      :lat="geo.lat"
      :lon="geo.lon"
      :label="organization?.name || 'the community'"
      class="mt-16 sm:mt-24"
    />
  </section>
</template>

<script setup>
import { orgMemberNoun } from "~~/shared/utils/terminology";
import LandingMap from "./LandingMap.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
  user: { type: Object, default: null },
  cfg: { type: Object, required: true },
});

defineEmits(["inquire"]);

const memberNoun = computed(() => orgMemberNoun(props.organization?.type));
const inquiryEnabled = computed(() => props.cfg?.inquiry?.enabled);

// Cached {lat, lon} resolved by the weather route on first landing render.
const geo = computed(() => {
  const g = props.cfg?.geo;
  return g && typeof g.lat === "number" && typeof g.lon === "number" ? g : null;
});
</script>
