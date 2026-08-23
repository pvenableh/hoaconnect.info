<script setup lang="ts">
/**
 * The band at the top of Settings: is this community actually SET UP?
 *
 * Settings is the one dock slot that still lands on a grid of cards, and that
 * is deliberate — its map has twelve destinations against the sub-nav's curated
 * five, so landing on "Organization → General" would hide seven of them. The
 * fix isn't to delete the map, it's to stop the screen being ONLY a map. Every
 * tile here answers a question an admin would otherwise have to open three tabs
 * to ask: am I paid up, what's turned on, is my domain live, can residents pay,
 * when did I last take a copy of my data.
 *
 * Each tile links to the tab that fixes it, so a warning is one click from
 * being dealt with.
 *
 * THERE IS NO STORED RENEWAL DATE. Stripe holds the period end; the org row
 * carries only `billing_cycle`, `trial_ends_at` and `grace_ends_at`. So an
 * active subscription says how it is billed rather than inventing a date — a
 * made-up "renews on the 14th" is worse than no date at all.
 */
const { selectedOrgId } = await useSelectedOrg();
const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();
const config = useRuntimeConfig();

const orgItems = useDirectusItems("hoa_organizations");
const orgId = computed(() => selectedOrgId.value);

const mainDomain = computed(
  () => (config.public.mainDomain as string) || "app.hoaconnect.info",
);

type Tone = "good" | "warn" | "bad" | "idle";

interface GlanceTile {
  key: string;
  icon: string;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  to?: string;
}

const { data, pending } = await useAsyncData(
  `settings-glance-${orgId.value}`,
  async () => {
    if (!orgId.value) return null;

    // allSettled, not all: the export history is HOA-Admin only, so a property
    // manager sitting on this page gets a 403 for that one call. Four working
    // tiles and one honest "unavailable" beats a blank strip.
    const [org, exports] = await Promise.allSettled([
      orgItems.get(orgId.value, {
        fields: [
          "id",
          "slug",
          "billing_cycle",
          "custom_domain",
          "domain_verified",
          "external_url",
          "connect_onboarding_status",
          "connect_payouts_enabled",
          "subscription_plan.name",
          "billing_account.name",
          ...entitlementFields(),
        ],
      }) as Promise<any>,
      $fetch<{ exports: any[] }>("/api/org/export", {
        query: { orgId: orgId.value, limit: 5 },
      }),
    ]);

    return {
      org: org.status === "fulfilled" ? org.value : null,
      exports: exports.status === "fulfilled" ? exports.value?.exports || [] : [],
      exportsReadable: exports.status === "fulfilled",
    };
  },
  { watch: [orgId], server: false },
);

const org = computed<any>(() => data.value?.org || null);

/**
 * Two states that are NOT "everything is misconfigured", and both render as
 * exactly that if you let the tiles compute off a null org: the fetch hasn't
 * landed yet, and the fetch failed. Caught by running it — `server: false`
 * means the first client paint has `pending === false` and `data === null`, so
 * for one frame the strip confidently reported "No plan" and a landing URL with
 * no slug on a community that is fully set up.
 */
const loading = computed(() => pending.value || !data.value);
const unreadable = computed(() => Boolean(data.value) && !data.value?.org);

// ---- dates ----
const shortDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

const daysUntil = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
};

// ---- plan ----
const planTile = computed<GlanceTile>(() => {
  const ent = resolveEntitlement(org.value);
  const accountName =
    typeof org.value?.billing_account === "object"
      ? org.value?.billing_account?.name
      : null;
  const planName =
    typeof org.value?.subscription_plan === "object"
      ? org.value?.subscription_plan?.name
      : null;
  const cycle =
    org.value?.billing_cycle === "yearly" ? "Billed yearly" : "Billed monthly";
  const base = { key: "plan", icon: "lucide:sparkles", label: "Plan" };

  if (ent.is_free_account) {
    return { ...base, value: "Comped", detail: "No subscription charges", tone: "good" };
  }

  const to = buildOrgPath("/admin/settings/organization?tab=subscription");

  // Grace first: the status still reads canceled underneath, on purpose, so
  // checking it before the status is the only way to say the true thing.
  if (ent.inGrace) {
    const ends = shortDate(ent.grace_ends_at);
    return {
      ...base,
      value: "Grace period",
      detail: ends ? `Access ends ${ends}` : "Set up billing to keep access",
      tone: "warn",
      to,
    };
  }

  switch (ent.subscription_status) {
    case "active":
      return {
        ...base,
        value: planName || "Subscribed",
        detail: accountName ? `Billed through ${accountName}` : cycle,
        tone: "good",
        to,
      };
    case "trial": {
      const left = daysUntil(ent.trial_ends_at);
      const ends = shortDate(ent.trial_ends_at);
      return {
        ...base,
        value: "Trial",
        detail: ends ? `Ends ${ends}` : "No end date set",
        tone: left != null && left <= 7 ? "warn" : "good",
        to,
      };
    }
    case "past_due":
      return { ...base, value: "Past due", detail: "A payment failed", tone: "bad", to };
    case "canceled":
      return { ...base, value: "Canceled", detail: "Resubscribe to keep access", tone: "bad", to };
    case "expired":
      return { ...base, value: "Expired", detail: "Resubscribe to keep access", tone: "bad", to };
    default:
      return { ...base, value: "No plan", detail: "Choose a plan", tone: "warn", to };
  }
});

// ---- modules ----
// Counted through useModules so the "a missing key means ON" rule has exactly
// one implementation; MODULE_GROUPS is the same list the Modules form renders.
const modulesTile = computed<GlanceTile>(() => {
  const total = ALL_MODULE_KEYS.length;
  const on = ALL_MODULE_KEYS.filter((k) => isEnabled(k)).length;
  return {
    key: "modules",
    icon: "lucide:toggle-right",
    label: "Features",
    value: `${on} of ${total} on`,
    detail: on === total ? "Everything turned on" : `${total - on} turned off`,
    tone: "idle",
    to: buildOrgPath("/admin/settings/organization?tab=modules"),
  };
});

// ---- public site ----
const siteTile = computed<GlanceTile>(() => {
  const base = { key: "site", icon: "lucide:globe", label: "Public site" };
  const to = buildOrgPath("/admin/settings/domains");
  const external = org.value?.external_url;
  const domain = org.value?.custom_domain;

  if (external) {
    let host = external;
    try {
      host = new URL(external).host;
    } catch {
      /* a half-typed URL still deserves to be shown */
    }
    return { ...base, value: "External site", detail: host, tone: "idle", to };
  }
  if (domain) {
    return org.value?.domain_verified
      ? { ...base, value: domain, detail: "Custom domain live", tone: "good", to }
      : { ...base, value: domain, detail: "Not verified yet", tone: "warn", to };
  }
  return {
    ...base,
    value: "Built-in landing",
    detail: `${mainDomain.value}/${org.value?.slug || ""}`,
    tone: "idle",
    to,
  };
});

// ---- payouts ----
const payoutsTile = computed<GlanceTile>(() => {
  const base = { key: "payouts", icon: "lucide:banknote", label: "Payouts" };
  const to = buildOrgPath("/admin/settings/organization?tab=payments");
  const status = org.value?.connect_onboarding_status || "none";

  if (status === "active") {
    // Stripe can keep an account "active" while holding payouts — charges and
    // payouts are separate switches, and the tile would lie by reading one.
    return org.value?.connect_payouts_enabled === false
      ? { ...base, value: "On hold", detail: "Stripe has paused payouts", tone: "warn", to }
      : { ...base, value: "Connected", detail: "Dues reach your bank", tone: "good", to };
  }
  if (status === "pending") {
    return { ...base, value: "Half set up", detail: "Stripe still needs details", tone: "warn", to };
  }
  if (status === "restricted") {
    return { ...base, value: "Restricted", detail: "Stripe needs more information", tone: "bad", to };
  }
  return { ...base, value: "Not connected", detail: "No online dues yet", tone: "warn", to };
});

// ---- data export ----
const exportTile = computed<GlanceTile>(() => {
  const base = { key: "export", icon: "lucide:download", label: "Data export" };
  const to = buildOrgPath("/admin/settings/data");

  if (data.value && !data.value.exportsReadable) {
    return { ...base, value: "—", detail: "Export history unavailable", tone: "idle" };
  }

  const rows = data.value?.exports || [];
  if (rows.some((r: any) => r.status === "queued" || r.status === "running")) {
    return { ...base, value: "Preparing…", detail: "An archive is being built", tone: "idle", to };
  }

  const ready = rows.find((r: any) => r.status === "ready");
  if (ready) {
    const when = shortDate(ready.dateCompleted || ready.dateCreated);
    const left = daysUntil(ready.expiresAt);
    return {
      ...base,
      value: when || "Ready",
      detail:
        left != null && left > 0
          ? `Download expires in ${left} day${left === 1 ? "" : "s"}`
          : ready.tier === "shareable"
            ? "Shareable copy"
            : "Full archive",
      tone: "good",
      to,
    };
  }

  if (rows.some((r: any) => r.status === "failed")) {
    return { ...base, value: "Failed", detail: "The last export didn't finish", tone: "bad", to };
  }

  const expired = rows.find((r: any) => r.status === "expired");
  if (expired) {
    return {
      ...base,
      value: shortDate(expired.dateCompleted || expired.dateCreated) || "Expired",
      detail: "That archive has been purged",
      tone: "idle",
      to,
    };
  }

  return { ...base, value: "Never", detail: "Your data is yours — take it", tone: "idle", to };
});

// A community that doesn't collect dues online has no use for a Stripe tile,
// and a permanent "Not connected" warning it can't act on is worse than silence.
const tiles = computed<GlanceTile[]>(() =>
  [
    planTile.value,
    modulesTile.value,
    siteTile.value,
    ...(isEnabled("payments") ? [payoutsTile.value] : []),
    exportTile.value,
  ],
);

const needsAttention = computed(
  () => tiles.value.filter((t) => t.tone === "warn" || t.tone === "bad").length,
);

// `<component :is="'NuxtLink'">` renders a literal <nuxtlink> element — the
// string is only resolved against LOCALLY registered components, and Nuxt's
// auto-import isn't that. It looks right on screen and every tile silently
// stops being a link. Resolve it once, up here, and pass the component.
const NuxtLinkComponent = resolveComponent("NuxtLink");
</script>

<template>
  <div class="ios-card p-5 space-y-4">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="type-card">Configuration</h2>
        <p class="type-meta">
          <template v-if="loading">Checking how this community is set up…</template>
          <template v-else-if="unreadable">This community's configuration couldn't be read.</template>
          <template v-else-if="needsAttention">
            {{ needsAttention }} thing{{ needsAttention === 1 ? "" : "s" }} worth a look.
          </template>
          <template v-else>Everything here is set up.</template>
        </p>
      </div>
      <Icon
        v-if="!loading && !unreadable"
        :name="needsAttention ? 'lucide:alert-circle' : 'lucide:check-circle-2'"
        class="w-5 h-5 shrink-0"
        :class="needsAttention ? 'glance-icon--warn' : 'glance-icon--good'"
      />
    </div>

    <div v-if="loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div v-for="i in 5" :key="i" class="river-skeleton h-16 rounded-xl" />
    </div>

    <p v-else-if="unreadable" class="type-meta">
      The cards below still work — this strip just couldn't load the
      organization record it reads from.
    </p>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <component
        :is="tile.to ? NuxtLinkComponent : 'div'"
        v-for="tile in tiles"
        :key="tile.key"
        :to="tile.to"
        class="glance-tile"
        :class="tile.to ? 'glance-tile--link' : ''"
      >
        <span class="glance-tile__head">
          <Icon :name="tile.icon" class="w-3.5 h-3.5" />
          {{ tile.label }}
        </span>
        <span class="glance-tile__value" :class="`glance-tile__value--${tile.tone}`">
          <span class="glance-dot" :class="`glance-dot--${tile.tone}`" aria-hidden="true" />
          <span class="truncate">{{ tile.value }}</span>
        </span>
        <span class="glance-tile__detail">{{ tile.detail }}</span>
      </component>
    </div>
  </div>
</template>

<style scoped>
.glance-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.75rem;
  border-radius: 0.75rem;
  /* Recessed against the card, with a border that survives dark mode: the
     bg-secondary/bg-elevated gap is 3 points per channel there, so the edge is
     doing all the work of separating one tile from the next. */
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
}
.glance-tile--link {
  transition: border-color var(--theme-transition-fast), transform var(--theme-transition-fast);
}
.glance-tile--link:hover {
  border-color: var(--theme-accent-primary);
  transform: translateY(-1px);
}
.glance-tile__head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: var(--theme-tracking-wide);
  text-transform: uppercase;
  color: var(--theme-text-muted);
}
.glance-tile__value {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.9375rem;
  font-weight: 650;
  color: var(--theme-text-primary);
}
/* Only a problem gets coloured ink. Colouring every value would make the two
   that matter disappear into the rest. */
.glance-tile__value--warn { color: var(--warning); }
.glance-tile__value--bad { color: var(--destructive); }
.glance-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  flex-shrink: 0;
}
.glance-dot--good { background: var(--success); }
.glance-dot--warn { background: var(--warning); }
.glance-dot--bad { background: var(--destructive); }
.glance-dot--idle { background: var(--theme-text-muted); }
.glance-tile__detail {
  font-size: 0.75rem;
  color: var(--theme-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.glance-icon--good { color: var(--success); }
.glance-icon--warn { color: var(--warning); }
</style>
