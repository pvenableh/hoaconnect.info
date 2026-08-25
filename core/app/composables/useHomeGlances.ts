// The shared reads behind the home's glance rail, chart rail and the three
// dashboard chart widgets that asked the same questions first.
//
// ── Why these live here ─────────────────────────────────────────────────────
// Phase 7's rails are the second surface to want "what is owed", "how old is
// the open queue" and "who lives in the homes". The first was the dashboard's
// Collections / Requests-health / Occupancy widgets, each of which fetched
// inside its own component. The plan's rule for the rails is explicit: extract
// the fetch, do NOT write a second set of queries against the same collections.
// So the query moved here and the arithmetic moved to
// `#core/shared/home/glances`, and the widgets now consume this too — which
// means a dashboard showing both a rail tile and its widget makes ONE request,
// not two.
//
// Every composable keeps the `useAsyncData` key its original caller used where
// the shape is unchanged, because a shared key IS the sharing mechanism: two
// components asking for the same key get one request and one piece of state.
//
// ── What each one does NOT do ───────────────────────────────────────────────
// Nothing here calls an AI route, and nothing here writes. Landing on the
// dashboard must stay free.
//
// ── Why the org id is a PARAMETER ───────────────────────────────────────────
// `useSelectedOrg()` is async, and these live in a plain `.ts` module rather
// than an SFC. `<script setup>` wraps its top-level awaits in Vue's
// `withAsyncContext`, which restores the Nuxt instance afterwards; a plain
// function gets no such wrapper, so `await useSelectedOrg()` HERE would strip
// the instance from every Nuxt composable called after it — `useDirectusItems`,
// `useAsyncData`, all of it — and the page 500s on SSR with "a composable that
// requires access to the Nuxt instance was called outside of a plugin". So the
// caller, which is an SFC and does have the wrapper, awaits the org and hands
// the ref down. For the same reason the `await useAsyncData(...)` below is
// always the LAST instance-dependent call in each function; only plain
// `computed()` follows it.

import {
  collectionMonths,
  ageingBuckets,
  pastDue,
  requestBuckets,
  staleRequests,
  summariseOccupancy,
  type ChargeRow,
  type RequestRowLite,
  type UnitRowLite,
} from "#core/shared/home/glances";

/**
 * Charges — ONE query serving money-in, what is outstanding, and how overdue.
 *
 * The Collections widget used to ask only for paid rows; the rail also needs
 * the unpaid ones, and running a second `payment_requests` query for them is
 * exactly what the plan forbids. So the filter is the union of the two
 * questions — settled-and-paid OR still owing — and both series derive from
 * the one result.
 *
 * The 1000-row cap is a truthfulness limit, not a performance one: past it the
 * glance numbers under-report and the Money surface is authoritative. Sorted
 * newest-first so the truncation, if it ever happens, drops the oldest history
 * rather than this month's facts.
 */
export async function useMoneyGlance(org: MaybeRefOrGetter<string | null | undefined>) {
  const { list } = useDirectusItems("payment_requests");
  const { isEnabled } = useModules();
  const orgId = computed(() => toValue(org) || null);

  const { data, pending } = await useAsyncData(
    `home-money-glance-${orgId.value}`,
    async () => {
      if (!orgId.value || !isEnabled("payments")) return [] as ChargeRow[];
      return (await list({
        fields: [
          "id",
          "status",
          "amount",
          "amount_paid",
          "amount_remaining",
          "due_date",
          "paid_at",
        ],
        filter: {
          organization: { _eq: orgId.value },
          _or: [{ paid_at: { _nnull: true } }, { status: { _nin: ["paid", "canceled"] } }],
        },
        sort: ["-date_created"],
        limit: 1000,
      })) as ChargeRow[];
    },
    { watch: [orgId], server: false, default: () => [] as ChargeRow[] },
  );

  const rows = computed(() => data.value || []);
  const months = computed(() => collectionMonths(rows.value));
  const collected12mo = computed(() => months.value.reduce((s, m) => s + m.collected, 0));
  const ageing = computed(() => ageingBuckets(rows.value));
  const outstanding = computed(() => ageing.value.reduce((s, b) => s + b.value, 0));
  const overdue = computed(() => pastDue(rows.value));

  return {
    pending,
    rows,
    months,
    collected12mo,
    hasCollections: computed(() => collected12mo.value > 0),
    ageing,
    outstanding,
    hasOutstanding: computed(() => outstanding.value > 0),
    pastDueTotal: computed(() => overdue.value.total),
    pastDueCount: computed(() => overdue.value.count),
  };
}

/** The open request queue. Closed rows are filtered server-side — nothing here needs them. */
export async function useRequestsGlance(org: MaybeRefOrGetter<string | null | undefined>) {
  const { list } = useDirectusItems("hoa_requests");
  const { isEnabled } = useModules();
  const orgId = computed(() => toValue(org) || null);

  const { data, pending } = await useAsyncData(
    `dash-requests-health-${orgId.value}`,
    async () => {
      if (!orgId.value || !isEnabled("requests")) return [] as RequestRowLite[];
      return (await list({
        fields: ["id", "status", "date_created"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _nin: ["resolved", "closed"] },
        },
        sort: ["date_created"],
        limit: 500,
      })) as RequestRowLite[];
    },
    { watch: [orgId], server: false, default: () => [] as RequestRowLite[] },
  );

  const rows = computed(() => data.value || []);

  return {
    pending,
    rows,
    buckets: computed(() => requestBuckets(rows.value)),
    open: computed(() => rows.value.length),
    stale: computed(() => staleRequests(rows.value)),
  };
}

/**
 * Units — ONE query serving the Units stat, the occupancy donut and the rail's
 * Homes tile.
 *
 * The two consumers wanted different filters: the dashboard's Units stat counts
 * active AND inactive homes, while the occupancy split is an active-only
 * question. Rather than run the collection twice, this fetches both statuses
 * and `summariseOccupancy` narrows to active — so each number keeps exactly the
 * meaning it had before the extraction.
 */
export async function useUnitsGlance(org: MaybeRefOrGetter<string | null | undefined>) {
  const { list } = useDirectusItems("hoa_units");
  const orgId = computed(() => toValue(org) || null);

  const { data, pending } = await useAsyncData(
    `home-units-glance-${orgId.value}`,
    async () => {
      if (!orgId.value) return [] as UnitRowLite[];
      return (await list({
        fields: ["id", "status", "occupancy"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive"] },
        },
        limit: -1,
      })) as UnitRowLite[];
    },
    { watch: [orgId], server: false, default: () => [] as UnitRowLite[] },
  );

  const rows = computed(() => data.value || []);
  const summary = computed(() => summariseOccupancy(rows.value));

  return {
    pending,
    rows,
    /** Active + inactive — what the dashboard's Units stat has always counted. */
    total: computed(() => rows.value.length),
    occupancy: computed(() => summary.value.counts),
    recorded: computed(() => summary.value.recorded),
    ownerPct: computed(() => summary.value.ownerPct),
  };
}

interface MemberRowLite {
  id?: string;
  member_type?: string | null;
  date_created?: string | null;
}

/** The directory, as the dashboard has always asked for it. */
export async function useMembersGlance(org: MaybeRefOrGetter<string | null | undefined>) {
  const { list } = useDirectusItems("hoa_members");
  const orgId = computed(() => toValue(org) || null);

  const { data, pending } = await useAsyncData(
    `dashboard-members-${orgId.value}`,
    async () => {
      if (!orgId.value) return [] as MemberRowLite[];
      return (await list({
        fields: ["id", "member_type", "date_created"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive"] },
        },
      })) as MemberRowLite[];
    },
    { watch: [orgId], default: () => [] as MemberRowLite[] },
  );

  const rows = computed(() => data.value || []);

  return {
    pending,
    rows,
    total: computed(() => rows.value.length),
    owners: computed(() => rows.value.filter((m) => m.member_type === "owner").length),
    tenants: computed(() => rows.value.filter((m) => m.member_type === "tenant").length),
  };
}

export interface EmailActivityDay {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
}

/**
 * Email activity — the same `/api/email/dashboard-activity` read DashboardPage
 * already performs, under the key it already uses, so the rail's send-rate
 * glance rides that one request rather than adding another.
 */
export async function useEmailActivityGlance(org: MaybeRefOrGetter<string | null | undefined>) {
  const orgId = computed(() => toValue(org) || null);

  const { data, pending } = await useAsyncData(
    `dashboard-email-activity-${orgId.value}`,
    async () => {
      if (!orgId.value) return null;
      try {
        const headers = useRequestHeaders(["cookie"]);
        return (await $fetch("/api/email/dashboard-activity", {
          headers,
          query: { organizationId: orgId.value },
        })) as {
          chartData: EmailActivityDay[];
          stats: Record<string, number>;
        };
      } catch {
        // Non-fatal: the glance self-hides rather than the page erroring.
        return null;
      }
    },
    { watch: [orgId], server: false },
  );

  /** Always seven days, zero-filled, so the sparkline never changes width. */
  const days = computed<EmailActivityDay[]>(() => {
    if (data.value?.chartData?.length) return data.value.chartData;
    const out: EmailActivityDay[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      out.push({ date: d.toISOString().slice(0, 10), sent: 0, delivered: 0, opened: 0 });
    }
    return out;
  });

  return {
    pending,
    data,
    days,
    stats: computed(() => data.value?.stats || null),
    sent7d: computed(() => days.value.reduce((s, d) => s + (d.sent || 0), 0)),
  };
}
