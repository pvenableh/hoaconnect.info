<!--
  Horizontally-scrollable row of glass widgets over the hero. Renders only the
  widgets the admin enabled (settings.landing.widgets), in their saved order.
  Individual widgets self-hide when they have no data, so the row gracefully
  collapses. Overflows scroll like 1033lenox.com (.widget-row).
-->
<template>
  <div v-if="keys.length" class="widget-row">
    <template v-for="key in keys" :key="key">
      <LandingWidgetGreeting v-if="key === 'greeting'" :name="firstName" />
      <LandingWidgetWeather v-else-if="key === 'weather'" :slug="slug" />
      <LandingWidgetLocation v-else-if="key === 'location'" :places="cfg.places" />
      <LandingWidgetBuilding v-else-if="key === 'building'" :count="organization?.member_count" />
      <LandingWidgetBoard v-else-if="key === 'board'" :slug="slug" />
      <LandingWidgetAmenities v-else-if="key === 'amenities'" :count="amenityCount" />
    </template>
  </div>
</template>

<script setup lang="ts">
import LandingWidgetGreeting from "./LandingWidgetGreeting.vue";
import LandingWidgetWeather from "./LandingWidgetWeather.vue";
import LandingWidgetLocation from "./LandingWidgetLocation.vue";
import LandingWidgetBuilding from "./LandingWidgetBuilding.vue";
import LandingWidgetBoard from "./LandingWidgetBoard.vue";
import LandingWidgetAmenities from "./LandingWidgetAmenities.vue";
import { normalizeLandingConfig, enabledLandingWidgets } from "~~/shared/utils/landing";

const props = defineProps<{ organization: any; slug: string }>();

const { user } = useDirectusAuth();
const firstName = computed(() => (user.value as any)?.first_name || null);

const cfg = computed(() => normalizeLandingConfig(props.organization?.settings?.landing));
const keys = computed(() => enabledLandingWidgets(cfg.value));
const amenityCount = computed(() =>
  Array.isArray(props.organization?.amenities) ? props.organization.amenities.length : 0
);
</script>
