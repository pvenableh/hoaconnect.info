<!--
  Two-line time-of-day greeting over the hero (mirrors 1033lenox's Greeting):
    Good afternoon 🌴, Peter
    It's going to be an exceptional Monday.
  Computed on the client (onMounted) to avoid an SSR hydration mismatch on the
  hour / weekday / random word. Standalone left-aligned text — not a glass chip.
-->
<template>
  <div class="landing-greeting flex flex-col gap-0.5 text-white">
    <div class="flex items-center gap-1.5 text-base sm:text-lg font-semibold">
      <span>{{ greeting }}</span>
      <Icon v-if="todIcon" :name="todIcon" class="w-5 h-5 shrink-0" />
      <span v-if="name" class="-ml-1">, {{ name }}</span>
    </div>
    <div v-if="tagline" class="text-sm sm:text-[0.95rem] text-white/70 italic font-light">
      {{ tagline }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ name?: string | null }>();

// Ported from 1033lenox's Greeting — a session-stable motivational adjective.
const MOTIVATIONAL_WORDS = [
  "productive", "beautiful", "wonderful", "amazing", "fantastic", "brilliant",
  "inspiring", "energizing", "refreshing", "promising", "exciting", "magnificent",
  "glorious", "spectacular", "remarkable", "incredible", "perfect", "exceptional",
  "outstanding", "memorable",
];

const greeting = ref("Welcome");
const tagline = ref("");
// Time-of-day glyph from the Weather Icons (wi) family — matches the weather
// widget's iconography instead of an emoji.
const todIcon = ref("");

onMounted(() => {
  const now = new Date();
  const h = now.getHours();
  const tod = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night";
  todIcon.value = {
    morning: "wi:sunrise",
    afternoon: "wi:day-sunny",
    evening: "wi:sunset",
    night: "wi:night-clear",
  }[tod];
  greeting.value = `Good ${tod}`;

  const word = MOTIVATIONAL_WORDS[Math.floor(Math.random() * MOTIVATIONAL_WORDS.length)];
  const article = /^[aeiou]/i.test(word) ? "an" : "a";
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  tagline.value = `It's going to be ${article} ${word} ${day}.`;
});
</script>

<style scoped>
/* Legible over any hero image. */
.landing-greeting {
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.45);
}
</style>
