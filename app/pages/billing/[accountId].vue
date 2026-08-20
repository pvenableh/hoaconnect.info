<script setup lang="ts">
// Agency dashboard (docs/plan-agency-multi-property-billing.md §8): properties +
// seat usage, payment method / invoices (Stripe Customer Portal), add-property,
// detach, manual seat-sync, and the initial subscribe flow. Access is gated by
// the overview endpoint (viewer+); manage actions require owner/billing_admin.
definePageMeta({ middleware: ["auth"] });

const route = useRoute();
const accountId = computed(() => String(route.params.accountId));
const { user } = useDirectusAuth();
const { accounts: billingAccounts } = useBillingMemberships();

const myRole = computed(
  () => billingAccounts.value.find((a) => a.id === accountId.value)?.role ?? null
);
const canManage = computed(
  () => myRole.value === "owner" || myRole.value === "billing_admin"
);

const { data, pending, error, refresh } = await useAsyncData(
  `billing-overview-${accountId.value}`,
  () => $fetch("/api/billing-account/overview", { query: { accountId: accountId.value } }),
  { watch: [accountId] }
);

const account = computed(() => (data.value as any)?.account ?? null);
const properties = computed(() => (data.value as any)?.properties ?? []);
const members = computed(() => (data.value as any)?.members ?? []);
const stripeInfo = computed(() => (data.value as any)?.stripe ?? null);
const seatsActive = computed(() => (data.value as any)?.seatsActive ?? 0);

const busy = ref(false);
const showAdd = ref(false);
const showSubscribe = ref(false);
const newProp = reactive({
  name: "",
  slug: "",
  street_address: "",
  city: "",
  state: "",
  zip: "",
  // The community's own administrator. Required by the API — see the
  // board-admin guarantee in add-property.post.ts. An agency that creates a
  // property and keeps the only admin seat has created a community that cannot
  // leave, and every later fix for that has to go through the manager.
  boardAdminFirstName: "",
  boardAdminLastName: "",
  boardAdminEmail: "",
});
const canCreateProperty = computed(
  () =>
    !!newProp.name &&
    !!newProp.slug &&
    !!newProp.boardAdminFirstName &&
    !!newProp.boardAdminLastName &&
    !!newProp.boardAdminEmail
);

/** What the last detach did, so the grace date is visible rather than implied. */
const lastDetach = ref<{ name: string; graceEndsAt: string | null } | null>(null);

const config = useRuntimeConfig();
const agencyPriceId = computed(() =>
  account.value?.billing_cycle === "yearly"
    ? config.public.agencyPriceIdYearly
    : config.public.agencyPriceIdMonthly
);

const statusColor = (s: string | null | undefined) =>
  ({ active: "bg-green-500", trial: "bg-blue-500", past_due: "bg-amber-500", expired: "bg-red-500", canceled: "bg-gray-400" }[s || ""] || "bg-gray-400");

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtMoney = (n: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(n);

async function syncSeats() {
  busy.value = true;
  try {
    await $fetch("/api/stripe/billing-account/sync-seats", { method: "POST", body: { accountId: accountId.value } });
    await refresh();
  } catch (e: any) {
    alert(e?.data?.message || "Failed to sync seats");
  } finally {
    busy.value = false;
  }
}

async function openPortal() {
  busy.value = true;
  try {
    const { url } = await $fetch<{ url: string }>("/api/stripe/billing-account/portal", {
      method: "POST",
      body: { accountId: accountId.value },
    });
    window.location.href = url;
  } catch (e: any) {
    alert(e?.data?.message || "Could not open billing portal");
    busy.value = false;
  }
}

async function addProperty() {
  if (!canCreateProperty.value) return;
  busy.value = true;
  try {
    const { name, slug, street_address, city, state, zip } = newProp;
    const res: any = await $fetch("/api/billing-account/add-property", {
      method: "POST",
      body: {
        accountId: accountId.value,
        name,
        slug,
        street_address,
        city,
        state,
        zip,
        boardAdmin: {
          firstName: newProp.boardAdminFirstName,
          lastName: newProp.boardAdminLastName,
          email: newProp.boardAdminEmail,
        },
      },
    });
    showAdd.value = false;
    // The property exists either way; a failed invitation is worth saying out
    // loud, because the guarantee it provides is the point of the field.
    if (res?.boardAdminInvite && res.boardAdminInvite.sent === false) {
      alert(
        `${name} was created, but the administrator invitation to ${res.boardAdminInvite.email} could not be sent. ` +
          `Invite them from the property's Members page — until someone from the community holds an admin seat, ` +
          `the community cannot take its account back.`
      );
    }
    Object.assign(newProp, {
      name: "",
      slug: "",
      street_address: "",
      city: "",
      state: "",
      zip: "",
      boardAdminFirstName: "",
      boardAdminLastName: "",
      boardAdminEmail: "",
    });
    await refresh();
  } catch (e: any) {
    alert(e?.data?.message || "Failed to add property");
  } finally {
    busy.value = false;
  }
}

/**
 * Detach is a BILLING change, not an offboarding — and since Phase 4 it is also
 * not a cliff. The old copy here ("it will revert to self-billed and need its
 * own subscription") described the old behaviour, where the org's status went
 * straight to expired and the board was locked out of an account they still
 * had to run. It now opens a 60-day grace window instead, and nobody's access
 * is touched. Saying so is the difference between an agency that detaches a
 * property cleanly and one that avoids the button.
 */
async function detach(orgId: string, name: string) {
  if (
    !confirm(
      `Remove "${name}" from this billing account?\n\n` +
        `• It stops being billed through this account and your seat count goes down.\n` +
        `• Nobody loses access — your managers keep working on it.\n` +
        `• The community keeps running for 60 days while it sorts out its own subscription.\n\n` +
        `To actually hand a community over — revoke a manager's access and promote a board member — ` +
        `use the transition wizard in that community's Settings → Vendors & management.`
    )
  )
    return;
  busy.value = true;
  try {
    const res: any = await $fetch("/api/billing-account/detach-org", {
      method: "POST",
      body: { orgId },
    });
    lastDetach.value = { name, graceEndsAt: res?.graceEndsAt ?? null };
    await refresh();
  } catch (e: any) {
    alert(e?.data?.message || "Failed to detach property");
  } finally {
    busy.value = false;
  }
}

async function onSubscribed() {
  showSubscribe.value = false;
  await refresh();
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <div v-if="pending" class="py-16 text-center t-text-muted">Loading…</div>

    <div v-else-if="error || !account" class="py-16 text-center">
      <p class="t-text-secondary">You don’t have access to this billing account, or it doesn’t exist.</p>
      <NuxtLink to="/dashboard" class="mt-3 inline-block text-sm text-blue-600">← Back to dashboard</NuxtLink>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-wide t-text-muted">Agency billing</p>
          <h1 class="flex items-center gap-2 text-2xl font-semibold t-text">
            {{ account.name }}
            <span :class="['inline-block h-2.5 w-2.5 rounded-full', statusColor(account.subscription_status)]" />
          </h1>
          <p class="mt-1 text-sm t-text-muted capitalize">
            {{ account.subscription_status }}
            <template v-if="account.subscription_status === 'trial' && account.trial_ends_at">
              · trial ends {{ fmtDate(account.trial_ends_at) }}
            </template>
            <template v-if="account.is_free_account"> · comped</template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-md t-bg-subtle px-3 py-1.5 text-sm t-text-secondary">
            <strong>{{ seatsActive }}</strong> active /
            <strong>{{ account.seats_purchased }}</strong> seats
          </span>
        </div>
      </div>

      <!-- Subscribe prompt (no subscription yet, not comped) -->
      <div v-if="canManage && !account.hasSubscription && !account.is_free_account" class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-amber-800">No active subscription — properties under this account are not entitled until you subscribe.</p>
          <button
            v-if="agencyPriceId"
            class="shrink-0 rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
            @click="showSubscribe = !showSubscribe"
          >
            {{ showSubscribe ? "Cancel" : "Set up billing" }}
          </button>
          <span v-else class="shrink-0 text-xs text-amber-700">Set STRIPE_AGENCY_PRICE_ID_* to enable</span>
        </div>
        <div v-if="showSubscribe && agencyPriceId" class="mt-4 border-t border-amber-200 pt-4">
          <BillingAccountSubscribe
            :account-id="accountId"
            :price-id="agencyPriceId"
            :billing-cycle="account.billing_cycle || 'monthly'"
            :email="user?.email || ''"
            :name="account.name"
            @success="onSubscribed"
          />
        </div>
      </div>

      <!-- Properties -->
      <section class="mt-8">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide t-text-muted">Properties</h2>
          <div class="flex items-center gap-2">
            <button v-if="canManage" :disabled="busy" class="text-sm text-blue-600 disabled:opacity-50" @click="syncSeats">Sync seats</button>
            <button v-if="canManage" :disabled="busy" class="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50" @click="showAdd = !showAdd">+ Add property</button>
          </div>
        </div>

        <!-- Add property form -->
        <div v-if="showAdd && canManage" class="mb-3 rounded-lg border t-bg-subtle p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input v-model="newProp.name" placeholder="Property name" class="rounded-md border px-3 py-2 text-sm" />
            <input v-model="newProp.slug" placeholder="slug (lowercase-hyphenated)" class="rounded-md border px-3 py-2 text-sm" />
            <input v-model="newProp.street_address" placeholder="Street address" class="rounded-md border px-3 py-2 text-sm" />
            <input v-model="newProp.city" placeholder="City" class="rounded-md border px-3 py-2 text-sm" />
            <input v-model="newProp.state" placeholder="State" class="rounded-md border px-3 py-2 text-sm" />
            <input v-model="newProp.zip" placeholder="ZIP" class="rounded-md border px-3 py-2 text-sm" />
          </div>

          <div class="mt-4 rounded-md border t-border bg-white p-3">
            <p class="text-sm font-medium t-text">Who runs this community's account?</p>
            <p class="mt-0.5 text-xs t-text-muted">
              Someone from the community — a board member, not your staff. They're invited as an
              administrator alongside you. This is what lets the community take its own account back
              later without going through you, and it's required.
            </p>
            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input v-model="newProp.boardAdminFirstName" placeholder="First name" class="rounded-md border px-3 py-2 text-sm" />
              <input v-model="newProp.boardAdminLastName" placeholder="Last name" class="rounded-md border px-3 py-2 text-sm" />
              <input v-model="newProp.boardAdminEmail" type="email" placeholder="board@community.org" class="rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>

          <div class="mt-3 flex justify-end gap-2">
            <button class="text-sm t-text-muted" @click="showAdd = false">Cancel</button>
            <button :disabled="busy || !canCreateProperty" class="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" @click="addProperty">Create property</button>
          </div>
        </div>

        <div v-if="lastDetach" class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p class="font-medium">{{ lastDetach.name }} is no longer billed through this account.</p>
          <p v-if="lastDetach.graceEndsAt">
            Nobody lost access, and the community keeps running until
            {{ fmtDate(lastDetach.graceEndsAt) }} while it sets up its own subscription.
          </p>
          <p v-else>Nobody lost access. The community keeps running.</p>
        </div>

        <div class="overflow-hidden rounded-lg border">
          <table class="w-full text-sm">
            <thead class="t-bg-subtle text-left text-xs uppercase tracking-wide t-text-muted">
              <tr>
                <th class="px-4 py-2">Property</th>
                <th class="px-4 py-2">Status</th>
                <th class="px-4 py-2">Members</th>
                <th v-if="canManage" class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="p in properties" :key="p.id">
                <td class="px-4 py-2">
                  <NuxtLink :to="`/${p.slug}`" class="font-medium t-text hover:text-blue-600">{{ p.name }}</NuxtLink>
                  <span class="ml-1 text-xs t-text-muted">/{{ p.slug }}</span>
                </td>
                <td class="px-4 py-2 capitalize">{{ p.status }}</td>
                <td class="px-4 py-2">{{ p.member_count ?? "—" }}</td>
                <td v-if="canManage" class="px-4 py-2 text-right">
                  <button :disabled="busy" class="text-xs text-red-600 hover:underline disabled:opacity-50" @click="detach(p.id, p.name)">Detach</button>
                </td>
              </tr>
              <tr v-if="!properties.length">
                <td :colspan="canManage ? 4 : 3" class="px-4 py-6 text-center t-text-muted">No properties attached yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Billing -->
      <section class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div class="rounded-lg border p-4">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide t-text-muted">Payment method</h2>
          <p v-if="stripeInfo?.paymentMethod" class="text-sm t-text-secondary">
            <span class="capitalize">{{ stripeInfo.paymentMethod.brand || stripeInfo.paymentMethod.type }}</span>
            •••• {{ stripeInfo.paymentMethod.last4 }}
            <span v-if="stripeInfo.paymentMethod.exp_month" class="t-text-muted">
              (exp {{ stripeInfo.paymentMethod.exp_month }}/{{ stripeInfo.paymentMethod.exp_year }})
            </span>
          </p>
          <p v-else class="text-sm t-text-muted">No payment method on file.</p>
          <button v-if="canManage && account.hasSubscription" :disabled="busy" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:t-bg-subtle disabled:opacity-50" @click="openPortal">
            Manage payment &amp; invoices →
          </button>
        </div>

        <div class="rounded-lg border p-4">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide t-text-muted">Recent invoices</h2>
          <ul v-if="stripeInfo?.invoices?.length" class="space-y-1.5 text-sm">
            <li v-for="inv in stripeInfo.invoices.slice(0, 6)" :key="inv.id" class="flex items-center justify-between">
              <a :href="inv.hosted_invoice_url" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
                {{ fmtDate(inv.created) }}
              </a>
              <span class="t-text-secondary">{{ fmtMoney(inv.total, inv.currency) }}</span>
              <span class="text-xs capitalize t-text-muted">{{ inv.status }}</span>
            </li>
          </ul>
          <p v-else class="text-sm t-text-muted">No invoices yet.</p>
          <p v-if="stripeInfo?.upcoming" class="mt-2 text-xs t-text-muted">
            Next: {{ fmtMoney(stripeInfo.upcoming.total, stripeInfo.upcoming.currency) }}
            <template v-if="stripeInfo.upcoming.next_payment_attempt"> on {{ fmtDate(stripeInfo.upcoming.next_payment_attempt) }}</template>
          </p>
        </div>
      </section>

      <!-- Members -->
      <section class="mt-8">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide t-text-muted">Billing team</h2>
        <ul class="rounded-lg border divide-y text-sm">
          <li v-for="m in members" :key="m.id" class="flex items-center justify-between px-4 py-2">
            <span>{{ [m.user?.first_name, m.user?.last_name].filter(Boolean).join(" ") || m.user?.email }}</span>
            <span class="text-xs capitalize t-text-muted">{{ m.role }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
