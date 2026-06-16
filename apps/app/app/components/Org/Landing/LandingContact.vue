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
          <div v-if="contactPhone">
            <p class="landing-eyebrow mb-2">Call</p>
            <a :href="`tel:${contactPhone}`" class="landing-heading text-2xl hover:t-text-accent transition-colors">
              {{ contactPhone }}
            </a>
          </div>
          <div
            v-if="contactPhone && contactEmail"
            class="hidden sm:block w-px h-10"
            style="background: var(--theme-border-secondary)"
          />
          <div v-if="contactEmail">
            <p class="landing-eyebrow mb-2">Email</p>
            <a :href="`mailto:${contactEmail}`" class="landing-heading text-2xl hover:t-text-accent transition-colors break-all">
              {{ contactEmail }}
            </a>
          </div>
        </div>

        <p v-if="usingPmContact" class="landing-eyebrow -mt-8 mb-14">
          Managed by {{ pmName }}
        </p>

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

    <!-- Full-bleed grayscale Mapbox map (shown once coordinates are cached).
         Suppressed when a dedicated Location section already owns the map. -->
    <LandingMap
      v-if="geo && !hideMap"
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
  // Hide the embedded map when a dedicated Location section already renders one.
  hideMap: { type: Boolean, default: false },
});

defineEmits(["inquire"]);

const memberNoun = computed(() => orgMemberNoun(props.organization?.type));
const inquiryEnabled = computed(() => props.cfg?.inquiry?.enabled);

// Optionally route the public "Get in Touch" contact to the property manager
// (the primary management vendor) instead of the org's own phone/email. Only
// when the admin opted in AND a management vendor is present.
const pm = computed(() => props.organization?.property_manager || null);
const usingPmContact = computed(() => props.cfg?.pm_contact === true && !!pm.value);
const pmName = computed(() => pm.value?.company || pm.value?.name || "");
const contactPhone = computed(() =>
  usingPmContact.value ? pm.value?.phone || props.organization?.phone : props.organization?.phone
);
const contactEmail = computed(() =>
  usingPmContact.value ? pm.value?.email || props.organization?.email : props.organization?.email
);

// Cached {lat, lon} resolved by the weather route on first landing render.
const geo = computed(() => {
  const g = props.cfg?.geo;
  return g && typeof g.lat === "number" && typeof g.lon === "number" ? g : null;
});
</script>
