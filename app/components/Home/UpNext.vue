<script setup lang="ts">
/**
 * UpNext — the resident home's "what's coming" list (Earnest parity round 3,
 * Phase 5b). The same four things the reminders are about — dues, the next
 * meeting, a poll waiting on a vote, a request that just changed — so a push or
 * an email lands on a page that already shows it. The picking and wording are
 * `buildUpNext`; the reads are `useUpNextGlance`. It hides itself when there is
 * nothing to show: an empty "Up next" is noise on a home page.
 */
const props = defineProps<{
  orgId: string | null | undefined;
  memberId: string | null | undefined;
  userId: string | null | undefined;
}>();

const { navigateToOrg } = useOrgNavigation();
const { items, pending } = await useUpNextGlance(() => props.orgId, {
  memberId: () => props.memberId,
  userId: () => props.userId,
});
</script>

<template>
  <section v-if="items.length" aria-labelledby="up-next-heading" data-testid="up-next">
    <h2 id="up-next-heading" class="t-eyebrow mb-3">Up next</h2>
    <Card class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="item in items" :key="item.key">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :data-testid="`up-next-${item.kind}`"
            @click="navigateToOrg(item.route)"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              :class="item.urgent ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' : 't-bg-subtle t-text-secondary'"
            >
              <Icon :name="item.icon" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium t-text">{{ item.title }}</span>
              <span class="block truncate text-sm t-text-muted">{{ item.sub }}</span>
            </span>
            <Icon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 t-text-muted" />
          </button>
        </li>
      </ul>
    </Card>
  </section>
  <div v-else-if="pending" class="h-0" aria-hidden="true" />
</template>
