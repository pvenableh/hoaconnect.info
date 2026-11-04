/**
 * The reminder tick (Earnest parity round 3, Phase 5a) — what
 * GET/POST /api/reminders/run does each hour:
 *
 *   for each community with a rule on (or every one, on a dry run):
 *     1. load what the rules read — only for the rules that are on;
 *     2. evaluate them for `asOf` on the community's clock (rules.ts);
 *     3. drop keys already in hoa_reminder_log (a read; cheap, not the guard);
 *     4. per group (one member's dues; one meeting's invitees): INSERT the log
 *        rows first — the claim. `reminder_key` is UNIQUE, so of two
 *        overlapping ticks exactly one insert lands; the other gets
 *        RECORD_NOT_UNIQUE and sends nothing for those keys;
 *     5. send what was claimed as ONE notification through notifyUsers()
 *        (bell + push + the branded email twin; dues and violations essential);
 *     6. write each row's `result` (sent | failed) and, for dues, stamp the
 *        charges the way the billing worker does (`metadata.reminders`).
 *
 * At most once: a run that dies between 4 and 5 leaves `claimed` rows and the
 * reminder is missed, never doubled (Earnest's `invoice_reminders` trade — a
 * missed reminder is fixed by the next stage or a person; a doubled one is
 * already in someone's inbox). A 40 s budget is checked before each community
 * and each group; what is left is still due on the next tick, because every
 * stage is a window (rules.ts).
 *
 * `dry: true` evaluates and reads the log, and writes nothing: no claim, no
 * send, no stamp. It lists what would go out, and what rules that are off
 * would send.
 */
import * as sdk from "@directus/sdk";
import { fromAbsolute, toCalendarDate } from "@internationalized/date";
import { residencyFor } from "#core/shared/members/residency";
import { orgTimeZone } from "#core/shared/org-timezone";
import {
  anyReminderEnabled,
  REMINDER_RULES,
  resolveReminderSettings,
  type ReminderRule,
  type ResolvedReminderSettings,
} from "#core/shared/reminders/settings";
import {
  evaluateReminders,
  EVENT_WINDOW_MS,
  groupReminders,
  instant,
  OVERDUE_SPAN_DAYS,
  WORKER_STAGE,
  type ChargeInput,
  type MeetingInput,
  type PollInput,
  type Reminder,
  type ReminderSnapshot,
  type RequestInput,
  type VendorInput,
} from "#core/shared/reminders/rules";
import { composeReminder, reminderPushActions, type ComposedReminder } from "#core/shared/reminders/messages";
import { isNotUnique } from "./email-send-queue";

export const REMINDER_BUDGET_MS = 40_000;

// ── The store ───────────────────────────────────────────────────────────────

export interface ReminderOrg {
  id: string;
  slug: string;
  name: string;
  timeZone: string;
  graceDays: number;
  /** `settings.reminders`, raw. */
  reminders: unknown;
}

export interface ReminderLogRow {
  organization: string;
  rule: ReminderRule;
  stage: string;
  reminder_key: string;
  recipient: string;
  entity_collection: string;
  entity_id: string;
  channels: string;
  result: "claimed";
}

/** One poll or request: an event reads just it, not the community's whole queue. */
export interface ReminderEntityRef {
  collection: "hoa_polls" | "hoa_requests";
  id: string;
}

export interface ReminderStore {
  /** Every community, or the one whose slug or id is `org`. */
  listOrgs(org?: string | null): Promise<ReminderOrg[]>;
  /** What the rules read, for `rules` only. */
  loadSnapshot(
    org: ReminderOrg,
    settings: ResolvedReminderSettings,
    opts: { asOf: Date; rules: ReminderRule[]; only?: ReminderEntityRef }
  ): Promise<ReminderSnapshot>;
  /** Which of these keys are already logged. */
  existingKeys(keys: string[]): Promise<Set<string>>;
  /** One transaction: every row or none. Throws RECORD_NOT_UNIQUE when a key is taken. Returns the ids. */
  insertLogs(rows: ReminderLogRow[]): Promise<string[]>;
  /** One row. Throws RECORD_NOT_UNIQUE when the key is taken. */
  insertLog(row: ReminderLogRow): Promise<string>;
  settleLogs(ids: string[], patch: { result: "sent" | "failed"; detail: string; sent_at: string }): Promise<void>;
  /** Dues: mark the charges as reminded, in the billing worker's vocabulary. */
  stampCharges(chargeIds: string[], workerStage: string, at: string): Promise<void>;
}

export type ReminderSender = (org: ReminderOrg, reminder: ComposedReminder) => Promise<{ bell: number; push: number; email: number }>;

// ── The tick ────────────────────────────────────────────────────────────────

export interface ReminderTickOptions {
  store: ReminderStore;
  send: ReminderSender;
  asOf?: Date;
  dry?: boolean;
  /** One community (slug or id). */
  org?: string | null;
  budgetMs?: number;
  /** The clock the budget is measured on (tests). */
  now?: () => number;
}

export interface DryRunItem {
  key: string;
  rule: ReminderRule;
  stage: string;
  member: string;
  audience: string;
  channels: string;
}

export interface ReminderOrgResult {
  id: string;
  slug: string;
  timeZone: string;
  /** "2026-11-03 09:00" on the community's clock. */
  localTime: string;
  /** Reminders due now with their rule on, not yet logged. */
  due: number;
  /** Due but already in the log (sent by an earlier tick). */
  logged: number;
  claimed: number;
  /** Lost the claim to another run (RECORD_NOT_UNIQUE). */
  lost: number;
  sent: number;
  failed: number;
  groups: number;
  /** Dry run: what would go out, and per `rule.stage` what rules that are off would send. */
  wouldSend?: DryRunItem[];
  wouldSendGroups?: Array<{ group: string; subject: string; recipients: number }>;
  off?: Record<string, number>;
  /** Dry run: per `rule.stage`, due but nobody to send it to (no app account). */
  unreachable?: Record<string, number>;
  error?: string;
}

export interface ReminderTickResult {
  asOf: string;
  dry: boolean;
  /** The budget ran out; the next tick carries on. */
  continued: boolean;
  orgs: ReminderOrgResult[];
  totals: { due: number; sent: number; failed: number; lost: number; groups: number };
}

const localTime = (asOf: Date, timeZone: string) => {
  const z = fromAbsolute(asOf.getTime(), timeZone);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${z.year}-${p(z.month)}-${p(z.day)} ${p(z.hour)}:${p(z.minute)}`;
};

const logRow = (orgId: string, r: Reminder): ReminderLogRow => ({
  organization: orgId,
  rule: r.rule,
  stage: r.stage,
  reminder_key: r.key,
  recipient: r.member,
  entity_collection: r.entity.collection,
  entity_id: r.entity.id,
  channels: r.channels.join(","),
  result: "claimed",
});

/**
 * Claim a group: one batch insert, and on a collision (another run holds some
 * of these keys) one insert per row, so the keys still free are claimed and
 * the taken ones are lost.
 */
async function claimGroup(
  store: ReminderStore,
  orgId: string,
  group: Reminder[]
): Promise<{ claimed: Array<{ reminder: Reminder; id: string }>; lost: number }> {
  const rows = group.map((r) => logRow(orgId, r));
  try {
    const ids = await store.insertLogs(rows);
    return { claimed: group.map((reminder, i) => ({ reminder, id: ids[i]! })), lost: 0 };
  } catch (e) {
    if (!isNotUnique(e)) throw e;
  }
  const claimed: Array<{ reminder: Reminder; id: string }> = [];
  let lost = 0;
  for (let i = 0; i < group.length; i++) {
    try {
      claimed.push({ reminder: group[i]!, id: await store.insertLog(rows[i]!) });
    } catch (e) {
      if (!isNotUnique(e)) throw e;
      lost++;
    }
  }
  return { claimed, lost };
}

export async function runReminderTick(opts: ReminderTickOptions): Promise<ReminderTickResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? REMINDER_BUDGET_MS;
  const overBudget = () => now() - started > budget;
  const asOf = opts.asOf ?? new Date();
  const dry = opts.dry === true;
  const { store } = opts;

  const result: ReminderTickResult = {
    asOf: asOf.toISOString(),
    dry,
    continued: false,
    orgs: [],
    totals: { due: 0, sent: 0, failed: 0, lost: 0, groups: 0 },
  };

  const orgs = await store.listOrgs(opts.org ?? null);
  for (const org of orgs) {
    if (overBudget()) {
      result.continued = true;
      break;
    }
    const settings = resolveReminderSettings(org.reminders);
    if (!dry && !anyReminderEnabled(settings)) continue;

    const out: ReminderOrgResult = {
      id: org.id,
      slug: org.slug,
      timeZone: org.timeZone,
      localTime: localTime(asOf, org.timeZone),
      due: 0,
      logged: 0,
      claimed: 0,
      lost: 0,
      sent: 0,
      failed: 0,
      groups: 0,
    };
    result.orgs.push(out);

    try {
      // A dry run reads every rule, so it can say what the ones that are off would send.
      const rules = dry ? [...REMINDER_RULES] : REMINDER_RULES.filter((r) => settings.rules[r].enabled);
      const snapshot = await store.loadSnapshot(org, settings, { asOf, rules });
      const unreachable: Record<string, number> = {};
      const all = evaluateReminders(snapshot, asOf, (u) => {
        unreachable[`${u.rule}.${u.stage}`] = (unreachable[`${u.rule}.${u.stage}`] ?? 0) + 1;
      });
      const on = all.filter((r) => r.enabled);
      const logged = on.length ? await store.existingKeys(on.map((r) => r.key)) : new Set<string>();
      const fresh = on.filter((r) => !logged.has(r.key));
      out.logged = on.length - fresh.length;
      out.due = fresh.length;
      result.totals.due += fresh.length;

      if (dry) {
        out.wouldSend = fresh.map((r) => ({
          key: r.key,
          rule: r.rule,
          stage: r.stage,
          member: r.member,
          audience: r.audience,
          channels: r.channels.join(","),
        }));
        out.wouldSendGroups = groupReminders(fresh).map((g) => {
          const c = composeReminder(g, settings.rules[g[0]!.rule].copy);
          return { group: c.group, subject: c.subject, recipients: c.recipients.length };
        });
        out.off = {};
        for (const r of all) if (!r.enabled) out.off[`${r.rule}.${r.stage}`] = (out.off[`${r.rule}.${r.stage}`] ?? 0) + 1;
        out.unreachable = unreachable;
        out.groups = out.wouldSendGroups.length;
        continue;
      }

      for (const group of groupReminders(fresh)) {
        if (overBudget()) {
          result.continued = true;
          break;
        }
        const { claimed, lost } = await claimGroup(store, org.id, group);
        out.lost += lost;
        out.claimed += claimed.length;
        if (!claimed.length) continue;

        const composed = composeReminder(
          claimed.map((c) => c.reminder),
          settings.rules[group[0]!.rule].copy
        );
        const ids = claimed.map((c) => c.id);
        out.groups++;
        try {
          const counts = await opts.send(org, composed);
          const at = new Date().toISOString();
          await store
            .settleLogs(ids, { result: "sent", detail: `bell ${counts.bell} · push ${counts.push} · email ${counts.email}`, sent_at: at })
            .catch((e) => console.warn("[reminders] settle failed", (e as Error).message));
          out.sent += ids.length;
          if (composed.rule === "dues") {
            const stage = WORKER_STAGE[composed.stage as keyof typeof WORKER_STAGE];
            if (stage) {
              await store
                .stampCharges(composed.entities.map((e) => e.id), stage, at)
                .catch((e) => console.warn("[reminders] charge stamp failed", (e as Error).message));
            }
          }
        } catch (e) {
          out.failed += ids.length;
          await store
            .settleLogs(ids, { result: "failed", detail: String((e as Error)?.message || e).slice(0, 500), sent_at: new Date().toISOString() })
            .catch(() => {});
        }
      }
      if (result.continued) break;
    } catch (e) {
      out.error = String((e as Error)?.message || e).slice(0, 300);
      console.warn(`[reminders] ${org.slug}: ${out.error}`);
    } finally {
      result.totals.sent += out.sent;
      result.totals.failed += out.failed;
      result.totals.lost += out.lost;
      result.totals.groups += out.groups;
    }
  }
  return result;
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface ReminderEventOptions {
  store: ReminderStore;
  send: ReminderSender;
  /** Has `pnpm create:reminder-log` run? Without the log there is no key to claim — and no tick to double up with. */
  provisioned: boolean;
  org: ReminderOrg;
  /** The poll or request it happened to. */
  entity: ReminderEntityRef;
  /** `status` (a request changed), `opened` / `closed` (a poll did). */
  stage: "status" | "opened" | "closed";
  /** The moment it happened (default now). */
  asOf?: Date;
}

export interface ReminderEventResult {
  /** People a notification went to. */
  recipients: number;
  /** Log rows claimed and sent. */
  sent: number;
  /** Keys already in the log: another path sent it. */
  skipped: number;
  lost: number;
  failed: number;
}

/**
 * The engine, for one thing that just happened — a request changed status, a
 * poll opened or closed — sent now instead of at the next tick, and **through
 * the same keys**, so whichever path gets there first is the only one that
 * sends (Session 9, deviation 9). The rule is evaluated exactly as the tick
 * would (same audience, same words, same key), minus the quiet hours.
 *
 * The board's approval still decides the email: with the rule and stage on, the
 * event sends what the tick would (bell, push and the approved email); with
 * them off it is a plain bell and push — the same weight as "new document
 * available" — and the key is claimed either way, so turning the rule on
 * later doesn't announce it a second time.
 */
export async function announceReminderEvent(opts: ReminderEventOptions): Promise<ReminderEventResult> {
  const { store, org, entity, stage } = opts;
  const rule: ReminderRule = entity.collection === "hoa_polls" ? "poll" : "request";
  let asOf = opts.asOf ?? new Date();
  const settings = resolveReminderSettings(org.reminders);
  const result: ReminderEventResult = { recipients: 0, sent: 0, skipped: 0, lost: 0, failed: 0 };

  const snapshot = await store.loadSnapshot(org, settings, { asOf, rules: [rule], only: entity });
  if (stage === "status") {
    // `status_changed_at` is the browser's clock; a browser a few seconds ahead of the
    // server would put the change in the future and the rule would find nothing due.
    const changed = instant(snapshot.requests.find((r) => r.id === entity.id)?.statusChangedAt);
    if (Number.isFinite(changed) && changed > asOf.getTime()) asOf = new Date(changed);
  }
  if (stage === "opened") {
    // A draft put to the community now is "just opened" whatever its `date_created`: the
    // engine anchors "opened" on creation, so an old draft would otherwise be outside the
    // window. A poll created inside the window keeps its own anchor — the tick computes
    // the same key, which is what makes one path send.
    snapshot.polls = snapshot.polls.map((p) =>
      p.id === entity.id && !(instant(p.createdAt) > asOf.getTime() - EVENT_WINDOW_MS) ? { ...p, createdAt: asOf.toISOString() } : p
    );
  }
  const due = evaluateReminders(snapshot, asOf, undefined, { allHours: true }).filter(
    (r) => r.rule === rule && r.stage === stage && r.entity.id === entity.id
  );
  const logged = opts.provisioned && due.length ? await store.existingKeys(due.map((r) => r.key)) : new Set<string>();
  const fresh = due.filter((r) => !logged.has(r.key));
  result.skipped = due.length - fresh.length;

  for (const group of groupReminders(fresh)) {
    const claim = opts.provisioned
      ? await claimGroup(store, org.id, group)
      : { claimed: group.map((reminder) => ({ reminder, id: "" })), lost: 0 };
    result.lost += claim.lost;
    if (!claim.claimed.length) continue;

    const on = claim.claimed[0]!.reminder.enabled;
    const composed = composeReminder(claim.claimed.map((c) => c.reminder), on ? settings.rules[rule].copy : null);
    const ids = claim.claimed.map((c) => c.id).filter(Boolean);
    try {
      const counts = await opts.send(org, { ...composed, channels: on ? composed.channels : composed.channels.filter((c) => c !== "email") });
      result.sent += claim.claimed.length;
      result.recipients += composed.recipients.length;
      if (ids.length) {
        await store
          .settleLogs(ids, { result: "sent", detail: `event · bell ${counts.bell} · push ${counts.push} · email ${counts.email}`, sent_at: new Date().toISOString() })
          .catch((e) => console.warn("[reminders] settle failed", (e as Error).message));
      }
    } catch (e) {
      result.failed += claim.claimed.length;
      if (ids.length) {
        await store
          .settleLogs(ids, { result: "failed", detail: String((e as Error)?.message || e).slice(0, 500), sent_at: new Date().toISOString() })
          .catch(() => {});
      }
    }
  }
  return result;
}

// ── Sending ─────────────────────────────────────────────────────────────────

/** One composed reminder through the notify layer: bell, push, and the email twin. */
export const sendReminder: ReminderSender = async (org, c) => {
  const [{ notifyUsers }, { reminderEmail }] = await Promise.all([import("./notify"), import("./reminder-email")]);
  const email = c.channels.includes("email") ? reminderEmail(c) : null;
  const entity = c.entities[0];
  return notifyUsers({
    organizationId: org.id,
    recipientUserIds: c.recipients,
    category: c.category,
    subject: c.subject,
    message: c.message,
    collection: entity?.collection ?? null,
    item: entity?.id ?? null,
    path: c.path,
    origin: (useRuntimeConfig().public.appUrl as string) || null,
    pushActions: reminderPushActions(c),
    bell: c.channels.includes("bell"),
    push: c.channels.includes("push")
      ? { urgency: c.urgency, ...(c.ttlSeconds ? { ttlSeconds: c.ttlSeconds } : {}) }
      : false,
    essential: c.essential,
    email: email
      ? {
          subject: c.subject,
          heading: email.heading,
          bodyHtml: email.bodyHtml,
          cta: email.cta,
          emailType: email.emailType,
          contentPartial: email.contentPartial,
        }
      : null,
  });
};

// ── The Directus store ──────────────────────────────────────────────────────

type DirectusLike = { request: (op: any) => Promise<any> };

// Untyped and looked up at call time, as email-send-queue.ts does, so a test
// that mocks @directus/sdk without some builder still imports this module.
const op = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);
const readItems = op("readItems");
const createItem = op("createItem");
const createItems = op("createItems");
const updateItems = op("updateItems");
const updateItem = op("updateItem");
const readFieldsByCollection = op("readFieldsByCollection");

const idOf = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" || typeof v === "number" ? String(v) : idOf((v as { id?: unknown }).id);

const LOG = "hoa_reminder_log";
const OPEN_REQUEST = ["open", "in_progress", "waiting"];
const CHARGE_LABELS: Record<string, string> = {
  monthly_dues: "Monthly dues",
  assessment: "Assessment",
  late_fee: "Late fee",
  other: "Charge",
};
const HOUR_MS = 3_600_000;

const isoDay = (asOf: Date, timeZone: string, addDays: number) =>
  toCalendarDate(fromAbsolute(asOf.getTime(), timeZone)).add({ days: addDays }).toString();

/** "Repaint the fence — 12 of 20 votes"; a tie names both; no votes says so. */
export function pollResultSentence(options: unknown, votes: Array<{ option_id?: unknown }>): string {
  const list = Array.isArray(options) ? options : [];
  if (!votes.length) return "No votes were cast";
  const counts = new Map<string, number>();
  for (const v of votes) {
    const k = String(v.option_id ?? "");
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const tallied = list.map((o: any, i: number) => ({
    label: String(o?.label ?? o?.id ?? i),
    count: counts.get(String(o?.id ?? i)) ?? 0,
  }));
  const top = Math.max(0, ...tallied.map((t) => t.count));
  const leaders = tallied.filter((t) => t.count === top && top > 0);
  const total = votes.length;
  if (!leaders.length) return "No votes were cast";
  if (leaders.length > 1) return `A tie between ${leaders.map((l) => l.label).join(" and ")} — ${top} of ${total} votes each`;
  return `${leaders[0]!.label} — ${top} of ${total} votes`;
}

/**
 * `provisioned: false` (before `pnpm create:reminder-log`) is for the dry run
 * only: it reads without `timezone` and `settings.reminders` (Directus 403s a
 * field that doesn't exist) and treats the log as empty. It has no log to
 * write to, and the route never sends through it.
 */
export function directusReminderStore(directus: DirectusLike, opts: { provisioned?: boolean } = {}): ReminderStore {
  const provisioned = opts.provisioned !== false;
  const read = async <T = any>(collection: string, query: Record<string, unknown>): Promise<T[]> =>
    ((await directus.request(readItems(collection, { limit: -1, ...query }))) as T[]) ?? [];

  return {
    async listOrgs(org) {
      const key = (org || "").trim();
      const filter = !key ? {} : /^[0-9a-f-]{36}$/i.test(key) ? { id: { _eq: key } } : { slug: { _eq: key } };
      const rows = await read<any>("hoa_organizations", {
        filter,
        fields: provisioned
          ? ["id", "slug", "name", "timezone", "payment_grace_period_days", { settings: ["reminders"] }]
          : ["id", "slug", "name", "payment_grace_period_days"],
        sort: ["slug"],
      });
      return rows.map((o) => ({
        id: String(o.id),
        slug: String(o.slug ?? ""),
        name: String(o.name ?? o.slug ?? ""),
        timeZone: orgTimeZone(o),
        graceDays: Math.max(0, Math.floor(Number(o.payment_grace_period_days) || 0)),
        reminders: o.settings && typeof o.settings === "object" ? (o.settings as any).reminders ?? null : null,
      }));
    },

    async loadSnapshot(org, settings, { asOf, rules, only }) {
      const want = new Set(rules);
      const tz = org.timeZone;
      const snap: ReminderSnapshot = {
        org: { id: org.id, slug: org.slug, name: org.name, timeZone: tz, graceDays: org.graceDays },
        settings,
        charges: [],
        meetings: [],
        requests: [],
        polls: [],
        vendors: [],
        adminUserIds: [],
      };
      const { orgAudienceUserIds, adminUserIds } = await import("./notification-events");
      const audiences = new Map<string, Promise<string[]>>();
      const audience = (tag: string | null | undefined) => {
        const t = String(tag || "all").replace(/\s+/g, "_").toLowerCase();
        if (!audiences.has(t)) audiences.set(t, orgAudienceUserIds(org.id, t).catch(() => []));
        return audiences.get(t)!;
      };
      const tasks: Array<Promise<void>> = [];

      if (want.has("dues")) {
        tasks.push(
          (async () => {
            const rows = await read<any>("payment_requests", {
              filter: {
                organization: { _eq: org.id },
                status: { _in: ["active", "partially_paid", "overdue"] },
                amount_remaining: { _gt: 0 },
                due_date: {
                  _gte: isoDay(asOf, tz, -(org.graceDays + OVERDUE_SPAN_DAYS + 1)),
                  _lte: isoDay(asOf, tz, settings.rules.dues.days + 1),
                },
              },
              fields: ["id", "title", "request_type", "status", "amount_remaining", "due_date", "metadata", "unit", "member.id", "member.user"],
            });
            const units = [...new Set(rows.map((r) => idOf(r.unit)).filter(Boolean) as string[])];
            const residents = new Map<string, ChargeInput["residents"]>();
            if (units.length) {
              const links = await read<any>("hoa_member_units", {
                filter: { unit_id: { _in: units } },
                fields: ["unit_id", "member_type", "is_primary_unit", "end_date", "status", "member_id.user", "member_id.member_type", "member_id.status"],
              });
              for (const l of links) {
                if (l.status === "archived" || l.member_id?.status !== "active") continue;
                const userId = idOf(l.member_id?.user);
                const unit = idOf(l.unit_id);
                if (!userId || !unit) continue;
                // residencyFor on this one link: an ended link resolves to the member's own type.
                if (l.end_date && Date.parse(l.end_date) < asOf.getTime()) continue;
                const residency = residencyFor(
                  { member_type: l.member_id?.member_type, units: [{ member_type: l.member_type, is_primary_unit: l.is_primary_unit, end_date: l.end_date }] } as any,
                  { asOf }
                );
                residents.set(unit, [...(residents.get(unit) ?? []), { userId, residency }]);
              }
            }
            snap.charges = rows.map((r) => {
              const meta = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
              const sent = meta.reminders && typeof meta.reminders === "object" ? meta.reminders : {};
              return {
                id: String(r.id),
                label: String(r.title || CHARGE_LABELS[r.request_type] || "Charge"),
                status: r.status ?? null,
                amountRemaining: Number(r.amount_remaining) || 0,
                dueDate: r.due_date ?? null,
                billedUserId: idOf(r.member?.user),
                residents: residents.get(idOf(r.unit) ?? "") ?? [],
                sentStages: Object.keys(sent).filter((k) => !!sent[k]),
              } satisfies ChargeInput;
            });
          })()
        );
      }

      if (want.has("meeting")) {
        tasks.push(
          (async () => {
            const rows = await read<any>("hoa_meetings", {
              filter: {
                organization: { _eq: org.id },
                is_published: { _eq: true },
                meeting_date: { _gte: asOf.toISOString(), _lte: new Date(asOf.getTime() + 8 * 24 * HOUR_MS).toISOString() },
              },
              fields: ["id", "title", "meeting_date", "status", "is_published", "location", "target_audience"],
            });
            snap.meetings = await Promise.all(
              rows.map(async (m) => ({
                id: String(m.id),
                title: String(m.title || "Meeting"),
                startsAt: m.meeting_date ?? null,
                status: m.status ?? null,
                published: m.is_published === true,
                location: m.location ?? null,
                audienceUserIds: await audience(m.target_audience),
              } satisfies MeetingInput))
            );
          })()
        );
      }

      if (want.has("request") || want.has("violation")) {
        tasks.push(
          (async () => {
            const rows = await read<any>("hoa_requests", {
              filter: {
                organization: { _eq: org.id },
                ...(only?.collection === "hoa_requests" ? { id: { _eq: only.id } } : {}),
                _or: [
                  { status: { _in: OPEN_REQUEST } },
                  { status: { _in: ["resolved", "closed"] }, date_updated: { _gte: new Date(asOf.getTime() - 48 * HOUR_MS).toISOString() } },
                ],
              },
              fields: ["id", "type", "title", "status", "metadata", "submitted_by", "assigned_to", "member.user", "date_created", "date_updated"],
            });
            // The last comment on each open request — activity the row's own date doesn't see.
            const lastComment = new Map<string, string>();
            const open = rows.filter((r) => OPEN_REQUEST.includes(r.status)).map((r) => String(r.id));
            if (open.length) {
              const agg = await directus
                .request(
                  readItems("hoa_comments", {
                    filter: { target_collection: { _eq: "hoa_requests" }, target_id: { _in: open } },
                    aggregate: { max: ["date_created"] },
                    groupBy: ["target_id"],
                    limit: -1,
                  })
                )
                .catch(() => []);
              for (const a of (agg as any[]) ?? []) {
                const at = a?.max?.date_created ?? a?.max_date_created;
                if (a?.target_id && at) lastComment.set(String(a.target_id), String(at));
              }
            }
            const latest = (...vals: Array<string | null | undefined>) =>
              vals.filter(Boolean).sort((a, b) => Date.parse(b!) - Date.parse(a!))[0] ?? null;
            snap.requests = rows.map((r) => {
              const meta = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
              return {
                id: String(r.id),
                type: r.type ?? null,
                title: String(r.title || "Request"),
                status: r.status ?? null,
                workflowState: typeof meta.workflow_state === "string" ? meta.workflow_state : null,
                statusChangedAt: typeof meta.status_changed_at === "string" ? meta.status_changed_at : null,
                submittedBy: idOf(r.submitted_by),
                assignedTo: idOf(r.assigned_to),
                memberUserId: idOf(r.member?.user),
                cureBy: typeof meta.cure_by === "string" ? meta.cure_by : null,
                lastActivityAt: latest(r.date_updated, r.date_created, lastComment.get(String(r.id))),
              } satisfies RequestInput;
            });
          })()
        );
      }

      if (want.has("poll")) {
        tasks.push(
          (async () => {
            const since = new Date(asOf.getTime() - 48 * HOUR_MS).toISOString();
            const rows = await read<any>("hoa_polls", {
              filter: {
                organization: { _eq: org.id },
                ...(only?.collection === "hoa_polls" ? { id: { _eq: only.id } } : {}),
                _or: [{ status: { _eq: "open" } }, { status: { _eq: "closed" }, closes_at: { _gte: since } }],
              },
              fields: ["id", "title", "status", "date_created", "closes_at", "target_audience", "options"],
            });
            const votes = rows.length
              ? await read<any>("hoa_poll_votes", {
                  filter: { poll: { _in: rows.map((p) => p.id) }, organization: { _eq: org.id } },
                  fields: ["poll", "user", "option_id"],
                })
              : [];
            snap.polls = await Promise.all(
              rows.map(async (p) => {
                const mine = votes.filter((v) => idOf(v.poll) === String(p.id));
                return {
                  id: String(p.id),
                  question: String(p.title || "Poll"),
                  status: p.status ?? null,
                  createdAt: p.date_created ?? null,
                  closesAt: p.closes_at ?? null,
                  audienceUserIds: await audience(p.target_audience),
                  voterUserIds: [...new Set(mine.map((v) => idOf(v.user)).filter(Boolean) as string[])],
                  resultSentence: pollResultSentence(p.options, mine),
                } satisfies PollInput;
              })
            );
          })()
        );
      }

      if (want.has("coverage")) {
        tasks.push(
          (async () => {
            const rows = await read<any>("hoa_vendors", {
              filter: {
                organization: { _eq: org.id },
                status: { _eq: "active" },
                active_until: { _gte: isoDay(asOf, tz, -7), _lte: isoDay(asOf, tz, settings.rules.coverage.days + 1) },
              },
              fields: ["id", "name", "company", "active_until"],
            });
            snap.vendors = rows.map((v) => ({
              id: String(v.id),
              name: String(v.company || v.name || "A vendor"),
              activeUntil: v.active_until ?? null,
            } satisfies VendorInput));
            snap.adminUserIds = rows.length ? await adminUserIds(org.id).catch(() => []) : [];
          })()
        );
      }

      await Promise.all(tasks);
      return snap;
    },

    async existingKeys(keys) {
      const found = new Set<string>();
      if (!provisioned) return found;
      // In chunks: a 400-key `_in` is a long URL.
      for (let i = 0; i < keys.length; i += 100) {
        const rows = await read<any>(LOG, { filter: { reminder_key: { _in: keys.slice(i, i + 100) } }, fields: ["reminder_key"] });
        for (const r of rows) if (r.reminder_key) found.add(String(r.reminder_key));
      }
      return found;
    },

    async insertLogs(rows) {
      const created = (await directus.request(createItems(LOG, rows, { fields: ["id"] }))) as Array<{ id: string }>;
      return (created ?? []).map((c) => String(c.id));
    },

    async insertLog(row) {
      const created = (await directus.request(createItem(LOG, row, { fields: ["id"] }))) as { id: string };
      return String(created.id);
    },

    async settleLogs(ids, patch) {
      if (ids.length) await directus.request(updateItems(LOG, ids, patch));
    },

    async stampCharges(chargeIds, workerStage, at) {
      const rows = await read<any>("payment_requests", { filter: { id: { _in: chargeIds } }, fields: ["id", "metadata"] });
      for (const r of rows) {
        const meta = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
        const reminders = { ...(meta.reminders ?? {}), [workerStage]: at };
        await directus.request(
          updateItem("payment_requests", r.id, { reminder_sent: true, reminder_sent_at: at, metadata: { ...meta, reminders } })
        );
      }
    },
  };
}

// ── Is the schema there? ────────────────────────────────────────────────────

export const REMINDER_SCHEMA_FIELDS = {
  hoa_reminder_log: ["reminder_key", "stage", "result"],
  hoa_organizations: ["timezone"],
  block_settings: ["reminders"],
} as const;

const NEGATIVE_TTL_MS = 60_000;
let cachedSchema: { value: boolean; at: number } | null = null;

/** Has `pnpm create:reminder-log` run? A yes is cached for good, a no for a minute. */
export async function reminderSchema(directus: DirectusLike): Promise<boolean> {
  const t = Date.now();
  if (cachedSchema && (cachedSchema.value || t - cachedSchema.at < NEGATIVE_TTL_MS)) return cachedSchema.value;
  const names = async (collection: string) => {
    const rows = await directus.request(readFieldsByCollection(collection)).catch(() => []);
    return new Set(Array.isArray(rows) ? rows.map((r: any) => r?.field).filter(Boolean) : []);
  };
  const entries = Object.entries(REMINDER_SCHEMA_FIELDS);
  const sets = await Promise.all(entries.map(([c]) => names(c)));
  const value = entries.every(([, fields], i) => fields.every((f) => sets[i]!.has(f)));
  cachedSchema = { value, at: t };
  return value;
}

/** Tests only. */
export function _resetReminderSchemaCache(): void {
  cachedSchema = null;
}
