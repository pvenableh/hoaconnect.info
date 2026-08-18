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

// Map OpenWeather icon codes → the Weather Icons (wi) family, matching Earnest's
// weather iconography. Day/night variants are honored via the trailing d/n.
const weatherIcon = computed(() => {
  const code = (data.value?.icon || "").slice(0, 2);
  const night = (data.value?.icon || "").endsWith("n");
  switch (code) {
    case "01": // clear
      return night ? "wi:night-clear" : "wi:day-sunny";
    case "02": // few clouds
      return night ? "wi:night-alt-cloudy" : "wi:day-cloudy";
    case "03": // scattered clouds
      return "wi:cloud";
    case "04": // broken / overcast
      return "wi:cloudy";
    case "09": // shower rain
      return "wi:showers";
    case "10": // rain
      return night ? "wi:night-alt-rain" : "wi:day-rain";
    case "11": // thunderstorm
      return "wi:thunderstorm";
    case "13": // snow
      return "wi:snow";
    case "50": // mist / fog
      return "wi:fog";
    default:
      return night ? "wi:night-alt-cloudy" : "wi:day-cloudy";
  }
});
</script>
