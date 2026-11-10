<script setup lang="ts">
// Help & support (docs/plan-operator-console.md §5, Phase 3): both doors.
// "Ask my community" goes to the HOA's own request inbox as a question;
// "Contact HOA Connect" is a platform request. Below, your requests, and for
// HOA Admins every platform request from their communities.
import { SUPPORT_CATEGORIES, SUPPORT_STATUS_LABEL } from "#core/shared/support/access";
import { relativeDays } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Help & support" });

const route = useRoute();
const from = computed(() => (typeof route.query.from === "string" ? route.query.from : undefined));
const view = ref<"mine" | "community">("mine");

const { data: ctx } = await useFetch<any>("/api/support/context");
const { data: list, pending, refresh } = await useFetch<any>("/api/support/requests", { query: computed(() => ({ view: view.value })) });

const askable = computed(() => (ctx.value?.communities ?? []).filter((c: any) => c.canAsk && c.slug));
const canContact = computed(
  () => (ctx.value?.communities ?? []).some((c: any) => c.categories.length) || (ctx.value?.accounts ?? []).length > 0
);
const categoryLabel = (v: string) => SUPPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const tabs = computed(() => [
  { value: "mine", label: "Your requests", icon: "lucide:inbox" },
  ...(ctx.value?.adminOfAny || (ctx.value?.accounts ?? []).length ? [{ value: "community", label: "Your communities", icon: "lucide:building-2" }] : []),
]);
const STATUS_TONE: Record<string, string> = {
  new: "bg-info/15 text-info",
  open: "bg-info/15 text-info",
  waiting: "bg-warning/15 text-warning",
  closed: "t-bg-subtle t-text-muted",
};
</script>

<template>
  <PageContainer class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold t-text">Help &amp; support</h1>
      <p class="mt-0.5 text-sm t-text-muted">Questions about your community go to your community. Problems with the app go to HOA Connect.</p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section class="ios-card p-4">
        <h2 class="type-card t-text">Ask my community</h2>
        <p class="type-meta t-text-muted">Dues, rules, maintenance, neighbours: your HOA answers these.</p>
        <div v-if="askable.length" class="mt-3 flex flex-wrap gap-2">
          <Button v-for="c in askable" :key="c.id" as="a" :href="`/${c.slug}/requests?ask=1`" variant="outline" size="sm">
            Ask {{ askable.length > 1 ? c.name : "your community" }}
          </Button>
        </div>
        <p v-else class="mt-3 type-micro t-text-muted">You're not a member of a community you can ask.</p>
      </section>

      <section class="ios-card p-4">
        <h2 class="type-card t-text">Contact HOA Connect</h2>
        <p class="type-meta t-text-muted">Something in the app isn't working, a billing question, or an idea.</p>
        <div class="mt-3">
          <Button v-if="canContact" as="a" :href="from ? `/support/new?from=${encodeURIComponent(from)}` : '/support/new'" size="sm">
            Contact HOA Connect
          </Button>
          <p v-else class="type-micro t-text-muted">Ask your community's HOA Admin to contact HOA Connect for you.</p>
        </div>
      </section>
    </div>

    <section>
      <AppSegmentedControl v-if="tabs.length > 1" v-model="view" :items="tabs" size="sm" label="Which requests" />
      <ul v-if="list?.requests?.length" class="mt-3 divide-y divide-[var(--theme-border-light)] ios-card">
        <li v-for="r in list.requests" :key="r.id">
          <NuxtLink :to="`/support/${r.id}`" class="flex items-center justify-between gap-3 px-4 py-3 hover:t-bg-subtle">
            <span class="min-w-0">
              <span class="block truncate type-body t-text">{{ r.subject }}</span>
              <span class="block type-micro t-text-muted">
                {{ categoryLabel(r.category) }}<template v-if="r.community"> · {{ r.community }}</template><template v-if="r.requester"> · {{ r.requester }}</template>
                · {{ relativeDays(r.lastMessageAt) }}
              </span>
            </span>
            <span :class="['shrink-0 rounded-full px-2 py-0.5 type-micro font-medium', STATUS_TONE[r.status] ?? STATUS_TONE.open]">
              {{ r.repliedByHoaConnect && r.status !== "closed" ? "HOA Connect replied" : SUPPORT_STATUS_LABEL[r.status as keyof typeof SUPPORT_STATUS_LABEL] ?? r.status }}
            </span>
          </NuxtLink>
        </li>
      </ul>
      <AppEmptyState
        v-else-if="!pending"
        class="mt-3"
        :title="view === 'mine' ? 'You haven\'t contacted HOA Connect' : 'Your communities haven\'t contacted HOA Connect'"
        description="Requests you send to HOA Connect, and our replies, show here."
        icon="lucide:life-buoy"
      />
      <div class="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" :disabled="pending" @click="refresh()">Refresh</Button>
      </div>
    </section>
  </PageContainer>
</template>
