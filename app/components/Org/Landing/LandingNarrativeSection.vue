<!--
  Numbered editorial shell for the classic/luxury landing narrative, à la
  1033lenox.com: a large Bauer-Bodoni section number ("01"), an ultra-wide
  tracked eyebrow ("The Residence"), a terracotta hairline, and a slot for the
  section body. GSAP draws the number + hairline in as the section scrolls into
  view; body content rides the page's shared `.reveal` mechanism (flash-free).

  Presentational only — Gallery / Location / Content sections compose it. The
  numbered chrome shows only in editorial themes (`numbered`); modern renders a
  clean header with no number so the same markup serves all themes.
-->
<template>
  <section
    :id="id || undefined"
    ref="rootEl"
    class="landing-section section border-t t-border"
    :class="[alt ? 't-bg-alt' : 't-bg', fullBleed ? 'py-20 lg:py-28' : 'py-24 lg:py-32 px-6 lg:px-16']"
  >
    <div :class="fullBleed ? '' : 'max-w-6xl mx-auto'">
      <!-- Section header (number · eyebrow · title · hairline) -->
      <header
        v-if="hasHeader"
        class="narr-header mb-12 lg:mb-16"
        :class="fullBleed ? 'px-6 lg:px-16 max-w-6xl mx-auto' : ''"
      >
        <div class="flex items-baseline gap-5 lg:gap-7">
          <span
            v-if="numbered && number"
            class="narr-number t-heading t-text-accent font-light leading-none text-4xl lg:text-6xl select-none"
            aria-hidden="true"
          >
            {{ number }}
          </span>
          <div class="min-w-0">
            <p v-if="eyebrow" class="landing-eyebrow narr-eyebrow">{{ eyebrow }}</p>
            <h2
              v-if="title"
              class="landing-heading narr-title text-[clamp(2rem,5vw,3.25rem)] font-normal tracking-tight leading-tight mt-3"
            >
              {{ title }}
            </h2>
          </div>
        </div>
        <div class="narr-rule landing-rule mt-7" />
      </header>

      <slot />
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  id: { type: String, default: "" },
  number: { type: String, default: "" },
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  alt: { type: Boolean, default: false },
  // Editorial themes show the section number; modern hides it for a calmer header.
  numbered: { type: Boolean, default: true },
  // Full-bleed sections (gallery) skip the centered container padding.
  fullBleed: { type: Boolean, default: false },
});

const { $gsap } = useNuxtApp();

const rootEl = ref(null);
const hasHeader = computed(
  () => !!(props.eyebrow || props.title || (props.numbered && props.number))
);

onMounted(() => {
  if (!import.meta.client) return;
  const root = rootEl.value;
  if (!root) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = root.querySelectorAll(".reveal");
  const number = root.querySelector(".narr-number");
  const rule = root.querySelector(".narr-rule");
  const headerBits = root.querySelectorAll(".narr-eyebrow, .narr-title");

  const showAll = () => {
    reveals.forEach((el) => el.classList.add("is-in"));
    [number, rule, ...headerBits].forEach((el) => el && (el.style.opacity = "1"));
    if (rule) rule.style.transform = "none";
  };

  if (reduced || !$gsap || !("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  // Base-hide the GSAP flourish targets (header chrome) until they scroll in.
  $gsap.set([number, ...headerBits].filter(Boolean), { opacity: 0, y: 18 });
  if (rule) $gsap.set(rule, { opacity: 0, scaleX: 0, transformOrigin: "left center" });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        // Editorial chrome: number → eyebrow/title → hairline draw-in.
        const tl = $gsap.timeline({ defaults: { ease: "power3.out" } });
        if (number) tl.to(number, { opacity: 1, y: 0, duration: 0.7 }, 0);
        if (headerBits.length)
          tl.to(headerBits, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, 0.08);
        if (rule) tl.to(rule, { opacity: 1, scaleX: 1, duration: 0.6 }, 0.2);
        // Body content rides the shared CSS reveal.
        reveals.forEach((el) => el.classList.add("is-in"));
        io.disconnect();
      });
    },
    { threshold: 0.16 }
  );
  io.observe(root);
});
</script>
