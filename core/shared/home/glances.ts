// The arithmetic behind the home's glance rail and chart rail.
//
// Pure on purpose. Phase 7's rails are the SECOND surface to ask these
// questions — the dashboard's Collections / Requests-health / Occupancy widgets
// asked them first, each inside its own component — and the plan's rule for the
// rails is explicit: extract, never write a second set of queries against the
// same collections. So the fetch moved up into `useHomeGlances` and the
// arithmetic moved here, where a widget, a rail tile and a test can all call it
// without a Directus round trip between them.
//
// MONEY IS A STRING HERE. Directus returns decimals as strings ("600.75"), so
// every amount goes through num() before arithmetic — `+` on two of those
// concatenates and the surface silently reports $0.00. That has bitten this
// codebase before.

export interface ChargeRow {
  id?: string;
  status?: string | null;
  amount?: number | string | null;
  amount_paid?: number | string | null;
  amount_remaining?: number | string | null;
  due_date?: string | null;
  paid_at?: string | null;
}

export interface RequestRowLite {
  id?: string;
  status?: string | null;
  date_created?: string | null;
}

export interface UnitRowLite {
  id?: string;
  status?: string | null;
  occupancy?: string | null;
}

export const MS_DAY = 86_400_000;

export function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

export const money = (v: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

/** Compact money for a tile that is 74px wide: $12k, not $12,400. */
export const moneyShort = (v: number): string =>
  Math.abs(v) >= 10_000
    ? `$${Math.round(v / 1000).toLocaleString()}k`
    : money(v);

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ── Money in, by month ───────────────────────────────────────────────────────

export interface MonthPoint {
  label: string;
  collected: number;
  /** The chart kit indexes a row by series key; this is what lets it. */
  [key: string]: string | number;
}

export function collectionMonths(
  charges: ChargeRow[],
  monthsBack = 12,
  now: Date = new Date(),
): MonthPoint[] {
  const byKey = new Map<string, MonthPoint>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    byKey.set(monthKey(d), {
      label: d.toLocaleDateString("en-US", { month: "short" }),
      collected: 0,
    });
  }
  for (const c of charges || []) {
    if (!c.paid_at) continue;
    const d = new Date(c.paid_at);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(monthKey(d));
    if (bucket) bucket.collected += num(c.amount_paid);
  }
  return [...byKey.values()];
}

// ── What is still owed, and for how long ─────────────────────────────────────

/**
 * `amount_remaining` is authoritative when set; a partially paid charge that
 * fell back to `amount` would overstate the debt by whatever was already paid.
 */
export function owed(c: ChargeRow): number {
  const remaining = num(c.amount_remaining);
  if (remaining > 0) return remaining;
  return Math.max(0, num(c.amount) - num(c.amount_paid));
}

const SETTLED = new Set(["paid", "canceled"]);

export function outstandingCharges(charges: ChargeRow[]): ChargeRow[] {
  return (charges || []).filter((c) => !SETTLED.has(String(c.status)) && owed(c) > 0);
}

export function daysOverdue(c: ChargeRow, now = Date.now()): number {
  if (!c.due_date) return 0;
  const t = new Date(c.due_date).getTime();
  if (!Number.isFinite(t)) return 0;
  return (now - t) / MS_DAY;
}

export interface AgeBucket {
  label: string;
  /** Short form for a narrow rail label. */
  short: string;
  value: number;
  /** Status token, not a categorical hue: red here means overdue. */
  color: string;
  [key: string]: string | number;
}

const AGE_BANDS = [
  { label: "Not yet due", short: "Current", min: -Infinity, max: 0, color: "var(--theme-text-muted)" },
  { label: "1–30 days", short: "1–30d", min: 0, max: 30, color: "var(--chart-3)" },
  { label: "31–60 days", short: "31–60d", min: 30, max: 60, color: "var(--warning)" },
  { label: "61–90 days", short: "61–90d", min: 60, max: 90, color: "color-mix(in srgb, var(--destructive) 55%, var(--warning))" },
  { label: "90 days +", short: "90d +", min: 90, max: Infinity, color: "var(--destructive)" },
] as const;

export function ageingBuckets(charges: ChargeRow[], now = Date.now()): AgeBucket[] {
  const rows = outstandingCharges(charges);
  return AGE_BANDS.map((b) => ({
    label: b.label,
    short: b.short,
    color: b.color,
    value: rows
      .filter((c) => {
        const d = daysOverdue(c, now);
        return d > b.min && d <= b.max;
      })
      .reduce((sum, c) => sum + owed(c), 0),
  }));
}

export function pastDue(charges: ChargeRow[], now = Date.now()): { total: number; count: number } {
  const rows = outstandingCharges(charges).filter((c) => daysOverdue(c, now) > 0);
  return { total: rows.reduce((s, c) => s + owed(c), 0), count: rows.length };
}

// ── The open queue, by age ───────────────────────────────────────────────────

export interface RequestBucket {
  label: string;
  short: string;
  count: number;
  color: string;
  [key: string]: string | number;
}

const REQUEST_BANDS = [
  { label: "< 7 days", short: "< 7d", min: 0, max: 7, color: "var(--chart-1)" },
  { label: "7–30 days", short: "7–30d", min: 7, max: 30, color: "var(--chart-3)" },
  { label: "30–90 days", short: "30–90d", min: 30, max: 90, color: "var(--warning)" },
  { label: "90 days +", short: "90d +", min: 90, max: Infinity, color: "var(--destructive)" },
] as const;

export function requestAgeDays(r: RequestRowLite, now = Date.now()): number {
  const t = r.date_created ? new Date(r.date_created).getTime() : NaN;
  return Number.isFinite(t) ? (now - t) / MS_DAY : 0;
}

export function requestBuckets(rows: RequestRowLite[], now = Date.now()): RequestBucket[] {
  return REQUEST_BANDS.map((b) => ({
    label: b.label,
    short: b.short,
    color: b.color,
    count: (rows || []).filter((r) => {
      const d = requestAgeDays(r, now);
      return d >= b.min && d < b.max;
    }).length,
  }));
}

export function staleRequests(rows: RequestRowLite[], now = Date.now()): number {
  return (rows || []).filter((r) => requestAgeDays(r, now) >= 30).length;
}

// ── Who lives in the homes ───────────────────────────────────────────────────

export interface OccupancySummary {
  /** Count per occupancy value, over ACTIVE units only. */
  counts: Record<string, number>;
  /** Units with a recorded occupancy — the donut's denominator. */
  recorded: number;
  /** Owner-occupied share of the recorded ones, or null when nothing is recorded. */
  ownerPct: number | null;
}

export function summariseOccupancy(units: UnitRowLite[]): OccupancySummary {
  const counts = (units || [])
    .filter((u) => (u.status || "active") === "active")
    .reduce<Record<string, number>>((acc, u) => {
      const k = u.occupancy || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  const recorded = (counts.owner || 0) + (counts.tenant || 0) + (counts.vacant || 0);
  return {
    counts,
    recorded,
    // Occupancy is null until somebody records it, and an "unknown: 28" donut is
    // worse than no donut — null is what tells the surface to say so instead.
    ownerPct: recorded ? Math.round(((counts.owner || 0) / recorded) * 100) : null,
  };
}
