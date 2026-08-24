<script setup lang="ts">
/**
 * AppWhatsNew — the "here's what changed" sheet.
 *
 * Shown ONCE per release line, on the first load after the line changes. That
 * timing is not incidental: <AppUpdatePrompt> is what asks the user to refresh,
 * and this is what greets them on the other side of it, so the refresh they were
 * nagged into has something to show for itself. Opening it by hand from
 * Account → About uses the same component and the same state.
 *
 * Content comes from core/shared/app/release-notes.ts — in-repo, typed, shipped
 * with the build. Nothing is fetched: a note about this build lives in this
 * build. If the running line has no note, this renders nothing at all rather
 * than an empty sheet.
 *
 * Mounted ONCE per layout, next to <AppUpdatePrompt>. The open state is the
 * singleton in useAppVersion(), so the Account row can drive this instance
 * instead of mounting a second one.
 */
const { releaseNote, whatsNewOpen, maybeShowWhatsNew, closeWhatsNew, version } = useAppVersion();

// Client-only: the marker lives in localStorage, and a sheet that rendered
// during SSR would hydrate open for everyone. Mount is also the earliest honest
// moment to decide — the version is baked into the bundle by then.
onMounted(() => maybeShowWhatsNew());

/** The full running version, for the sheet's footnote — the note itself is per LINE. */
const fullVersion = computed(() => version || releaseNote.value?.version || "");

const dateLabel = computed(() => {
  const raw = releaseNote.value?.date;
  if (!raw) return "";
  // Parse as UTC-noon so a YYYY-MM-DD never lands on the previous day west of
  // Greenwich — the release date is a label, not a timestamp.
  const d = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
});

function onOpenChange(next: boolean) {
  if (!next) closeWhatsNew();
}
</script>

<template>
  <AppBottomSheet
    v-if="releaseNote"
    :open="whatsNewOpen"
    :title="releaseNote.title"
    :description="`Version ${releaseNote.version} · ${dateLabel}`"
    max-height="80vh"
    @update:open="onOpenChange"
  >
    <ul class="whats-new__list">
      <li v-for="item in releaseNote.highlights" :key="item.title" class="whats-new__item">
        <span class="whats-new__icon" aria-hidden="true">
          <Icon :name="item.icon || 'i-lucide-sparkles'" class="size-[1.125rem]" />
        </span>
        <div class="min-w-0">
          <p class="whats-new__title">{{ item.title }}</p>
          <p class="whats-new__body">{{ item.body }}</p>
        </div>
      </li>
    </ul>

    <p class="whats-new__footnote">You're running {{ fullVersion }}.</p>

    <template #footer>
      <Button class="w-full" @click="closeWhatsNew()">Got it</Button>
    </template>
  </AppBottomSheet>
</template>

<style scoped>
.whats-new__list {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding-top: 0.25rem;
}

.whats-new__item {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
}

/* Tinted disc rather than a bare glyph: at 18px a lucide icon beside two lines
   of text reads as a bullet point, and the disc gives the row a left edge to
   hang from. Same treatment as <AppUpdatePrompt>'s icon, on purpose. */
.whats-new__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  border-radius: 9999px;
  color: var(--theme-accent-primary);
  background: color-mix(in srgb, var(--theme-accent-primary) 14%, transparent);
}

.whats-new__title {
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1.3;
  color: var(--theme-text-primary);
}

.whats-new__body {
  margin-top: 0.1875rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--theme-text-secondary);
}

.whats-new__footnote {
  margin-top: 1.25rem;
  font-size: 0.75rem;
  color: var(--theme-text-tertiary);
}
</style>
