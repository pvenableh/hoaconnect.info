<script setup lang="ts">
// Operator console: one community (plan §5, Phases 1 and 2). People are the
// customer contacts; residents are counts only (plan §3). Billing is read live
// from Stripe. Actions (App Admin only) sit where their subject is: refund on a
// charge, cancel/resume/portal on the billing card, trial and free on the
// status line. Each asks for a reason and a confirmation, and is logged.
import { TRIAL_MAX_DAYS } from "#core/shared/ops/actions";
import { BILLING_ROLE, BOARD_TITLE, money, relativeDays, shortDate } from "#core/shared/ops/format";
import { grantLabel } from "#core/shared/transition/grants";

definePageMeta({ middleware: ["auth"], layout: "auth" });

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, pending, error, refresh } = await useFetch<any>(() => `/api/ops/communities/${id.value}`);

const c = computed(() => data.value?.community ?? null);
const people = computed(() => data.value?.people ?? null);
const billing = computed(() => data.value?.billing ?? null);
const activity = computed(() => data.value?.activity ?? null);
const links = computed(() => data.value?.links ?? null);

useHead({ title: () => `${c.value?.name ?? "Community"} · Operations` });

const bandMismatch = computed(
  () => !!billing.value?.band && !!billing.value?.bandForUnits && billing.value.band.slug !== billing.value.bandForUnits.slug
);

// ── Actions ─────────────────────────────────────────────────────────────────
const { canOps } = useRoles();
const canWrite = computed(() => canOps("billing.write"));
/** No actions on objects from the other Stripe mode (a live customer on localhost). */
const canAct = computed(() => canWrite.value && !billing.value?.otherMode);
const sub = computed(() => billing.value?.subscription ?? null);
const isFree = computed(() => c.value?.status === "free");
const canTrial = computed(
  () => canAct.value && !c.value?.billingAccount && !["active", "past_due"].includes(c.value?.subscriptionStatus ?? "")
);
/** Whose bill an action touches: the agency's, for an agency-billed community. */
const whose = computed(() => (c.value?.billingAccount ? `${c.value.billingAccount.name}'s` : `${c.value?.name}'s`));

type Action = "cancel" | "resume" | "trial" | "comp" | "portal";
const action = ref<Action | null>(null);
const actionOpen = computed({
  get: () => !!action.value,
  set: (v: boolean) => {
    if (!v) action.value = null;
  },
});
const cancelWhen = ref<"period_end" | "now">("period_end");
const trialEndsOn = ref("");
const dayAfter = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const trialMax = computed(() => dayAfter(new Date().toISOString(), TRIAL_MAX_DAYS));

function start(next: Action) {
  if (next === "cancel") cancelWhen.value = "period_end";
  if (next === "trial") {
    const from = c.value?.trialEndsAt && c.value.trialEndsAt > new Date().toISOString() ? c.value.trialEndsAt : new Date().toISOString();
    const proposed = dayAfter(from, 14);
    trialEndsOn.value = proposed > trialMax.value ? trialMax.value : proposed;
  }
  action.value = next;
}

const refundOpen = ref(false);
const refundCharge = ref<any>(null);
function startRefund(ch: any) {
  refundCharge.value = ch;
  refundOpen.value = true;
}

const actionProps = computed(() => {
  const name = c.value?.name ?? "this community";
  switch (action.value) {
    case "cancel":
      return {
        title: "Cancel the subscription",
        description: c.value?.billingAccount
          ? `This is ${c.value.billingAccount.name}'s subscription. It covers every community on that billing account.`
          : undefined,
        endpoint: `/api/ops/communities/${id.value}/cancel`,
        submitLabel: "Cancel subscription",
        destructive: true,
        body: () => ({ when: cancelWhen.value }),
        confirmation: () =>
          cancelWhen.value === "now"
            ? { title: `Cancel ${whose.value} subscription now?`, body: "It ends today and nothing is refunded. Refund the last charge separately if that's owed.", confirmLabel: "Cancel Now" }
            : {
                title: `Cancel ${whose.value} subscription on ${shortDate(sub.value?.currentPeriodEnd)}?`,
                body: "It keeps working until then, and can be resumed before that date.",
                confirmLabel: "Cancel at Period End",
              },
        doneMessage: () => (cancelWhen.value === "now" ? "Canceled." : "Set to cancel at the end of the period."),
      };
    case "resume":
      return {
        title: "Resume the subscription",
        endpoint: `/api/ops/communities/${id.value}/resume`,
        submitLabel: "Resume",
        confirmation: () => ({ title: `Resume ${whose.value} subscription?`, body: `It renews on ${shortDate(sub.value?.currentPeriodEnd)} as usual.` }),
        doneMessage: () => "Resumed. It renews as usual.",
      };
    case "trial":
      return {
        title: "Extend the trial",
        description: c.value?.trialEndsAt ? `The trial ends ${shortDate(c.value.trialEndsAt)} now.` : "It has no trial running now.",
        endpoint: `/api/ops/communities/${id.value}/trial`,
        submitLabel: "Extend trial",
        body: () => ({ trialEndsOn: trialEndsOn.value }),
        problem: () => (trialEndsOn.value ? null : "Pick the date the trial should end."),
        confirmation: () => ({ title: `Extend ${name}'s trial to ${shortDate(`${trialEndsOn.value}T23:59:59Z`)}?`, body: "It keeps full access until the end of that day (UTC)." }),
        doneMessage: () => "Trial extended.",
      };
    case "comp":
      return isFree.value
        ? {
            title: "Remove free",
            endpoint: `/api/ops/communities/${id.value}/comp`,
            submitLabel: "Remove free",
            destructive: true,
            body: () => ({ free: false }),
            confirmation: () => ({
              title: `Remove free from ${name}?`,
              body: "Its subscription status decides access again. If that's canceled or expired, it loses access now.",
              confirmLabel: "Remove Free",
            }),
            doneMessage: () => "No longer free.",
          }
        : {
            title: "Mark free",
            description: "A free community keeps access whatever its billing says.",
            endpoint: `/api/ops/communities/${id.value}/comp`,
            submitLabel: "Mark free",
            body: () => ({ free: true }),
            confirmation: () => ({
              title: `Mark ${name} free?`,
              body: sub.value && sub.value.status !== "canceled" ? "Its Stripe subscription keeps charging until you cancel it." : "Stripe isn't changed.",
            }),
            doneMessage: (res: any) => (res?.result?.stillBilled ? "Marked free. Its Stripe subscription is still running." : "Marked free."),
          };
    case "portal":
      return {
        title: "Open the billing portal",
        description: "You'll see what its HOA Admins see. Changes there are real, and Stripe makes them.",
        endpoint: `/api/ops/communities/${id.value}/portal`,
        submitLabel: "Open portal",
        confirmation: () => ({ title: `Open ${whose.value} billing portal?`, body: "It opens in this tab and comes back here." }),
        doneMessage: () => "Opening the portal…",
      };
    default:
      return null;
  }
});

// The dialog has closed (so `action` is already null) by the time this runs.
async function onDone(res: any) {
  if (res?.action === "portal_open") {
    if (res.result?.url) await navigateTo(res.result.url, { external: true });
    else useConfirm().alert({ title: "That portal session was already opened", body: "Open the portal again for a new link." });
    return;
  }
  await refresh();
}
</script>

<template>
  <OpsShell :title="c?.name ?? 'Community'" :description="c ? `/${c.slug}` : undefined" back-to="/ops/communities" back-label="Communities">
    <div v-if="error" class="py-10">
      <AppEmptyState
        :title="error.statusCode === 404 ? 'No such community' : 'Couldn\'t load this community'"
        :description="error.statusMessage || error.message"
        icon="lucide:building-2"
      />
    </div>
    <div v-else-if="pending && !data" class="py-16 text-center type-meta t-text-muted">Loading…</div>

    <template v-else-if="c">
      <!-- Status line -->
      <div class="flex flex-wrap items-center gap-2">
        <OpsStatusPill :status="c.status" />
        <span v-if="c.trialEndingSoon" class="type-meta text-warning">Trial ends {{ relativeDays(c.trialEndsAt) }}</span>
        <span v-else-if="c.status === 'trial' && c.trialEndsAt" class="type-meta t-text-muted">Trial ends {{ shortDate(c.trialEndsAt) }}</span>
        <span v-if="c.inGrace" class="type-meta text-info">Transition grace until {{ shortDate(c.graceEndsAt) }}</span>
        <span v-if="c.billingAccount" class="type-meta t-text-muted">Billed through {{ c.billingAccount.name }}</span>
        <span class="type-meta t-text-muted">Signed up {{ shortDate(c.signupAt) }}</span>
        <span v-if="canAct && !c.billingAccount" class="ml-auto flex flex-wrap gap-2">
          <Button v-if="canTrial" variant="outline" size="sm" @click="start('trial')">Extend trial</Button>
          <Button variant="outline" size="sm" @click="start('comp')">{{ isFree ? "Remove free" : "Mark free" }}</Button>
        </span>
      </div>

      <!-- Links -->
      <div class="mt-3 flex flex-wrap gap-2">
        <Button v-if="links?.stripeCustomer" as="a" :href="links.stripeCustomer" target="_blank" rel="noopener" variant="outline" size="sm">Stripe customer</Button>
        <Button v-if="links?.stripeSubscription" as="a" :href="links.stripeSubscription" target="_blank" rel="noopener" variant="outline" size="sm">Stripe subscription</Button>
        <Button v-if="links?.directus" as="a" :href="links.directus" target="_blank" rel="noopener" variant="outline" size="sm">Directus item</Button>
        <Button v-if="links?.app" as="a" :href="links.app" variant="ghost" size="sm">Open community</Button>
      </div>

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- People -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">People</h2>
          <div class="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p class="type-section tabular-nums t-text">{{ people.counts.members }}</p><p class="type-micro t-text-muted">members</p></div>
            <div><p class="type-section tabular-nums t-text">{{ people.counts.owners }}</p><p class="type-micro t-text-muted">owners</p></div>
            <div><p class="type-section tabular-nums t-text">{{ people.counts.tenants }}</p><p class="type-micro t-text-muted">tenants</p></div>
          </div>
          <p class="mt-1 text-center type-micro t-text-muted">
            {{ people.counts.units }} units in the app · {{ people.counts.declaredUnits || "none" }} declared at signup
            <template v-if="people.counts.unknownResidency"> · {{ people.counts.unknownResidency }} without residency</template>
          </p>

          <p class="mt-4 type-label t-text-muted">HOA Admins</p>
          <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
            <li v-for="p in people.hoaAdmins" :key="p.id" class="flex items-center justify-between gap-3 py-2">
              <span class="min-w-0">
                <span class="block truncate type-body t-text">{{ p.name || "—" }}<span v-if="p.status === 'pending'" class="ml-1 type-micro text-warning">invited</span></span>
                <a v-if="p.email" :href="`mailto:${p.email}`" class="block truncate type-micro t-text-muted hover:underline">{{ p.email }}</a>
              </span>
              <span class="shrink-0 type-micro t-text-muted">signed in {{ relativeDays(p.lastSignInAt) }}</span>
            </li>
            <li v-if="!people.hoaAdmins.length" class="py-2 type-meta text-warning">This community has no HOA Admin.</li>
          </ul>

          <template v-if="people.boardOfficers.length">
            <p class="mt-4 type-label t-text-muted">Board officers</p>
            <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
              <li v-for="p in people.boardOfficers" :key="p.id" class="flex items-center justify-between gap-3 py-2">
                <span class="min-w-0">
                  <span class="block truncate type-body t-text">{{ p.name || "—" }}</span>
                  <a v-if="p.email" :href="`mailto:${p.email}`" class="block truncate type-micro t-text-muted hover:underline">{{ p.email }}</a>
                </span>
                <span class="shrink-0 type-micro t-text-muted">{{ BOARD_TITLE[p.title] ?? p.title }}</span>
              </li>
            </ul>
          </template>

          <template v-if="people.propertyManagers.length">
            <p class="mt-4 type-label t-text-muted">Property Managers</p>
            <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
              <li v-for="p in people.propertyManagers" :key="p.id" class="py-2">
                <span class="block truncate type-body t-text">{{ p.name || "—" }}</span>
                <a v-if="p.email" :href="`mailto:${p.email}`" class="block truncate type-micro t-text-muted hover:underline">{{ p.email }}</a>
                <span class="mt-1 flex flex-wrap gap-1">
                  <span v-for="g in p.grants" :key="g" class="rounded-full t-bg-subtle px-2 py-0.5 type-micro t-text-secondary">{{ grantLabel(g) }}</span>
                  <span v-if="!p.grants.length" class="type-micro t-text-muted">No grants</span>
                </span>
              </li>
            </ul>
          </template>

          <template v-if="people.billingAccountMembers.length">
            <p class="mt-4 type-label t-text-muted">{{ c.billingAccount?.name }} (billing account)</p>
            <ul class="mt-1 divide-y divide-[var(--theme-border-light)]">
              <li v-for="p in people.billingAccountMembers" :key="p.id" class="flex items-center justify-between gap-3 py-2">
                <span class="min-w-0">
                  <span class="block truncate type-body t-text">{{ p.name || "—" }}</span>
                  <a v-if="p.email" :href="`mailto:${p.email}`" class="block truncate type-micro t-text-muted hover:underline">{{ p.email }}</a>
                </span>
                <span class="shrink-0 type-micro t-text-muted">{{ BILLING_ROLE[p.role] ?? p.role }}</span>
              </li>
            </ul>
          </template>
        </section>

        <!-- Billing -->
        <section class="ios-card p-4">
          <h2 class="type-card t-text">Billing</h2>
          <p v-if="billing.error" class="mt-2 rounded-lg bg-warning/15 px-3 py-2 type-meta text-warning">{{ billing.error }}</p>

          <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 type-meta">
            <dt class="t-text-muted">Band</dt>
            <dd class="t-text">{{ billing.band?.name ?? "—" }}</dd>
            <dt class="t-text-muted">Units now fit</dt>
            <dd :class="bandMismatch ? 'text-warning' : 't-text'">
              {{ billing.bandForUnits ? `${billing.bandForUnits.name} (${billing.bandForUnits.units} units)` : "—" }}
            </dd>
            <template v-if="billing.subscription">
              <dt class="t-text-muted">Subscription</dt>
              <dd class="flex flex-wrap items-center gap-1">
                <OpsStatusPill :status="billing.subscription.status" />
                <span v-if="billing.subscription.cancelAtPeriodEnd" class="type-micro text-warning">cancels at period end</span>
              </dd>
              <dt class="t-text-muted">Per month</dt>
              <dd class="tabular-nums t-text">{{ money(billing.subscription.monthlyValueCents) }}</dd>
              <template v-if="billing.source === 'billing_account'">
                <dt class="t-text-muted">Quantity</dt>
                <dd class="t-text">{{ billing.subscription.quantity }} communities</dd>
              </template>
              <template v-if="billing.subscription.status !== 'canceled'">
                <dt class="t-text-muted">{{ billing.subscription.cancelAtPeriodEnd ? "Ends" : "Renews" }}</dt>
                <dd class="t-text">{{ shortDate(billing.subscription.currentPeriodEnd) }}</dd>
              </template>
              <template v-if="billing.subscription.discount">
                <dt class="t-text-muted">Discount</dt>
                <dd class="t-text">
                  {{ billing.subscription.discount.promotionCode || billing.subscription.discount.name || "Coupon" }} ·
                  {{ billing.subscription.discount.percentOff ? `${billing.subscription.discount.percentOff}%` : money(billing.subscription.discount.amountOff) }}
                  {{ billing.subscription.discount.duration }}
                </dd>
              </template>
            </template>
          </dl>
          <p v-if="!billing.subscription && !billing.error" class="mt-2 type-meta t-text-muted">No Stripe subscription on record.</p>
          <p v-if="bandMismatch" class="mt-2 type-micro text-warning">
            Its units now fall into a different band than the one it pays for.
          </p>
          <div v-if="canAct && (sub || links?.stripeCustomer)" class="mt-3 flex flex-wrap gap-2">
            <Button v-if="sub && sub.status !== 'canceled'" variant="outline" size="sm" @click="start('cancel')">Cancel…</Button>
            <Button v-if="sub?.cancelAtPeriodEnd && sub.status !== 'canceled'" variant="outline" size="sm" @click="start('resume')">Resume</Button>
            <Button v-if="links?.stripeCustomer" variant="ghost" size="sm" @click="start('portal')">Billing portal</Button>
          </div>
          <p v-else-if="canWrite && billing.otherMode" class="mt-2 type-micro t-text-muted">Actions are off for objects in the other Stripe mode.</p>

          <p class="mt-4 type-label t-text-muted">Invoices</p>
          <ul v-if="billing.invoices.length" class="mt-1 divide-y divide-[var(--theme-border-light)]">
            <li v-for="inv in billing.invoices" :key="inv.id" class="flex items-center justify-between gap-2 py-1.5 type-meta">
              <a v-if="inv.url" :href="inv.url" target="_blank" rel="noopener" class="t-text hover:underline">{{ shortDate(inv.created) }}</a>
              <span v-else class="t-text">{{ shortDate(inv.created) }}</span>
              <span class="tabular-nums t-text-secondary">{{ money(inv.total, inv.currency) }}</span>
              <OpsStatusPill :status="inv.status" />
            </li>
          </ul>
          <p v-else class="mt-1 type-micro t-text-muted">None.</p>

          <p class="mt-4 type-label t-text-muted">Charges and refunds</p>
          <ul v-if="billing.charges.length" class="mt-1 divide-y divide-[var(--theme-border-light)]">
            <li v-for="ch in billing.charges" :key="ch.id" class="py-1.5 type-meta">
              <span class="flex items-center justify-between gap-2">
                <span class="t-text">{{ shortDate(ch.created) }}<span v-if="ch.last4" class="ml-1 type-micro t-text-muted">•••• {{ ch.last4 }}</span></span>
                <span class="tabular-nums t-text-secondary">{{ money(ch.amount, ch.currency) }}</span>
                <OpsStatusPill :status="ch.refunded ? 'refunded' : ch.amountRefunded ? 'partially_refunded' : ch.status" />
                <Button v-if="canAct && ch.refundable" variant="ghost" size="sm" class="h-7 px-2" @click="startRefund(ch)">Refund</Button>
              </span>
              <span v-if="ch.amountRefunded" class="block type-micro text-warning">{{ money(ch.amountRefunded, ch.currency) }} refunded</span>
              <span v-if="ch.failureMessage" class="block type-micro text-destructive">{{ ch.failureMessage }}</span>
            </li>
          </ul>
          <p v-else class="mt-1 type-micro t-text-muted">None.</p>
        </section>
      </div>

      <!-- Activity -->
      <section class="ios-card mt-4 p-4">
        <h2 class="type-card t-text">Activity</h2>
        <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 type-meta sm:grid-cols-4">
          <dt class="t-text-muted">Last HOA Admin sign-in</dt>
          <dd class="t-text">{{ relativeDays(activity.lastAdminSignInAt) }}</dd>
          <dt class="t-text-muted">AI wallet</dt>
          <dd class="t-text">
            <template v-if="activity.aiWallet">{{ activity.aiWallet.balance_credits ?? 0 }} credits</template>
            <template v-else>—</template>
          </dd>
        </dl>
        <p class="mt-4 type-label t-text-muted">Community audit log (last 20)</p>
        <ul v-if="activity.audit.length" class="mt-1 divide-y divide-[var(--theme-border-light)]">
          <li v-for="a in activity.audit" :key="a.id" class="py-1.5">
            <span class="block type-meta t-text">{{ a.summary || a.eventType }}</span>
            <span class="block type-micro t-text-muted">{{ shortDate(a.occurredAt) }}<template v-if="a.actorName"> · {{ a.actorName }}</template></span>
          </li>
        </ul>
        <p v-else class="mt-1 type-micro t-text-muted">Nothing logged.</p>
      </section>

      <OpsActionDialog v-if="actionProps" v-model:open="actionOpen" v-bind="actionProps" @done="onDone">
        <div v-if="action === 'cancel'" class="space-y-2">
          <AppSegmentedControl
            v-model="cancelWhen"
            :items="[{ value: 'period_end', label: 'At period end' }, { value: 'now', label: 'Now' }]"
            size="sm"
            label="When"
          />
          <p class="type-micro t-text-muted">
            {{ cancelWhen === "now" ? "Ends today. Nothing is refunded." : `Keeps working until ${shortDate(sub?.currentPeriodEnd)}.` }}
          </p>
        </div>
        <div v-else-if="action === 'trial'" class="space-y-1.5">
          <Label for="ops-trial-ends">Trial ends on</Label>
          <DateInput id="ops-trial-ends" v-model="trialEndsOn" :min="today()" :max="trialMax" />
          <p class="type-micro t-text-muted">At most {{ TRIAL_MAX_DAYS }} days from today.</p>
        </div>
      </OpsActionDialog>
      <OpsRefundDialog v-model:open="refundOpen" :charge="refundCharge" :payer="whose.replace(/'s$/, '')" @done="refresh()" />
    </template>
  </OpsShell>
</template>
