<script setup lang="ts">
// Operator console: system health (docs/plan-operator-console.md §5, Phase 4).
// Scheduled jobs, the email queue, AI spend, storage, push and Stripe webhooks.
// Counts only where people are involved.
import { bytes, relativeDays, shortDate } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Health · Operations" });

const { data, pending, error, refresh } = await useFetch<any>("/api/ops/health");
const h = computed(() => data.value);

const RUNNER = { vercel: "Vercel Cron", github: "GitHub Actions" } as Record<string, string>;
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString();
const EVENT_LABEL: Record<string, string> = { bounce: "Bounced", dropped: "Dropped", spam_report: "Marked spam", deferred: "Deferred" };
</script>

<template>
  <OpsShell title="Health" description="Whether the scheduled jobs, email, AI, storage, push and webhooks are keeping up." :stripe-mode="h?.stripeMode">
    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load health" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>
    <div v-else-if="pending && !h" class="py-16 text-center type-meta t-text-muted">Loading…</div>

    <template v-else-if="h">
      <div v-for="note in h.notes" :key="note" class="mb-3 rounded-xl bg-warning/15 px-4 py-3 type-meta text-warning">{{ note }}</div>

      <!-- Scheduled jobs -->
      <section class="ios-card p-4">
        <h2 class="type-card t-text">Scheduled jobs</h2>
        <p class="type-meta t-text-muted">
          {{ h.heartbeatsProvisioned ? "Each job records its runs." : "Until jobs record their runs, this shows the last sign of work, which a run that found nothing to do doesn't leave." }}
        </p>
        <ul class="mt-2 divide-y divide-[var(--theme-border-light)]">
          <li v-for="job in h.jobs" :key="job.key" class="py-2">
            <span class="flex flex-wrap items-center justify-between gap-2">
              <span class="min-w-0">
                <span class="block type-body t-text">{{ job.label }}</span>
                <span class="block type-micro t-text-muted">{{ RUNNER[job.runner] }} · <span class="font-mono">{{ job.schedule }}</span> UTC</span>
              </span>
              <span class="flex items-center gap-2">
                <span class="type-micro t-text-muted whitespace-nowrap">
                  <template v-if="job.lastRunAt">ran {{ relativeDays(job.lastRunAt) }}</template>
                  <template v-else-if="job.lastActivityAt">last work {{ relativeDays(job.lastActivityAt) }}</template>
                  <template v-else>—</template>
                </span>
                <OpsStatusPill v-if="job.status" :status="job.status" />
              </span>
            </span>
            <span v-if="job.lastError" class="mt-1 block type-micro text-destructive">{{ job.lastError }}</span>
            <span v-if="job.status === 'error' && job.lastOkAt" class="block type-micro t-text-muted">Last good run {{ relativeDays(job.lastOkAt) }}</span>
          </li>
        </ul>
      </section>

      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Email -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Email</h2>
          <template v-if="h.email">
            <p v-if="!h.email.sendgridKey" class="mt-1 type-meta text-destructive">SENDGRID_API_KEY isn't set: nothing can send.</p>
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 type-meta">
              <dt class="t-text-muted">Sending now</dt><dd class="t-text">{{ n(h.email.sending) }}</dd>
              <dt class="t-text-muted">Stuck ({{ h.email.stuck.length ? "no progress in 10 min" : "none" }})</dt>
              <dd :class="h.email.stuck.length ? 'text-warning' : 't-text'">{{ n(h.email.stuck.length) }}</dd>
              <dt class="t-text-muted">Scheduled and late</dt>
              <dd :class="h.email.lateScheduled.length ? 'text-warning' : 't-text'">{{ n(h.email.lateScheduled.length) }}</dd>
              <dt class="t-text-muted">Paused</dt><dd class="t-text">{{ n(h.email.paused) }}</dd>
              <dt class="t-text-muted">Failed (30 days)</dt>
              <dd :class="h.email.failed30d.length ? 'text-destructive' : 't-text'">{{ n(h.email.failed30d.length) }}</dd>
              <dt class="t-text-muted">Sent with failures (30 days)</dt>
              <dd class="t-text">{{ n(h.email.partlyFailed30d.emails) }} emails · {{ n(h.email.partlyFailed30d.recipients) }} recipients</dd>
              <dt class="t-text-muted">Send leases open</dt>
              <dd :class="h.email.leases.older ? 'text-warning' : 't-text'">{{ n(h.email.leases.open) }}<template v-if="h.email.leases.older"> ({{ h.email.leases.older }} over 10 min)</template></dd>
            </dl>
            <ul v-if="h.email.stuck.length" class="mt-2 space-y-1">
              <li v-for="(s, i) in h.email.stuck" :key="i" class="type-micro text-warning">
                <NuxtLink v-if="s.communityId" :to="`/ops/communities/${s.communityId}`" class="hover:underline">{{ s.community || "A community" }}</NuxtLink>
                · no progress since {{ shortDate(s.since) }}
              </li>
            </ul>
            <p class="mt-3 type-label t-text-muted">Not delivered, last 7 days (SendGrid)</p>
            <p v-if="!Object.keys(h.email.undelivered7d.byEvent).length" class="mt-1 type-meta text-success">Nothing bounced, dropped or marked spam.</p>
            <ul v-else class="mt-1 space-y-0.5">
              <li v-for="(count, ev) in h.email.undelivered7d.byEvent" :key="ev" class="flex justify-between type-meta">
                <span class="t-text-muted">{{ EVENT_LABEL[ev] ?? ev }}</span><span class="tabular-nums t-text">{{ n(count) }}</span>
              </li>
            </ul>
            <p v-if="h.email.undelivered7d.topCommunities.length" class="mt-2 type-micro t-text-muted">
              Most:
              <template v-for="(c, i) in h.email.undelivered7d.topCommunities" :key="c.communityId">
                <NuxtLink :to="`/ops/communities/${c.communityId}`" class="hover:underline">{{ c.community || "?" }}</NuxtLink> ({{ c.count }})<template v-if="i < h.email.undelivered7d.topCommunities.length - 1">, </template>
              </template>
            </p>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">Unavailable.</p>
        </section>

        <!-- AI -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">AI spend</h2>
          <template v-if="h.ai">
            <p class="mt-1 type-meta">
              <span :class="h.ai.keys.anthropic ? 'text-success' : 'text-destructive'">Anthropic key {{ h.ai.keys.anthropic ? "set" : "missing" }}</span> ·
              <span :class="h.ai.keys.voyage ? 'text-success' : 'text-warning'">Voyage key {{ h.ai.keys.voyage ? "set" : "missing" }}</span>
            </p>
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 type-meta">
              <dt class="t-text-muted">Credits used (30 days)</dt><dd class="tabular-nums t-text">{{ n(h.ai.usage30d.credits.debit) }}</dd>
              <dt class="t-text-muted">Credits bought</dt><dd class="tabular-nums t-text">{{ n(h.ai.usage30d.credits.purchase) }}</dd>
              <dt class="t-text-muted">Tokens in / out</dt><dd class="tabular-nums t-text">{{ n(h.ai.usage30d.inputTokens) }} / {{ n(h.ai.usage30d.outputTokens) }}</dd>
              <dt class="t-text-muted">Last AI call</dt><dd class="t-text">{{ relativeDays(h.ai.usage30d.lastDebitAt) }}</dd>
              <dt class="t-text-muted">Wallets</dt><dd class="t-text">{{ n(h.ai.wallets.count) }} · {{ n(h.ai.wallets.totalBalance) }} credits</dd>
            </dl>
            <ul v-if="Object.keys(h.ai.usage30d.byModel).length" class="mt-2 space-y-0.5">
              <li v-for="(m, model) in h.ai.usage30d.byModel" :key="model" class="flex justify-between type-micro">
                <span class="font-mono t-text-muted">{{ model }}</span><span class="tabular-nums t-text">{{ n(m.calls) }} calls · {{ n(m.credits) }} credits</span>
              </li>
            </ul>
            <template v-if="h.ai.wallets.low.length">
              <p class="mt-3 type-label text-warning">Low wallets</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="w in h.ai.wallets.low" :key="w.communityId" class="flex justify-between type-micro">
                  <NuxtLink :to="`/ops/communities/${w.communityId}`" class="t-text hover:underline">{{ w.community || "?" }}</NuxtLink>
                  <span class="tabular-nums t-text-muted">{{ n(w.balance) }} / {{ n(w.allowance) }}</span>
                </li>
              </ul>
            </template>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">Unavailable.</p>
        </section>

        <!-- Storage -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Storage</h2>
          <template v-if="h.storage">
            <p class="type-meta t-text-muted">
              {{ bytes(h.storage.totalBytes) }} across {{ h.storage.communitiesWithFiles }} {{ h.storage.communitiesWithFiles === 1 ? "community" : "communities" }}
            </p>
            <ul v-if="h.storage.communities.length" class="mt-2 space-y-1">
              <li v-for="c in h.storage.communities" :key="c.communityId" class="flex items-center justify-between gap-2 type-meta">
                <NuxtLink :to="`/ops/communities/${c.communityId}`" class="min-w-0 truncate t-text hover:underline">{{ c.community || "?" }}</NuxtLink>
                <span class="tabular-nums whitespace-nowrap" :class="(c.percent ?? 0) >= 90 ? 'text-warning' : 't-text-muted'">
                  {{ bytes(c.usedBytes) }} / {{ c.limitBytes ? bytes(c.limitBytes) : "no limit" }}<template v-if="c.percent != null"> · {{ c.percent }}%</template>
                </span>
              </li>
            </ul>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">Unavailable.</p>
        </section>

        <!-- Push and webhooks -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Push notifications</h2>
          <template v-if="h.push">
            <p v-if="!h.push.vapid" class="mt-1 type-meta text-destructive">The VAPID keys aren't both set: no push can send.</p>
            <p class="type-meta t-text-muted">{{ n(h.push.total) }} subscriptions</p>
            <ul class="mt-2 space-y-0.5">
              <li v-for="p in h.push.platforms" :key="p.key" class="flex justify-between type-meta">
                <span class="t-text-muted">{{ p.label }}</span>
                <span class="tabular-nums t-text">{{ n(p.total) }} · {{ n(p.active) }} used in 30 days<template v-if="p.stale"> · {{ n(p.stale) }} stale</template></span>
              </li>
            </ul>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">Unavailable.</p>

          <h2 class="mt-5 type-card t-text">Stripe webhooks</h2>
          <template v-if="h.webhooks">
            <p v-if="!h.webhooks.signingSecrets" class="mt-1 type-meta text-destructive">No webhook signing secret is set for this mode.</p>
            <p v-if="h.webhooks.undelivered7d === 0" class="mt-1 type-meta text-success">Every HOA Connect event in the last 7 days was delivered.</p>
            <template v-else>
              <p class="mt-1 type-meta text-warning">{{ h.webhooks.undelivered7d }} not yet delivered · oldest {{ relativeDays(h.webhooks.oldestAt) }}</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="(count, type) in h.webhooks.types" :key="type" class="flex justify-between type-micro t-text-muted">
                  <span class="font-mono">{{ type }}</span><span>{{ count }}</span>
                </li>
              </ul>
            </template>
          </template>
          <p v-else class="mt-1 type-meta t-text-muted">Unavailable.</p>
        </section>
      </div>

      <div class="mt-6 flex items-center justify-between gap-2">
        <p class="type-micro t-text-muted">Updated {{ new Date(h.generatedAt).toLocaleTimeString() }}</p>
        <Button variant="ghost" size="sm" :disabled="pending" @click="refresh()">Refresh</Button>
      </div>
    </template>
  </OpsShell>
</template>
