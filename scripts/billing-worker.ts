/**
 * Standalone billing WORKER — runs on the scheduled GitHub Actions workflow
 * (.github/workflows/billing-worker.yml), NOT in the Vercel app. Talks directly
 * to Directus (admin token), Stripe (test key unless BILLING_STRIPE_MODE=live)
 * and SendGrid (REST), and reuses the pure billing engine + the branded email
 * render, so a dues reminder looks like every other HOA Connect email.
 *
 * One run, per organization, in this order (see docs/billing-cron.md):
 *   1. generate   active schedules → engine → insert charges whose key is new,
 *                 then schedule.last_generated_period = newest period emitted
 *   2. late fees  every non-canceled charge → engine → insert late-fee charges;
 *                 open charges past the grace period are flipped to `overdue`
 *   3. autopay    members whose saved method's autopay_day is today → one
 *                 PaymentIntent (off_session, confirm) on the org's CONNECTED
 *                 account for every open charge, metadata.charge_ids oldest due
 *                 first; the webhook splits the payment across those charges
 *   4. reminders  due in 7 days / due today / past grace → email + push, each
 *                 stage once per charge, one message per member per run
 *   5. ledger     one `billing_run` entry per org when anything happened
 *
 * Idempotent by construction: charges carry an engine key, late fees are
 * detected from the fees already applied, autopay skips members attempted
 * today, reminders record the stage they sent in payment_requests.metadata.
 *
 *   pnpm billing:worker -- --dry-run                 # report, write nothing
 *   pnpm billing:worker -- --dry-run --org <slug>    # one org
 *   pnpm billing:worker                              # generate + fees + reminders
 *   pnpm billing:worker -- --autopay                 # ...and charge saved methods
 *   pnpm billing:worker -- --autopay --autopay-member <member id>
 *   pnpm billing:worker -- --as-of 2026-10-01        # pretend it is that day
 *
 * Autopay moves money and is OFF unless --autopay is passed. --autopay-member
 * narrows it to one member; use it the first time against a test card.
 *
 * Env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, STRIPE_SECRET_KEY_TEST (or _LIVE
 *      with BILLING_STRIPE_MODE=live), STRIPE_CONNECT_FEE_PERCENT (default 2),
 *      SENDGRID_API_KEY, FROM_EMAIL, FROM_NAME, APP_URL, BILLING_TZ (default
 *      America/New_York), NUXT_PUBLIC_VAPID_PUBLIC_KEY, NUXT_VAPID_PRIVATE_KEY,
 *      NUXT_VAPID_SUBJECT, DEMO_ALLOW_EMAIL.
 */

import { createDirectus, rest, staticToken, readItems, createItem, updateItem, readUsers, deleteItem } from "@directus/sdk";
import Stripe from "stripe";
import webpush from "web-push";
// Reused app modules — imported by RELATIVE path (the `#core` alias is Nuxt-only).
import {
  chargesDueForPeriod,
  chargeKey,
  lateFeesToApply,
  autopayRunsFor,
  type ScheduleLike,
  type BillableLink,
  type ChargeLike,
  type ChargeDraft,
  type LateFeeDraft,
  type MethodLike,
} from "../core/shared/billing/engine";
import { buildBillingRunEntry } from "../core/shared/ledger/entries";
import { bellAllowed, emailMasterOn } from "../core/shared/notifications/preferences";
import { resolveEmailBranding } from "../core/server/utils/email-branding";
import { buildEmailHtml, buildEmailText } from "../core/server/utils/email-templates-mjml";
import { resolveSender } from "../core/server/utils/sendgrid";
import { essentialEmailAllowed } from "../core/shared/email/email-class";
import { resolveReminderSettings } from "../core/shared/reminders/settings";
import { runWithHeartbeat } from "./lib/job-heartbeat";

// ── Config ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

// Unknown arguments abort. A mistyped or unsplit flag ("--dry-run --org x" as
// one token) must not quietly turn a rehearsal into a live run.
{
  const FLAGS = new Set(["--dry-run", "--autopay"]);
  const OPTS = new Set(["--autopay-member", "--org", "--as-of"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (FLAGS.has(a)) continue;
    if (OPTS.has(a) && argv[i + 1] && !argv[i + 1]!.startsWith("--")) { i++; continue; }
    console.error(`❌ Unrecognised argument "${a}". Known: ${[...FLAGS, ...OPTS].join(" ")}`);
    process.exit(1);
  }
}

const DRY_RUN = flag("--dry-run");
const AUTOPAY = flag("--autopay");
const AUTOPAY_MEMBER = opt("--autopay-member") || null;
const ONLY_ORG = opt("--org") || null;
const TZ = process.env.BILLING_TZ || "America/New_York";
const AS_OF = opt("--as-of") || localDate(TZ, new Date());

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const STRIPE_LIVE = (process.env.BILLING_STRIPE_MODE || "").toLowerCase() === "live";
const STRIPE_SECRET_KEY = STRIPE_LIVE ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
const FEE_PERCENT = parseFloat(process.env.STRIPE_CONNECT_FEE_PERCENT || "2") || 0;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@hoaconnect.info";
const FROM_NAME = process.env.FROM_NAME || "HOA Connect";
const APP_URL = process.env.APP_URL || "";
const DEMO_ALLOW_EMAIL = ["1", "true", "yes"].includes((process.env.DEMO_ALLOW_EMAIL || "").toLowerCase());
const VAPID_PUBLIC = process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.NUXT_VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.NUXT_VAPID_SUBJECT || "mailto:support@hoaconnect.info";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(AS_OF)) {
  console.error(`❌ --as-of must be YYYY-MM-DD, got ${AS_OF}`);
  process.exit(1);
}
if (AUTOPAY && !DRY_RUN && !STRIPE_SECRET_KEY) {
  console.error("❌ --autopay needs STRIPE_SECRET_KEY_TEST (or _LIVE with BILLING_STRIPE_MODE=live)");
  process.exit(1);
}
if (!DRY_RUN && !SENDGRID_API_KEY) {
  console.warn("⚠️  SENDGRID_API_KEY not set — reminder emails will be skipped");
}

const directus = createDirectus(DIRECTUS_URL).with(staticToken(DIRECTUS_STATIC_TOKEN)).with(rest());
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as unknown as Stripe.LatestApiVersion, typescript: true })
  : null;
const PUSH_ENABLED = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Small helpers ───────────────────────────────────────────────────────────

function localDate(tz: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** ISO date ± days, on UTC parts so the process timezone cannot shift it. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const id = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));
const money = (n: number) => `$${n.toFixed(2)}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDate = (d?: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const items = (collection: string, query: Record<string, any>): Promise<any[]> =>
  directus.request(readItems(collection as any, { limit: -1, ...query } as any)) as Promise<any[]>;

async function insert(collection: string, data: Record<string, any>): Promise<{ id: string } | null> {
  if (DRY_RUN) return null;
  return (await directus.request(createItem(collection as any, data as any))) as { id: string };
}

async function patch(collection: string, rowId: string, data: Record<string, any>): Promise<void> {
  if (DRY_RUN) return;
  await directus.request(updateItem(collection as any, rowId, data as any));
}

// ── Types for the rows we read ──────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string | null;
  slug: string;
  is_demo?: boolean | null;
  settings?: any;
  late_fee_enabled?: boolean | null;
  late_fee_amount?: number | null;
  late_fee_kind?: "flat" | "percent" | null;
  late_fee_repeat?: "once" | "monthly" | null;
  late_fee_cap?: number | null;
  payment_grace_period_days?: number | null;
  stripe_connect_account_id?: string | null;
  connect_charges_enabled?: boolean | null;
}

interface ChargeRow extends ChargeLike {
  title?: string | null;
  metadata?: any;
  reminder_sent?: boolean | null;
}

interface MemberRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  user?: string | null;
  /** Phase 3a's flag: a hard-bounced address gets no reminder. */
  email_bounced?: boolean | null;
}

interface RunCounts {
  charges: number;
  chargesAmount: number;
  lateFees: number;
  lateFeesAmount: number;
  autopayAttempted: number;
  autopaySucceeded: number;
  autopayAmount: number;
  reminders: number;
}

// ── 1. Generate ─────────────────────────────────────────────────────────────

/**
 * Links for a schedule: the org's hoa_member_units rows, narrowed by the
 * schedule's audience ({ all: true } or { units: [ids] }) and, for a legacy
 * per-member schedule, by its `member`.
 *
 * `unit_rate` for per_unit_rate schedules: hoa_units carries no rate field
 * yet, so every unit rates 1 (the schedule amount, per unit). Adding a unit
 * field is a schema change; the worker will read it from here once it exists.
 */
function linksFor(schedule: any, links: BillableLink[]): BillableLink[] {
  const audience = schedule.audience && typeof schedule.audience === "object" ? schedule.audience : null;
  const units: string[] | null = Array.isArray(audience?.units) ? audience.units.map(String) : null;
  const member = id(schedule.member);
  return links.filter((l) => (!units || units.includes(l.unit)) && (!member || l.member === member));
}

function existingKeysFor(charges: ChargeRow[], schedulesById: Map<string, any>): Set<string> {
  const keys = new Set<string>();
  for (const c of charges) {
    if (c.source !== "schedule" || !c.source_id || !c.unit || !c.period_start) continue;
    const split = schedulesById.get(c.source_id)?.amount_source === "ownership_pct";
    keys.add(chargeKey(c.source_id, id(c.unit)!, c.period_start.slice(0, 7), split ? c.member : null));
  }
  return keys;
}

async function generate(org: OrgRow, schedules: any[], links: BillableLink[], charges: ChargeRow[], counts: RunCounts): Promise<ChargeRow[]> {
  const schedulesById = new Map(schedules.map((s) => [s.id, s]));
  const existingKeys = existingKeysFor(charges, schedulesById);
  const inserted: ChargeRow[] = [];

  for (const s of schedules) {
    if (s.status !== "active") continue;
    const schedule: ScheduleLike = { ...s, amount: Number(s.amount) };
    const drafts: ChargeDraft[] = chargesDueForPeriod(schedule, linksFor(s, links), AS_OF, { existingKeys });
    if (!drafts.length) continue;

    let newest = s.last_generated_period ?? "";
    for (const d of drafts) {
      const row = {
        status: "active",
        organization: org.id,
        member: d.member,
        unit: d.unit,
        request_type: d.request_type,
        title: d.title,
        description: d.prorated ? `Prorated for a partial period (${d.period_start} – ${d.period_end}).` : null,
        amount: d.amount,
        due_date: d.due_date,
        amount_paid: 0,
        amount_remaining: d.amount,
        period_start: d.period_start,
        period_end: d.period_end,
        source: d.source,
        source_id: d.source_id,
      };
      const created = await insert("payment_requests", row);
      inserted.push({ ...(row as any), id: created?.id ?? `dry:${d.key}` });
      existingKeys.add(d.key);
      counts.charges++;
      counts.chargesAmount += d.amount;
      if (d.period > newest) newest = d.period;
      console.log(`   ${DRY_RUN ? "would insert" : "inserted"} ${d.title} · unit ${d.unit} · member ${d.member} · ${money(d.amount)} due ${d.due_date}${d.prorated ? " (prorated)" : ""}`);
    }

    await patch("payment_schedules", s.id, {
      last_generated_period: newest,
      total_payments_generated: Number(s.total_payments_generated ?? 0) + drafts.length,
      last_payment_gnerated_at: new Date().toISOString(),
    });
    console.log(`   schedule "${s.title}" → last_generated_period ${newest}`);
  }
  return inserted;
}

// ── 2. Late fees ────────────────────────────────────────────────────────────

async function applyLateFees(org: OrgRow, charges: ChargeRow[], counts: RunCounts): Promise<ChargeRow[]> {
  const policy = {
    enabled: !!org.late_fee_enabled,
    amount: Number(org.late_fee_amount ?? 0),
    kind: org.late_fee_kind ?? "flat",
    repeat: org.late_fee_repeat ?? "once",
    cap: org.late_fee_cap ?? null,
    grace_days: org.payment_grace_period_days ?? 0,
  };
  const drafts: LateFeeDraft[] = lateFeesToApply(charges, policy, AS_OF);
  const inserted: ChargeRow[] = [];

  for (const d of drafts) {
    const row = {
      status: "active",
      organization: org.id,
      member: d.member,
      unit: d.unit,
      request_type: d.request_type,
      title: d.title,
      amount: d.amount,
      due_date: d.due_date,
      amount_paid: 0,
      amount_remaining: d.amount,
      // `once` fees carry no period; monthly ones carry the month they belong
      // to, which is how the engine sees them next month.
      period_start: d.period === "once" ? null : `${d.period}-01`,
      period_end: null,
      source: d.source,
      source_id: d.source_id,
    };
    const created = await insert("payment_requests", row);
    inserted.push({ ...(row as any), id: created?.id ?? `dry:${d.key}` });
    counts.lateFees++;
    counts.lateFeesAmount += d.amount;
    console.log(`   ${DRY_RUN ? "would apply" : "applied"} ${money(d.amount)} late fee on charge ${d.charge} (member ${d.member})`);
  }

  // Open charges past the grace period read as overdue from here on.
  const grace = Math.max(0, Math.floor(policy.grace_days ?? 0));
  for (const c of charges) {
    if (c.request_type === "late_fee" || !c.due_date) continue;
    const open = (c.status === "active" || c.status === "partially_paid") && Number(c.amount_remaining ?? 0) > 0;
    if (open && addDays(c.due_date, grace) < AS_OF) {
      await patch("payment_requests", c.id, { status: "overdue" });
      c.status = "overdue";
    }
  }
  return inserted;
}

// ── 3. Autopay ──────────────────────────────────────────────────────────────

async function membersAttemptedToday(org: OrgRow): Promise<Set<string>> {
  const out = new Set<string>();
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const rows = await items("payment_transactions", {
    filter: { organization: { _eq: org.id }, date_created: { _gte: since } },
    fields: ["member", "metadata"],
  });
  for (const r of rows) {
    const md = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
    if (md.autopay === "true" && md.autopay_date === AS_OF && id(r.member)) out.add(id(r.member)!);
  }
  // The webhook can lag a run by minutes; Stripe's own record is the tiebreak.
  if (stripe && org.stripe_connect_account_id) {
    try {
      const found = await stripe.paymentIntents.search(
        { query: `metadata['autopay_date']:'${AS_OF}' AND metadata['organization_id']:'${org.id}'`, limit: 100 },
        { stripeAccount: org.stripe_connect_account_id },
      );
      for (const pi of found.data) if (pi.metadata?.member_id) out.add(pi.metadata.member_id);
    } catch (e) {
      console.warn(`   autopay: Stripe search failed, relying on payment_transactions (${(e as Error).message})`);
    }
  }
  return out;
}

async function runAutopay(org: OrgRow, charges: ChargeRow[], members: Map<string, MemberRow>, counts: RunCounts): Promise<void> {
  const methods: (MethodLike & { stripe_customer_id?: string | null; stripe_payment_method_id?: string | null })[] = (
    await items("payment_methods", {
      filter: { organization: { _eq: org.id }, is_autopay: { _eq: true }, status: { _eq: "active" } },
      fields: ["id", "member", "is_autopay", "autopay_day", "status", "stripe_customer_id", "stripe_payment_method_id"],
    })
  ).map((m) => ({ ...m, member: id(m.member)! }));
  if (!methods.length) return;

  const attempted = await membersAttemptedToday(org);
  const runs = autopayRunsFor(AS_OF, methods, charges, attempted).filter((r) => !AUTOPAY_MEMBER || r.member === AUTOPAY_MEMBER);
  if (!runs.length) {
    console.log(`   autopay: nothing due today (${methods.length} method(s), ${attempted.size} already attempted)`);
    return;
  }

  const methodById = new Map(methods.map((m) => [m.id, m]));
  for (const run of runs) {
    const m = methodById.get(run.method)!;
    const who = members.get(run.member);
    const label = who ? `${who.first_name ?? ""} ${who.last_name ?? ""}`.trim() || run.member : run.member;
    const line = `${label} · ${run.charges.length} charge(s) · ${money(run.total)} via ${m.id}`;

    if (!AUTOPAY || DRY_RUN) {
      console.log(`   autopay: would charge ${line}${AUTOPAY ? "" : " (pass --autopay to run)"}`);
      continue;
    }
    if (org.is_demo) {
      console.log(`   autopay: [demo] skipped ${line}`);
      continue;
    }
    if (!org.stripe_connect_account_id || !org.connect_charges_enabled) {
      console.warn(`   autopay: org has no active connected account; skipped ${line}`);
      continue;
    }
    if (!m.stripe_customer_id || !m.stripe_payment_method_id) {
      console.warn(`   autopay: method ${m.id} has no Stripe customer/payment method; skipped ${line}`);
      continue;
    }

    const amount = Math.round(run.total * 100);
    counts.autopayAttempted++;
    try {
      // Direct charge on the connected account: the customer and the saved
      // method live there (see payment_methods.stripe_customer_id). The
      // platform fee comes off as application_fee_amount, the same percentage
      // paymentintent.post.ts applies to on-session dues.
      const pi = await stripe!.paymentIntents.create(
        {
          amount,
          currency: "usd",
          customer: m.stripe_customer_id,
          payment_method: m.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          application_fee_amount: Math.round((amount * FEE_PERCENT) / 100) || undefined,
          description: `Autopay ${AS_OF} — ${org.name ?? org.slug}`,
          receipt_email: who?.email || undefined,
          metadata: {
            app: "hoaconnect", // Hue's shared Stripe account — see core/shared/billing/stripe-app.ts
            organization_id: org.id,
            member_id: run.member,
            charge_ids: run.charges.join(","),
            payment_method_row: m.id,
            autopay: "true",
            autopay_date: AS_OF,
            connect_account_id: org.stripe_connect_account_id,
            platform_fee_percent: String(FEE_PERCENT),
          },
        },
        { stripeAccount: org.stripe_connect_account_id, idempotencyKey: `autopay:${org.id}:${run.member}:${AS_OF}` },
      );
      if (pi.status === "succeeded" || pi.status === "processing") {
        counts.autopaySucceeded++;
        counts.autopayAmount += run.total;
        console.log(`   autopay: ${pi.status} ${pi.id} · ${line}`);
      } else {
        console.warn(`   autopay: ${pi.status} ${pi.id} · ${line}`);
      }
    } catch (e) {
      const err = e as Stripe.errors.StripeError;
      console.warn(`   autopay: FAILED ${line}: ${err.code ?? err.type ?? ""} ${err.message}`);
    }
  }
}

// ── 4. Reminders ────────────────────────────────────────────────────────────

type Stage = "due_soon" | "due" | "past_grace";
const STAGE_ORDER: Stage[] = ["due_soon", "due", "past_grace"];

function stageFor(c: ChargeRow, grace: number): Stage | null {
  if (!c.due_date) return null;
  const due = c.due_date.slice(0, 10);
  if (addDays(due, grace) < AS_OF) return "past_grace";
  if (due <= AS_OF) return "due";
  if (addDays(due, -7) <= AS_OF) return "due_soon";
  return null;
}

async function sendViaSendgrid(msg: {
  to: string;
  toName?: string;
  from: { email: string; name: string };
  replyTo?: { email: string };
  subject: string;
  html: string;
  text: string;
  orgId: string;
}): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }] }],
      from: msg.from,
      subject: msg.subject,
      content: [
        { type: "text/plain", value: msg.text },
        { type: "text/html", value: msg.html },
      ],
      categories: ["HOA Connect", "billing-reminder", `org:${msg.orgId}`],
      custom_args: { org_id: msg.orgId },
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
}

async function pushToUser(userId: string, payload: Record<string, unknown>): Promise<number> {
  if (!PUSH_ENABLED) return 0;
  const subs = await items("push_subscriptions", { filter: { user: { _eq: userId } }, fields: ["id", "endpoint", "p256dh", "auth"] });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh ?? "", auth: sub.auth ?? "" } }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await directus.request(deleteItem("push_subscriptions" as any, sub.id)).catch(() => {});
    }
  }
  return sent;
}

const SUBJECTS: Record<Stage, (org: string) => string> = {
  due_soon: (org) => `Your ${org} dues are due in a week`,
  due: (org) => `Your ${org} dues are due`,
  past_grace: (org) => `Past due: your ${org} balance`,
};

/**
 * `withoutAccountOnly`: the reminder engine owns this community's dues
 * reminders (its dues rule is on), and it reaches people through their app
 * account. A member with no account is still the worker's to remind, by email,
 * or nobody would.
 */
async function sendReminders(
  org: OrgRow,
  charges: ChargeRow[],
  members: Map<string, MemberRow>,
  counts: RunCounts,
  opts: { withoutAccountOnly?: boolean } = {}
): Promise<void> {
  const grace = Math.max(0, Math.floor(org.payment_grace_period_days ?? 0));
  const isOpen = (c: ChargeRow) => ["active", "partially_paid", "overdue"].includes(c.status ?? "") && Number(c.amount_remaining ?? 0) > 0;

  // Latest applicable stage per charge, sent at most once. Earlier stages the
  // charge skipped (a charge generated already overdue) are marked with it, so
  // a member never gets three emails about one bill on the same morning.
  const byMember = new Map<string, { charge: ChargeRow; stage: Stage }[]>();
  for (const c of charges) {
    if (!isOpen(c) || c.id.startsWith("dry:")) continue;
    if (opts.withoutAccountOnly && members.get(c.member)?.user) continue;
    const stage = stageFor(c, grace);
    if (!stage) continue;
    const sent = (c.metadata && typeof c.metadata === "object" && c.metadata.reminders) || {};
    if (sent[stage]) continue;
    const list = byMember.get(c.member) ?? [];
    list.push({ charge: c, stage });
    byMember.set(c.member, list);
  }
  if (!byMember.size) return;

  const users = new Map<string, any>();
  const userIds = [...new Set([...byMember.keys()].map((m) => members.get(m)?.user).filter(Boolean))] as string[];
  if (userIds.length) {
    const rows = (await directus.request(
      readUsers({ filter: { id: { _in: userIds } } as any, fields: ["id", "email", "first_name", "notification_preferences"] as any, limit: -1 }),
    )) as any[];
    for (const u of rows) users.set(u.id, u);
  }

  const settings = org.settings && typeof org.settings === "object" ? org.settings : null;
  const orgForEmail = { ...org, settings };
  const branding = resolveEmailBranding(orgForEmail as any, null, { appUrl: APP_URL });
  // One sender rule for every path (core/server/utils/sendgrid.ts): the org's
  // name, its address only once the domain is verified, its reply-to.
  const sender = resolveSender(orgForEmail, "transactional");
  const from = { email: sender.fromAddress || FROM_EMAIL, name: sender.fromName || FROM_NAME };
  const orgName = org.name || org.slug;
  const payUrl = APP_URL ? `${APP_URL}/${org.slug}/payments` : "";

  for (const [memberId, list] of byMember) {
    const member = members.get(memberId);
    const user = member?.user ? users.get(member.user) : null;
    const email = user?.email || member?.email || null;
    // The most urgent stage in the batch names the message.
    const stage = list.map((l) => l.stage).sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0]!;
    const total = list.reduce((s, l) => s + Number(l.charge.amount_remaining ?? 0), 0);
    const subject = SUBJECTS[stage](orgName);
    const who = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim() || memberId;

    if (org.is_demo && !DEMO_ALLOW_EMAIL) {
      console.log(`   [demo] suppressed reminder → ${who} · ${stage} · ${money(total)}`);
      continue;
    }
    const emailAllowed = essentialEmailAllowed(member);
    if (!emailAllowed) {
      // Essential mail still skips a dead address; the bell and push below
      // still fire, so the member is reminded in the app.
      console.log(`   skipped email → ${who}: address bounced`);
    }
    if (DRY_RUN) {
      console.log(`   would remind ${who} (${email ?? "no email"}) · ${stage} · ${list.length} charge(s) · ${money(total)}`);
      counts.reminders++;
      continue;
    }

    const rowsHtml = list
      .map(
        (l) =>
          `<tr><td style="padding:6px 0">${esc(l.charge.title ?? "Charge")}</td><td style="padding:6px 12px;color:#6b7280">due ${esc(fmtDate(l.charge.due_date))}</td><td style="padding:6px 0;text-align:right;font-weight:600">${money(Number(l.charge.amount_remaining ?? 0))}</td></tr>`,
      )
      .join("");
    const lead =
      stage === "past_grace"
        ? "Your account has a past-due balance. Paying now avoids further late fees."
        : stage === "due"
          ? "Your dues are due today."
          : "A friendly heads-up: your dues are due in a week.";
    const content = `<p style="margin:0 0 12px">${lead}</p><table style="width:100%;border-collapse:collapse;margin:0 0 12px">${rowsHtml}<tr><td colspan="2" style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:600">Total due</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700">${money(total)}</td></tr></table>${
      payUrl
        ? `<p style="margin:24px 0 4px"><a href="${esc(payUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:15px">Pay now</a></p>`
        : ""
    }`;
    const base = { organization: orgForEmail as any, subject, content, emailType: "notice", recipientFirstName: member?.first_name || undefined, directusUrl: DIRECTUS_URL } as any;

    let delivered = false;
    // The app's master switch (`_email`), not Directus's `email_notifications` (Session H).
    if (email && SENDGRID_API_KEY && emailMasterOn(user?.notification_preferences) && emailAllowed) {
      try {
        await sendViaSendgrid({
          to: email,
          toName: member?.first_name || undefined,
          from,
          replyTo: sender.replyTo ? { email: sender.replyTo.email } : undefined,
          subject,
          html: buildEmailHtml({ ...base, appUrl: APP_URL, headerText: branding.headerText, footerImage: branding.footerImage, homepageUrl: branding.homepageUrl }),
          text: buildEmailText(base),
          orgId: org.id,
        });
        delivered = true;
        console.log(`   emailed ${who} <${email}> · ${stage} · ${money(total)}`);
      } catch (e) {
        console.warn(`   email FAILED → ${who}: ${(e as Error).message}`);
      }
    }
    if (user?.id && bellAllowed(user.notification_preferences, "payment")) {
      const n = await pushToUser(user.id, {
        title: subject.slice(0, 80),
        body: `${money(total)} across ${list.length} charge${list.length === 1 ? "" : "s"}.`,
        url: payUrl || `/${org.slug}/payments`,
        tag: `billing:${org.id}:${memberId}`,
        org: { id: org.id, slug: org.slug, name: org.name },
      });
      if (n > 0) {
        delivered = true;
        console.log(`   pushed ${who} (${n} device${n === 1 ? "" : "s"})`);
      }
    }
    if (!delivered) {
      console.log(`   no channel for ${who} (${email ?? "no email"}) — reminder not sent`);
      continue;
    }

    counts.reminders++;
    const stamp = new Date().toISOString();
    for (const l of list) {
      const prev = (l.charge.metadata && typeof l.charge.metadata === "object" ? l.charge.metadata : {}) as Record<string, any>;
      const reminders = { ...(prev.reminders ?? {}) };
      for (const s of STAGE_ORDER) {
        if (STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(l.stage) && !reminders[s]) reminders[s] = s === l.stage ? stamp : "skipped";
      }
      await patch("payment_requests", l.charge.id, { reminder_sent: true, reminder_sent_at: stamp, metadata: { ...prev, reminders } });
    }
  }
}

// ── Per-org run ─────────────────────────────────────────────────────────────

async function runOrg(org: OrgRow): Promise<RunCounts> {
  const counts: RunCounts = { charges: 0, chargesAmount: 0, lateFees: 0, lateFeesAmount: 0, autopayAttempted: 0, autopaySucceeded: 0, autopayAmount: 0, reminders: 0 };
  console.log(`\n🏘  ${org.name ?? org.slug} (${org.slug})${org.is_demo ? " [demo]" : ""}`);

  const [schedules, memberRows, linkRows, chargeRows] = await Promise.all([
    items("payment_schedules", {
      filter: { organization: { _eq: org.id } },
      fields: ["id", "title", "amount", "frequency", "cadence", "amount_source", "audience", "generate_days_ahead", "start_date", "end_date", "last_generated_period", "status", "member", "total_payments_generated"],
    }),
    items("hoa_members", { filter: { organization: { _eq: org.id }, status: { _eq: "active" } }, fields: ["id", "first_name", "last_name", "email", "user", "email_bounced"] }),
    items("hoa_member_units", {
      // Status is filtered here, not in the query: `_neq` never matches a NULL.
      filter: { unit_id: { organization: { _eq: org.id } } },
      fields: ["member_id", "unit_id", "start_date", "end_date", "ownership_percentage", "is_primary_unit", "member_type", "status"],
    }),
    items("payment_requests", {
      filter: { organization: { _eq: org.id } },
      fields: ["id", "member", "unit", "request_type", "status", "amount", "amount_paid", "amount_remaining", "due_date", "source", "source_id", "period_start", "title", "metadata", "reminder_sent"],
    }),
  ]);

  const members = new Map<string, MemberRow>(memberRows.map((m) => [m.id, { ...m, user: id(m.user) }]));
  const links: BillableLink[] = linkRows
    .filter((l) => l.status !== "archived")
    .map((l) => ({
      member: id(l.member_id)!,
      unit: id(l.unit_id)!,
      start_date: l.start_date,
      end_date: l.end_date,
      ownership_percentage: l.ownership_percentage == null ? null : Number(l.ownership_percentage),
      is_primary_unit: l.is_primary_unit,
      member_type: l.member_type,
      unit_rate: 1,
    }))
    .filter((l) => l.member && l.unit && members.has(l.member));
  const charges: ChargeRow[] = chargeRows.filter((c) => c.status !== "canceled").map((c) => ({ ...c, member: id(c.member)!, unit: id(c.unit), amount: c.amount == null ? null : Number(c.amount), amount_remaining: c.amount_remaining == null ? null : Number(c.amount_remaining) }));
  console.log(`   schedules=${schedules.filter((s) => s.status === "active").length}/${schedules.length} members=${members.size} links=${links.length} charges=${charges.length}`);

  const generated = await generate(org, schedules, links, charges, counts);
  charges.push(...generated);
  const fees = await applyLateFees(org, charges, counts);
  charges.push(...fees);
  await runAutopay(org, charges, members, counts);
  // Once a board turns on the reminder engine's dues rule (Phase 5a,
  // core/shared/reminders/), it sends this community's dues reminders to
  // everyone with an app account — hourly, on the community's clock — and
  // stamps `metadata.reminders` the same way, so neither repeats a stage the
  // other sent. Members without an account stay here: the engine can't reach them.
  const engineOwnsDues = resolveReminderSettings(org.settings?.reminders).rules.dues.enabled;
  if (engineOwnsDues) console.log("   reminders: members with an account → the reminder engine; without → here");
  await sendReminders(org, charges, members, counts, { withoutAccountOnly: engineOwnsDues });

  const entry = buildBillingRunEntry({
    organizationId: org.id,
    organizationName: org.name,
    asOf: AS_OF,
    counts,
    dryRun: DRY_RUN,
    occurredAt: new Date().toISOString(),
  });
  if (entry) {
    // Written directly: core/server/utils/audit-log.ts needs Nuxt auto-imports.
    // Retrieval indexing is left to `backfill:ledger-embeddings`, as that file says.
    await directus.request(createItem("org_audit_log" as any, entry as any));
    console.log(`   ledger: ${entry.summary}`);
  }
  console.log(`   charges=${counts.charges} lateFees=${counts.lateFees} autopay=${counts.autopaySucceeded}/${counts.autopayAttempted} reminders=${counts.reminders}`);
  return counts;
}

async function main() {
  console.log(`💵 Billing worker — ${DRY_RUN ? "DRY RUN" : "live"} · as of ${AS_OF} (${TZ}) · stripe ${STRIPE_LIVE ? "LIVE" : "test"} · autopay ${AUTOPAY && !DRY_RUN ? (AUTOPAY_MEMBER ? `member ${AUTOPAY_MEMBER}` : "ON") : "off"}`);

  const filter: Record<string, any> = ONLY_ORG
    ? /^[0-9a-f-]{36}$/i.test(ONLY_ORG)
      ? { id: { _eq: ONLY_ORG } }
      : { slug: { _eq: ONLY_ORG } }
    : { status: { _eq: "active" } };
  const orgs: OrgRow[] = await items("hoa_organizations", {
    filter,
    fields: [
      "id", "name", "slug", "is_demo", { settings: ["*"] },
      "late_fee_enabled", "late_fee_amount", "late_fee_kind", "late_fee_repeat", "late_fee_cap", "payment_grace_period_days",
      "stripe_connect_account_id", "connect_charges_enabled",
    ],
  });
  if (!orgs.length) {
    console.error(`❌ No organization matched${ONLY_ORG ? ` "${ONLY_ORG}"` : ""}`);
    process.exit(1);
  }

  const totals: RunCounts = { charges: 0, chargesAmount: 0, lateFees: 0, lateFeesAmount: 0, autopayAttempted: 0, autopaySucceeded: 0, autopayAmount: 0, reminders: 0 };
  for (const org of orgs) {
    try {
      const c = await runOrg(org);
      for (const k of Object.keys(totals) as (keyof RunCounts)[]) totals[k] += c[k];
    } catch (e) {
      console.error(`   ❌ ${org.slug}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✅ Done${DRY_RUN ? " (dry run — nothing written)" : ""}. orgs=${orgs.length} charges=${totals.charges} (${money(totals.chargesAmount)}) lateFees=${totals.lateFees} autopay=${totals.autopaySucceeded}/${totals.autopayAttempted} reminders=${totals.reminders}`);
}

// Records the run in ops_job_heartbeats (the console's health page); dry runs aren't.
runWithHeartbeat("billing-worker", DRY_RUN, main).catch((err) => {
  console.error("❌ Billing worker failed:", err);
  process.exit(1);
});
