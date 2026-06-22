<!--
  Two-line time-of-day greeting over the hero (mirrors 1033lenox's Greeting):
    Good afternoon 🌴, Peter
    It's going to be an exceptional Monday.
  Computed on the client (onMounted) to avoid an SSR hydration mismatch on the
  hour / weekday / random word. Standalone left-aligned text — not a glass chip.
-->
<template>
  <div class="landing-greeting flex flex-col gap-0.5 text-white">
    <div class="flex items-center gap-1 text-base sm:text-lg font-semibold">
      <span>{{ greeting }}</span>
      <span v-if="name">, {{ name }}</span>
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

onMounted(() => {
  const now = new Date();
  const h = now.getHours();
  const tod = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night";
  const emoji = { morning: "☀️", afternoon: "🌴", evening: "🌙", night: "✨" }[tod];
  greeting.value = `Good ${tod} ${emoji}`;

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
