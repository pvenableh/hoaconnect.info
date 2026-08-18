<!--
  "Community news" teaser — recent public announcements (opt-in per org via
  settings.landing.show_announcements; the endpoint returns [] otherwise).
  Self-hides when there's nothing to show. Links to the friendly web view.
-->
<template>
  <section v-if="items.length" id="news" class="landing-section py-24 sm:py-32 t-bg border-t t-border">
    <div class="container mx-auto px-6">
      <div class="max-w-3xl mx-auto">
        <div class="text-center mb-12">
          <p class="landing-eyebrow mb-5">Latest</p>
          <h2 class="landing-heading text-4xl sm:text-5xl">Community News</h2>
          <div class="landing-rule mx-auto mt-8" />
        </div>
        <div class="space-y-3">
          <a
            v-for="a in items"
            :key="a.id"
            :href="`/${slug}/announcements/email/${a.web_slug}`"
            class="landing-card group block p-5 hover:t-shadow-lg transition-shadow"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <h3 class="font-serif text-xl t-text truncate">{{ a.subject }}</h3>
                <p v-if="a.subtitle" class="t-text-secondary text-sm mt-0.5 truncate">{{ a.subtitle }}</p>
              </div>
              <div class="shrink-0 flex items-center gap-3">
                <span class="text-[11px] uppercase tracking-wide t-text-muted hidden sm:inline">{{ fmtDate(a.sent_at) }}</span>
                <Icon name="lucide:arrow-up-right" class="w-4 h-4 t-text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>();

const { data } = useFetch<any[]>("/api/hoa/announcements", {
  query: { slug: props.slug },
  lazy: true,
  default: () => [],
});
const items = computed(() => data.value || []);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
</script>
