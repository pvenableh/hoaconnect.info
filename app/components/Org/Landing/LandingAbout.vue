<!--
  "About" block — the community lede. Reads settings.description (or legacy
  .about). Self-hides when empty. Extracted from PublicLanding so it can be
  ordered/toggled in the unified block list.
-->
<template>
  <section v-if="aboutText" class="landing-section py-24 sm:py-36 t-bg">
    <div class="container mx-auto px-6">
      <div class="reveal max-w-3xl mx-auto text-center">
        <p class="landing-eyebrow mb-5">The Community</p>
        <h2 class="landing-heading text-4xl sm:text-5xl mb-8">About {{ organization.name }}</h2>
        <div class="landing-rule mx-auto mb-9" />
        <p class="landing-dropcap landing-lede text-lg sm:text-xl leading-relaxed text-left sm:text-center">
          {{ aboutText }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  organization: { type: Object, required: true },
});

const aboutText = computed(
  () => props.organization?.settings?.description || props.organization?.settings?.about || ""
);
</script>
