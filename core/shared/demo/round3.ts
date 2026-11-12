/**
 * What the demo orgs show of Earnest parity round 3 — the content and the
 * arithmetic, with no IO. `seedDemos()` (seed.ts) does the writing.
 *
 *   reminders   every rule ON, copy "approved" by the demo admin
 *   email       one recurring newsletter, scheduled for the next first Monday
 *   channels    a community channel + a direct message between two people
 *   ledger      twelve months of paid dues and paid expenses, so Reports has a
 *               year to draw and its PDF has something to show
 *
 * Everything time-relative takes an explicit `now`, so a test can say what the
 * seed would write on any day. Nothing here reads the clock.
 *
 * Imports are relative, not `#core/…`: scripts/seed-demo.ts runs this under tsx,
 * which does not know the Nuxt aliases.
 */
import { CalendarDate, toZoned } from "@internationalized/date";
import {
  REMINDER_RULES,
  type ReminderRule,
  type ReminderRuleSettings,
  type ReminderSettings,
} from "../reminders/settings";

/** The demo communities are in Florida: Eastern, which is also the app's default zone. */
export const DEMO_TIME_ZONE = "America/New_York";

// ── Reminders ───────────────────────────────────────────────────────────────

/** The local hour day-based reminders go out (the app's own default). */
export const DEMO_REMINDER_SEND_HOUR = 9;

/**
 * `organization.settings.reminders` with every rule on. The board approves a
 * rule's copy when it turns the rule on (settings.ts), so each carries who and
 * when — here the demo admin, at the moment of the seed. Stages are left to
 * their defaults (a missing stage is on) and `days` to the rule's own.
 *
 * Built from REMINDER_RULES, so a rule added later is on in the demo without
 * anyone remembering to list it here.
 */
export function demoReminderSettings(approvedBy: string, now: Date): ReminderSettings {
  const rules: Partial<Record<ReminderRule, ReminderRuleSettings>> = {};
  for (const rule of REMINDER_RULES) {
    rules[rule] = { enabled: true, approved_at: now.toISOString(), approved_by: approvedBy };
  }
  return { send_hour: DEMO_REMINDER_SEND_HOUR, rules };
}

// ── The per-community content ───────────────────────────────────────────────

export interface DemoExpenseLine {
  category: "maintenance" | "utilities" | "insurance" | "landscaping" | "admin" | "other";
  title: string;
  vendor: string;
  /** Cycled by month, so the line varies without being random (a seed must be repeatable). */
  amounts: number[];
  /** Paid every month, or only in the calendar months Jan/Apr/Jul/Oct. */
  every: "month" | "quarter";
  /** Day of the month (1–28). */
  day: number;
}

export interface DemoRound3Def {
  /** The community channel — the DM is the second half of "a channel with a DM". */
  channel: { name: string; slug: string; description: string };
  /** Which directory member the demo admin has the direct message with (by the member's directory email). */
  dmPeerEmail: string;
  /**
   * The Directus login made for that member. Not `dmPeerEmail`: the directory keeps its made-up `.demo` addresses, but
   * Directus refuses a user whose email's top-level domain isn't a real one. Demo orgs never deliver mail, and no one
   * holds this account's password.
   */
  dmPeerUserEmail: string;
  email: {
    webSlug: string;
    subject: string;
    greeting: string;
    salutation: string;
    content: string;
  };
  /** Monthly dues per owner. */
  dues: number;
  /** One special assessment, billed to every owner this many months before the current one. */
  assessment: { title: string; amount: number; monthsAgo: number };
  /** One late fee, on the first owner, this many months before the current one. */
  lateFee: { monthsAgo: number; amount: number };
  expenses: DemoExpenseLine[];
  /** What the reserve held when the window opened, so the running balance reads as a real account. */
  openingBalance: number;
}

export const DEMO_ROUND3: Record<"demo" | "demo-classic", DemoRound3Def> = {
  demo: {
    channel: {
      name: "Board Room",
      slug: "board-room",
      description: "Where the board and management keep the building running — decisions, vendors and follow-ups.",
    },
    dmPeerEmail: "ava.bennett@harborviewlofts.demo",
    dmPeerUserEmail: "demo.ava.bennett@hoaconnect.info",
    email: {
      webSlug: "monthly-community-update",
      subject: "Harborview Lofts — your monthly community update",
      greeting: "Hello {{first_name}},",
      salutation: "Warm regards",
      content:
        "<p>Here is what is happening around Harborview this month.</p>" +
        "<ul><li>Pool deck resurfacing continues; the east side reopens on the 15th.</li>" +
        "<li>Garage level 2 EV chargers are being serviced — expect short outages.</li>" +
        "<li>The board meets on the third Thursday; the agenda is posted in Meetings.</li></ul>" +
        "<p>Reply to this email with any question and the board will get back to you.</p>",
    },
    // Near the $250 the billing engine already charges these members here, so Charges and Reports tell one story.
    dues: 250,
    assessment: { title: "Special assessment — pool deck resurfacing", amount: 400, monthsAgo: 5 },
    lateFee: { monthsAgo: 7, amount: 25 },
    expenses: [
      { category: "utilities", title: "Water, power and internet", vendor: "Miami Utility Services", amounts: [285, 290, 310, 330, 345, 340, 305, 295], every: "month", day: 8 },
      { category: "landscaping", title: "Landscaping and pool care", vendor: "Bayside Grounds & Pool", amounts: [175], every: "month", day: 12 },
      { category: "maintenance", title: "Building maintenance", vendor: "Brickell Building Services", amounts: [140, 220, 380, 110, 300, 165], every: "month", day: 18 },
      { category: "admin", title: "Management and accounting", vendor: "Harborview Management Co.", amounts: [60], every: "month", day: 25 },
      { category: "insurance", title: "Master insurance premium", vendor: "Coastal Condo Insurance", amounts: [480], every: "quarter", day: 5 },
    ],
    openingBalance: 6500,
  },
  "demo-classic": {
    channel: {
      name: "Board Room",
      slug: "board-room",
      description: "The board's working room — landmark upkeep, vendors and the month's decisions.",
    },
    dmPeerEmail: "eleanor.ashford@thebeaumont.demo",
    dmPeerUserEmail: "demo.eleanor.ashford@hoaconnect.info",
    email: {
      webSlug: "monthly-community-update",
      subject: "The Beaumont — your monthly community update",
      greeting: "Dear {{first_name}},",
      salutation: "With best wishes",
      content:
        "<p>A note from the board on the month ahead at The Beaumont.</p>" +
        "<ul><li>The façade restoration crew is on the south elevation through the end of the month.</li>" +
        "<li>The wine room inventory check is by appointment with the concierge.</li>" +
        "<li>Annual meeting materials will be posted in Documents two weeks ahead.</li></ul>" +
        "<p>Your concierge is glad to help with anything in between.</p>",
    },
    dues: 1850,
    assessment: { title: "Special assessment — façade restoration reserve", amount: 1200, monthsAgo: 4 },
    lateFee: { monthsAgo: 8, amount: 25 },
    expenses: [
      { category: "utilities", title: "Water, power and internet", vendor: "Miami Beach Utilities", amounts: [1040, 1075, 1130, 1190, 1240, 1210, 1100], every: "month", day: 9 },
      { category: "maintenance", title: "Landmark building upkeep", vendor: "Deco District Restoration", amounts: [1480, 1720, 2260, 1390, 1950], every: "month", day: 17 },
      { category: "landscaping", title: "Terrace and landscaping", vendor: "Ocean Drive Gardens", amounts: [650], every: "month", day: 12 },
      { category: "admin", title: "Management and accounting", vendor: "Beaumont Property Management", amounts: [420], every: "month", day: 25 },
      { category: "other", title: "Valet and security staffing", vendor: "Shoreline Security Group", amounts: [2300], every: "month", day: 3 },
      { category: "insurance", title: "Master insurance premium", vendor: "Atlantic Landmark Insurance", amounts: [4200], every: "quarter", day: 5 },
    ],
    openingBalance: 41000,
  },
};

// ── The recurring email ─────────────────────────────────────────────────────

/** The nth (1–4) given weekday (0 = Sunday) of a month, at `hour` o'clock on `timeZone`'s wall clock. */
function nthWeekdayAt(year: number, month: number, ordinal: number, weekday: number, hour: number, timeZone: string): Date {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (ordinal - 1) * 7;
  return toZoned(new CalendarDate(year, month, day), timeZone).set({ hour }).toDate();
}

/**
 * When the demo's recurring email next goes out: the first Monday of a month at
 * 9:00 on the community's clock, the soonest one that is at least an hour away.
 * `monthly_nth_weekday` on a first Monday repeats it as "the first Monday of every
 * month" (recurrence.ts), so the seed only picks where the series starts.
 */
export function nextRecurringRun(now: Date, timeZone: string = DEMO_TIME_ZONE): Date {
  const floor = now.getTime() + 60 * 60 * 1000;
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;
  // Two months always contain one; the third is a belt against a zone edge.
  for (let i = 0; i < 3; i++) {
    const run = nthWeekdayAt(year, month, 1, 1, 9, timeZone);
    if (run.getTime() >= floor) return run;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return nthWeekdayAt(year, month, 1, 1, 9, timeZone);
}

// ── The ledger ──────────────────────────────────────────────────────────────

/** How many months Reports is given, the current one included. */
export const LEDGER_MONTHS = 12;

/**
 * Stamped in `notes` on every charge and expense the seed writes, and the ONLY
 * thing that makes a row the seed's to replace or delete. A demo org also holds
 * rows the seed did not write — the billing engine's own charges from a schedule,
 * or an expense a visitor typed — and those are never touched.
 */
export const DEMO_SEED_NOTE = "Demo data — reset nightly";

export interface DemoLedgerMember {
  id: string;
  member_type?: string | null;
}

export interface DemoRequestRow {
  organization: string;
  member: string;
  request_type: "monthly_dues" | "assessment" | "late_fee";
  title: string;
  status: "paid";
  amount: number;
  amount_paid: number;
  amount_remaining: 0;
  due_date: string;
  paid_at: string;
  period_start: string;
  period_end: string;
  source: "manual";
  notes: string;
}

export interface DemoExpenseRow {
  organization: string;
  status: "paid";
  category: DemoExpenseLine["category"];
  title: string;
  vendor: string;
  amount: number;
  expense_date: string;
  paid_date: string;
  notes: string;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The months of the window, oldest first, ending on `now`'s (UTC) month. */
export function ledgerMonths(now: Date, count = LEDGER_MONTHS): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  for (let back = count - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

/** The first day of the window — the date the opening balance is struck on. */
export function ledgerWindowStart(now: Date, count = LEDGER_MONTHS): string {
  const first = ledgerMonths(now, count)[0]!;
  return dateOnly(first.year, first.month, 1);
}

/** "member|YYYY-MM": a member's dues for a month, as the set of what is already billed by someone else. */
export function occupiedKey(member: unknown, dueDate: unknown): string {
  const id = typeof member === "object" && member ? (member as { id?: unknown }).id : member;
  return `${id}|${String(dueDate ?? "").slice(0, 7)}`;
}

/**
 * The paid history for one demo community, as the rows to insert. Only OWNERS
 * are billed (a tenant pays their landlord, not the association) and only what
 * has already happened by `now` is included, so a report never shows money
 * from the future. All of it is paid: an unpaid charge would put the demo in
 * front of the late-fee and reminder machinery, and a seed has no business
 * starting that.
 *
 * `members` come in a stable order (the caller sorts them); dues land on days
 * 2–6, staggered by member and month, so the activity feed is not a wall of
 * identical timestamps.
 *
 * `occupied` is what someone else has already billed (see occupiedKey): a month
 * a member's dues exist for — the billing engine's, still overdue — is left to
 * them, so the demo never shows the same member both paid and overdue for it.
 */
export function buildDemoLedger(
  def: DemoRound3Def,
  orgId: string,
  members: DemoLedgerMember[],
  now: Date,
  occupied: ReadonlySet<string> = new Set()
): { requests: DemoRequestRow[]; expenses: DemoExpenseRow[] } {
  const owners = members.filter((m) => m.member_type === "owner");
  const months = ledgerMonths(now);
  const requests: DemoRequestRow[] = [];
  const expenses: DemoExpenseRow[] = [];
  const settled = (iso: string) => new Date(iso).getTime() <= now.getTime();

  months.forEach(({ year, month }, mi) => {
    const monthsBack = months.length - 1 - mi;
    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    const period = { period_start: dateOnly(year, month, 1), period_end: dateOnly(year, month, lastDay(year, month)) };

    owners.forEach((owner, oi) => {
      const base = { organization: orgId, member: owner.id, status: "paid" as const, amount_remaining: 0 as const, source: "manual" as const, notes: DEMO_SEED_NOTE, ...period };

      const paidDay = 2 + ((oi + mi) % 5);
      const duesPaidAt = `${dateOnly(year, month, paidDay)}T15:00:00.000Z`;
      if (settled(duesPaidAt) && !occupied.has(occupiedKey(owner.id, dateOnly(year, month, 1)))) {
        requests.push({
          ...base,
          request_type: "monthly_dues",
          title: `Monthly dues — ${label}`,
          amount: def.dues,
          amount_paid: def.dues,
          due_date: dateOnly(year, month, 1),
          paid_at: duesPaidAt,
        });
      }

      if (monthsBack === def.assessment.monthsAgo) {
        const paidAt = `${dateOnly(year, month, 18 + (oi % 4))}T15:00:00.000Z`;
        if (settled(paidAt)) {
          requests.push({
            ...base,
            request_type: "assessment",
            title: def.assessment.title,
            amount: def.assessment.amount,
            amount_paid: def.assessment.amount,
            due_date: dateOnly(year, month, 15),
            paid_at: paidAt,
          });
        }
      }

      if (oi === 0 && monthsBack === def.lateFee.monthsAgo) {
        const paidAt = `${dateOnly(year, month, 20)}T15:00:00.000Z`;
        if (settled(paidAt)) {
          requests.push({
            ...base,
            request_type: "late_fee",
            title: `Late fee — ${label}`,
            amount: def.lateFee.amount,
            amount_paid: def.lateFee.amount,
            due_date: dateOnly(year, month, 10),
            paid_at: paidAt,
          });
        }
      }
    });

    for (const line of def.expenses) {
      if (line.every === "quarter" && month % 3 !== 1) continue;
      const date = dateOnly(year, month, line.day);
      if (!settled(`${date}T15:00:00.000Z`)) continue;
      expenses.push({
        organization: orgId,
        status: "paid",
        category: line.category,
        title: `${line.title} — ${label}`,
        vendor: line.vendor,
        amount: line.amounts[mi % line.amounts.length]!,
        expense_date: date,
        paid_date: date,
        notes: DEMO_SEED_NOTE,
      });
    }
  });

  return { requests, expenses };
}

// ── Comparing what is there with what would be written ──────────────────────

const money = (v: unknown) => Number(v ?? 0).toFixed(2);
const day = (v: unknown) => String(v ?? "").slice(0, 10);

/** One request's identity for the "is the ledger already right?" check. Directus decimals arrive as strings. */
export function requestKey(r: { member?: unknown; request_type?: unknown; title?: unknown; amount?: unknown; amount_paid?: unknown; paid_at?: unknown; status?: unknown }): string {
  const member = typeof r.member === "object" && r.member ? (r.member as { id?: unknown }).id : r.member;
  return [member, r.request_type, r.title, money(r.amount), money(r.amount_paid), day(r.paid_at), r.status].join("|");
}

/** One expense's identity, same use. */
export function expenseKey(e: { category?: unknown; title?: unknown; vendor?: unknown; amount?: unknown; expense_date?: unknown; status?: unknown }): string {
  return [e.category, e.title, e.vendor, money(e.amount), day(e.expense_date), e.status].join("|");
}

/** Do two lists hold the same rows, in any order and counting duplicates? */
export function sameRows(have: string[], want: string[]): boolean {
  if (have.length !== want.length) return false;
  const counts = new Map<string, number>();
  for (const k of want) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const k of have) {
    const n = counts.get(k);
    if (!n) return false;
    counts.set(k, n - 1);
  }
  return true;
}
