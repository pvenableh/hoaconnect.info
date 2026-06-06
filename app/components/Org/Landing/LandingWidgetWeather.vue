<!-- Live local weather via /api/landing/weather. Hides if no key/data. -->
<template>
  <LandingWidgetShell
    v-if="data"
    :value="`${data.temp}°`"
    :label="data.condition"
    :icon="weatherIcon"
    :sub="`Feels like ${data.feels_like}° · ${data.humidity}% humidity`"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";

const props = defineProps<{ slug: string }>();

const { data } = useFetch<{
  temp: number;
  feels_like: number;
  humidity: number;
  wind: number;
  condition: string;
  description: string;
  icon: string;
  city: string;
} | null>("/api/landing/weather", {
  query: { slug: props.slug },
  lazy: true,
  default: () => null,
});

// Map OpenWeather icon codes → lucide icons.
const weatherIcon = computed(() => {
  const code = (data.value?.icon || "").slice(0, 2);
  const night = (data.value?.icon || "").endsWith("n");
  switch (code) {
    case "01":
      return night ? "lucide:moon" : "lucide:sun";
    case "02":
      return night ? "lucide:cloud-moon" : "lucide:cloud-sun";
    case "03":
    case "04":
      return "lucide:cloud";
    case "09":
    case "10":
      return "lucide:cloud-rain";
    case "11":
      return "lucide:cloud-lightning";
    case "13":
      return "lucide:snowflake";
    case "50":
      return "lucide:cloud-fog";
    default:
      return "lucide:cloud-sun";
  }
});
</script>
