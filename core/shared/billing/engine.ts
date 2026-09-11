/**
 * Billing engine — pure. No Directus, no clock, no Stripe.
 *
 * Three questions the worker (scripts/billing-worker.ts) asks every run:
 *   chargesDueForPeriod  which dues charges does a schedule owe as of today?
 *   lateFeesToApply      which overdue charges earn a late fee today?
 *   autopayRunsFor       which members get charged today, for what?
 *
 * Dates are ISO `YYYY-MM-DD` strings and all arithmetic is on their parts, so
 * the answer does not depend on the process timezone. Money is rounded to
 * cents through integer arithmetic.
 *
 * Idempotency: every draft carries a `key`. The worker inserts a draft only
 * when no charge with that key exists; `existingKeys` lets a dry-run show
 * that the second pass emits nothing.
 */

// ---------------------------------------------------------------------------
// Input shapes. Narrower than the Directus types so the worker can pass plain
// rows and tests can pass literals.
// ---------------------------------------------------------------------------

export type Cadence = "monthly" | "quarterly" | "semiannual" | "annual";
export type AmountSource = "fixed" | "per_unit_rate" | "ownership_pct";

export interface ScheduleLike {
  id: string;
  title: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "annually";
  cadence?: Cadence | null;
  amount_source?: AmountSource | null;
  audience?: Record<string, any> | null;
  generate_days_ahead?: number | null;
  start_date: string;
  end_date?: string | null;
  last_generated_period?: string | null;
  status?: "active" | "paused" | "completed" | "canceled" | null;
}

/** One `hoa_member_units` row, flattened to ids. */
export interface BillableLink {
  member: string;
  unit: string;
  start_date?: string | null;
  end_date?: string | null;
  ownership_percentage?: number | null;
  is_primary_unit?: boolean | null;
  /** null falls back to owner, matching residencyFor(). */
  member_type?: "owner" | "tenant" | null;
  /**
   * Multiplier for `per_unit_rate` schedules (the unit's share, square
   * footage, or whatever the org rates by). The worker fills it from the unit;
   * missing means 1.
   */
  unit_rate?: number | null;
}

export interface Period {
  /** `YYYY-MM` of the period start. Doubles as `last_generated_period`. */
  key: string;
  start: string;
  end: string;
  due: string;
}

export interface ChargeDraft {
  key: string;
  schedule: string;
  unit: string;
  member: string;
  period: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: number;
  prorated: boolean;
  title: string;
  request_type: "monthly_dues";
  source: "schedule";
  source_id: string;
}

export interface ChargesOpts {
  /** Keys of charges that already exist; drafts with these keys are dropped. */
  existingKeys?: Set<string> | Iterable<string>;
}

export interface ChargeLike {
  id: string;
  member: string;
  unit?: string | null;
  request_type: "monthly_dues" | "assessment" | "late_fee" | "other";
  status?: "draft" | "active" | "paid" | "partially_paid" | "overdue" | "canceled" | null;
  amount?: number | null;
  amount_remaining?: number | null;
  due_date?: string | null;
  source?: "schedule" | "manual" | "late_fee" | "plan" | null;
  source_id?: string | null;
  period_start?: string | null;
}

export interface LateFeePolicy {
  enabled: boolean;
  /** Flat dollars, or a percentage of the remaining balance. */
  amount: number;
  kind?: "flat" | "percent" | null;
  repeat?: "once" | "monthly" | null;
  /** Max total late fees per charge; null = uncapped. */
  cap?: number | null;
  grace_days?: number | null;
}

export interface LateFeeDraft {
  key: string;
  charge: string;
  member: string;
  unit: string | null;
  amount: number;
  /** `once`, or `YYYY-MM` of the month the fee belongs to. */
  period: string;
  due_date: string;
  title: string;
  request_type: "late_fee";
  source: "late_fee";
  source_id: string;
}

export interface MethodLike {
  id: string;
  member: string;
  is_autopay?: boolean | null;
  autopay_day?: number | null;
  status?: "active" | "disabled" | null;
}

export interface AutopayRun {
  member: string;
  method: string;
  /** Charge ids, oldest due first. */
  charges: string[];
  total: number;
}

// ---------------------------------------------------------------------------
// Date helpers (ISO string parts only).
// ---------------------------------------------------------------------------

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: string): Ymd {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISO({ y, m, d }: Ymd): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function firstOfMonth(iso: string): Ymd {
  const { y, m } = parse(iso);
  return { y, m, d: 1 };
}

function addMonths({ y, m, d }: Ymd, n: number): Ymd {
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

/** Days since the Unix epoch; the only place a Date is built from parts. */
function dayNumber(iso: string): number {
  const { y, m, d } = parse(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function addDays(iso: string, n: number): string {
  const t = (dayNumber(iso) + n) * 86_400_000;
  const dt = new Date(t);
  return toISO({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

function monthKey(iso: string): string {
  const { y, m } = parse(iso);
  return `${y}-${pad(m)}`;
}

function cents(n: number): number {
  return Math.round(n * 100);
}

function fromCents(c: number): number {
  return c / 100;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

const CADENCE_MONTHS: Record<Cadence, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const LEGACY_CADENCE: Record<ScheduleLike["frequency"], Cadence> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annual",
};

export function cadenceOf(s: Pick<ScheduleLike, "cadence" | "frequency">): Cadence {
  return s.cadence ?? LEGACY_CADENCE[s.frequency] ?? "monthly";
}

/**
 * Every period of the schedule whose due date is within `generate_days_ahead`
 * of `asOf`, after `last_generated_period`, and not past `end_date`.
 * Periods are whole calendar months anchored on the month of `start_date`;
 * dues are due on the period's first day.
 */
export function periodsFor(s: ScheduleLike, asOf: string): Period[] {
  const step = CADENCE_MONTHS[cadenceOf(s)];
  const ahead = Math.max(0, Math.floor(s.generate_days_ahead ?? 14));
  const horizon = addDays(asOf.slice(0, 10), ahead);
  const floor = s.last_generated_period ?? "";
  const out: Period[] = [];
  let start = firstOfMonth(s.start_date);
  // Bound the walk: a schedule cannot owe more than a few thousand periods.
  for (let i = 0; i < 5000; i++) {
    const startISO = toISO(start);
    if (startISO > horizon) break;
    if (s.end_date && startISO > s.end_date.slice(0, 10)) break;
    const next = addMonths(start, step);
    const key = monthKey(startISO);
    if (key > floor) {
      out.push({ key, start: startISO, end: addDays(toISO(next), -1), due: startISO });
    }
    start = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

export function chargeKey(schedule: string, unit: string, period: string, member?: string | null): string {
  return member ? `${schedule}:${unit}:${period}:${member}` : `${schedule}:${unit}:${period}`;
}

function isOwner(l: BillableLink): boolean {
  return (l.member_type ?? "owner") === "owner";
}

/** The link overlaps the period (starts on or before its end, ends on or after its start). */
function activeIn(l: BillableLink, p: Period): boolean {
  const start = l.start_date?.slice(0, 10);
  const end = l.end_date?.slice(0, 10);
  if (start && start > p.end) return false;
  if (end && end < p.start) return false;
  return true;
}

function inAudience(l: BillableLink, audience: ScheduleLike["audience"]): boolean {
  if (!audience || audience.all) return true;
  if (Array.isArray(audience.units)) return audience.units.includes(l.unit);
  return true;
}

/** Fraction of the period the link covers, when it starts inside it. */
function prorationFor(l: BillableLink, p: Period): { fraction: number; prorated: boolean } {
  const start = l.start_date?.slice(0, 10);
  if (!start || start <= p.start) return { fraction: 1, prorated: false };
  const total = dayNumber(p.end) - dayNumber(p.start) + 1;
  const covered = dayNumber(p.end) - dayNumber(start) + 1;
  return { fraction: covered / total, prorated: true };
}

/** Under fixed / per_unit_rate the unit's primary-unit owner pays; else the earliest owner. */
function responsibleLink(links: BillableLink[]): BillableLink {
  return [...links].sort((a, b) => {
    const pa = a.is_primary_unit ? 0 : 1;
    const pb = b.is_primary_unit ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const sa = a.start_date ?? "";
    const sb = b.start_date ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.member < b.member ? -1 : a.member > b.member ? 1 : 0;
  })[0];
}

/**
 * Split `totalCents` across links by ownership percentage. Equal shares when
 * any percentage is missing. Rounding remainder goes to the first link so the
 * shares always sum to the total.
 */
function splitCents(totalCents: number, links: BillableLink[]): number[] {
  const allKnown = links.every((l) => typeof l.ownership_percentage === "number" && l.ownership_percentage > 0);
  const weights = allKnown ? links.map((l) => l.ownership_percentage as number) : links.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((totalCents * w) / sum));
  const remainder = totalCents - shares.reduce((a, b) => a + b, 0);
  shares[0] += remainder;
  return shares;
}

export function chargesDueForPeriod(
  schedule: ScheduleLike,
  links: BillableLink[],
  asOf: string,
  opts: ChargesOpts = {},
): ChargeDraft[] {
  if (schedule.status && schedule.status !== "active") return [];
  const existing = opts.existingKeys instanceof Set ? opts.existingKeys : new Set(opts.existingKeys ?? []);
  const source = schedule.amount_source ?? "fixed";
  const baseCents = cents(Number(schedule.amount) || 0);
  const out: ChargeDraft[] = [];

  const byUnit = new Map<string, BillableLink[]>();
  for (const l of links) {
    if (!isOwner(l) || !inAudience(l, schedule.audience)) continue;
    const list = byUnit.get(l.unit) ?? [];
    list.push(l);
    byUnit.set(l.unit, list);
  }

  for (const p of periodsFor(schedule, asOf)) {
    const title = `${schedule.title} — ${p.key}`;
    const draft = (l: BillableLink, amountCents: number, member?: string): ChargeDraft | null => {
      const key = chargeKey(schedule.id, l.unit, p.key, member);
      if (existing.has(key)) return null;
      const { fraction, prorated } = prorationFor(l, p);
      return {
        key,
        schedule: schedule.id,
        unit: l.unit,
        member: l.member,
        period: p.key,
        period_start: p.start,
        period_end: p.end,
        due_date: p.due,
        amount: fromCents(Math.round(amountCents * fraction)),
        prorated,
        title,
        request_type: "monthly_dues",
        source: "schedule",
        source_id: schedule.id,
      };
    };

    for (const [, unitLinks] of byUnit) {
      const active = unitLinks.filter((l) => activeIn(l, p));
      if (active.length === 0) continue;

      if (source === "ownership_pct") {
        const shares = splitCents(baseCents, active);
        active.forEach((l, i) => {
          const d = draft(l, shares[i], l.member);
          if (d) out.push(d);
        });
        continue;
      }

      const l = responsibleLink(active);
      const rate = source === "per_unit_rate" ? Number(l.unit_rate ?? 1) : 1;
      const d = draft(l, Math.round(baseCents * rate));
      if (d) out.push(d);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Late fees
// ---------------------------------------------------------------------------

const OPEN_STATUSES = new Set(["active", "partially_paid", "overdue"]);

function isOpen(c: ChargeLike): boolean {
  return OPEN_STATUSES.has(c.status ?? "") && Number(c.amount_remaining ?? 0) > 0;
}

/**
 * `charges` must include every non-canceled charge for the org, paid late fees
 * included: a fee already applied for a period is how duplicates are avoided.
 */
export function lateFeesToApply(charges: ChargeLike[], policy: LateFeePolicy, asOf: string): LateFeeDraft[] {
  if (!policy.enabled || !(Number(policy.amount) > 0)) return [];
  const today = asOf.slice(0, 10);
  const grace = Math.max(0, Math.floor(policy.grace_days ?? 0));
  const repeat = policy.repeat ?? "once";
  const period = repeat === "monthly" ? monthKey(today) : "once";
  const capCents = typeof policy.cap === "number" && policy.cap > 0 ? cents(policy.cap) : null;

  // Existing fees per original charge: total applied, and the periods fed.
  const feeTotals = new Map<string, number>();
  const feePeriods = new Map<string, Set<string>>();
  for (const c of charges) {
    if (c.request_type !== "late_fee" || !c.source_id || c.status === "canceled") continue;
    feeTotals.set(c.source_id, (feeTotals.get(c.source_id) ?? 0) + cents(Number(c.amount ?? 0)));
    const fed = feePeriods.get(c.source_id) ?? new Set<string>();
    fed.add("once");
    if (c.period_start) fed.add(monthKey(c.period_start));
    feePeriods.set(c.source_id, fed);
  }

  const out: LateFeeDraft[] = [];
  for (const c of charges) {
    if (c.request_type === "late_fee" || !isOpen(c) || !c.due_date) continue;
    const late = addDays(c.due_date.slice(0, 10), grace) < today;
    if (!late) continue;
    if (feePeriods.get(c.id)?.has(period)) continue;

    const remaining = cents(Number(c.amount_remaining ?? 0));
    let feeCents =
      (policy.kind ?? "flat") === "percent" ? Math.round((remaining * policy.amount) / 100) : cents(policy.amount);
    if (capCents !== null) feeCents = Math.min(feeCents, capCents - (feeTotals.get(c.id) ?? 0));
    if (feeCents <= 0) continue;

    out.push({
      key: `late_fee:${c.id}:${period}`,
      charge: c.id,
      member: c.member,
      unit: c.unit ?? null,
      amount: fromCents(feeCents),
      period,
      due_date: today,
      title: `Late fee — ${period === "once" ? `due ${c.due_date.slice(0, 10)}` : period}`,
      request_type: "late_fee",
      source: "late_fee",
      source_id: c.id,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Autopay
// ---------------------------------------------------------------------------

/**
 * Runs for `asOf`. A method's `autopay_day` is clamped to the month's last
 * day, so day 30 runs on Feb 28. Every open charge is included, oldest due
 * first: a generated charge is a bill, regardless of its due date.
 * `alreadyCharged` holds member ids with an autopay attempt today; the worker
 * knows that, the engine does not.
 */
export function autopayRunsFor(
  asOf: string,
  methods: MethodLike[],
  openCharges: ChargeLike[],
  alreadyCharged: Iterable<string> = [],
): AutopayRun[] {
  const today = parse(asOf.slice(0, 10));
  const lastDay = daysInMonth(today.y, today.m);
  const skip = new Set(alreadyCharged);

  const chosen = new Map<string, MethodLike>();
  for (const m of methods) {
    if (!m.is_autopay || (m.status ?? "active") !== "active" || skip.has(m.member)) continue;
    const day = Math.min(Math.max(1, Math.floor(m.autopay_day ?? 0)), lastDay);
    if (day !== today.d) continue;
    if (!chosen.has(m.member)) chosen.set(m.member, m);
  }
  if (chosen.size === 0) return [];

  const byMember = new Map<string, ChargeLike[]>();
  for (const c of openCharges) {
    if (!isOpen(c) || !chosen.has(c.member)) continue;
    const list = byMember.get(c.member) ?? [];
    list.push(c);
    byMember.set(c.member, list);
  }

  const out: AutopayRun[] = [];
  for (const [member, m] of chosen) {
    const list = (byMember.get(member) ?? []).sort((a, b) => {
      const da = a.due_date ?? "";
      const db = b.due_date ?? "";
      return da < db ? -1 : da > db ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const totalCents = list.reduce((s, c) => s + cents(Number(c.amount_remaining ?? 0)), 0);
    if (totalCents <= 0) continue;
    out.push({ member, method: m.id, charges: list.map((c) => c.id), total: fromCents(totalCents) });
  }
  return out;
}
