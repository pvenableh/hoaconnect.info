<!--
  Amenities grid — reads org.amenities (hoa_amenities). Self-hides when empty.
  Extracted from PublicLanding for the unified block list.
-->
<template>
  <section
    v-if="hasAmenities"
    id="amenities"
    class="landing-section py-24 sm:py-36 t-bg-elevated border-t t-border"
  >
    <div class="container mx-auto px-6">
      <div class="max-w-6xl mx-auto">
        <div class="reveal text-center mb-16">
          <p class="landing-eyebrow mb-5">Amenities</p>
          <h2 class="landing-heading text-4xl sm:text-5xl">Life at {{ organization.name }}</h2>
          <div class="landing-rule mx-auto mt-8" />
        </div>
        <div class="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
          <div
            v-for="amenity in organization.amenities"
            :key="amenity.id"
            class="text-center"
          >
            <Icon
              :name="iconName(amenity.icon)"
              class="w-7 h-7 mx-auto mb-5"
              style="color: var(--theme-accent-primary)"
            />
            <h3 class="landing-heading text-2xl mb-2">{{ amenity.title }}</h3>
            <p class="landing-lede leading-relaxed">{{ amenity.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  organization: { type: Object, required: true },
});

const hasAmenities = computed(
  () => Array.isArray(props.organization?.amenities) && props.organization.amenities.length > 0
);

// Tolerate icon names stored without a collection prefix (e.g. "wine" → "lucide:wine").
const iconName = (name) => {
  if (!name) return "lucide:sparkles";
  return name.includes(":") ? name : `lucide:${name}`;
};
</script>
