/**
 * Settings → Reminders (Earnest parity round 3, Phase 5b): what the admin card
 * says about each rule, how a saved form becomes `settings.reminders`, and how
 * 24 hourly dry runs become one sentence. Pure, so the server routes and the
 * card share it and the tests can pin it.
 *
 * Turning a rule on is the board's approval of its copy (the outbound rule: the
 * template is approved once, each send is not a new approval), so
 * `prepareReminderSettings` writes `enabled`, `approved_at` and `approved_by`
 * together, on the server, from the signed-in admin — never from the form.
 */
import {
  REMINDER_RULES,
  RULE_LABELS,
  RULE_STAGES,
  DEFAULT_DAYS,
  resolveReminderSettings,
  intIn,
  obj,
  text,
  SEND_HOUR_MAX,
  SEND_HOUR_MIN,
  type ReminderCopy,
  type ReminderRule,
  type ReminderRuleSettings,
  type ReminderSettings,
} from "./settings";

/** Rules whose `days` the board can change (the others have fixed windows). */
export const RULES_WITH_DAYS: readonly ReminderRule[] = ["dues", "violation", "coverage", "request"];
const DAYS_MAX = 60;

export interface RuleGuide {
  /** "Who gets it, and when" — one sentence under the toggle. */
  summary: string;
  /** What `days` means for this rule. */
  daysLabel?: string;
  /** The `{{tokens}}` the copy may use. */
  tokens: string[];
  stages: Record<string, string>;
}

export const RULE_GUIDE: Record<ReminderRule, RuleGuide> = {
  dues: {
    summary: "The billed member and the unit's owners hear about a charge before it is due, on the day, and after the grace period. Email, bell and push; they can't unsubscribe from it.",
    daysLabel: "Days before the due date",
    tokens: ["amount", "due", "count", "label"],
    stages: { before: "Before it's due", due: "On the due date", overdue: "After the grace period" },
  },
  meeting: {
    summary: "Everyone a published meeting is for: a week out, the day before, and a push an hour before.",
    tokens: ["title", "when", "time", "date", "location"],
    stages: { week: "A week before", day: "The day before", hour: "An hour before (push only)" },
  },
  request: {
    summary: "The person who submitted a request hears when its status changes; the assignee gets a bell nudge when it goes quiet.",
    daysLabel: "Quiet days before the assignee is nudged",
    tokens: ["title", "status", "days", "since"],
    stages: { status: "When the status changes", stale: "When it goes quiet (assignee)" },
  },
  violation: {
    summary: "The member a violation is about, before and on its correction date. Email, bell and push; they can't unsubscribe from it.",
    daysLabel: "Days before the correction date",
    tokens: ["title", "cure_by", "days_left"],
    stages: { before: "Before the correction date", due: "On the correction date" },
  },
  poll: {
    summary: "Residents a poll is for: when it opens, as it closes (only those who haven't voted), and with the result.",
    tokens: ["question", "closes", "result"],
    stages: { opened: "When it opens", closing: "Closing soon", closed: "With the result" },
  },
  coverage: {
    summary: "Admins get a bell note when a vendor's contract or insurance is about to end, and after it has.",
    daysLabel: "Days before it ends",
    tokens: ["vendor", "ends", "days_left"],
    stages: { before: "Before it ends", expired: "After it ended" },
  },
};

/** "14 dues reminders", "1 vendor coverage reminder". */
const RULE_NOUN: Record<ReminderRule, string> = {
  dues: "dues",
  meeting: "meeting",
  request: "request",
  violation: "violation",
  poll: "poll",
  coverage: "vendor coverage",
};

// ── The form → what is stored ───────────────────────────────────────────────

const copyOf = (v: unknown): ReminderCopy | null => {
  const c = obj(v);
  const subject = text(c?.subject);
  const intro = text(c?.intro);
  return subject || intro ? { subject, intro } : null;
};

const sameCopy = (a: ReminderCopy | null, b: ReminderCopy | null) =>
  (a?.subject ?? null) === (b?.subject ?? null) && (a?.intro ?? null) === (b?.intro ?? null);

export interface ReminderApprover {
  userId: string;
  /** ISO time of the save. */
  now: string;
}

/**
 * The value to store in `block_settings.reminders`: `current` with the form's
 * `patch` laid over it (`{ send_hour?, rules?: { <rule>: { enabled?, stages?,
 * days?, tenants?, copy? } } }`), normalised — unknown rules, stages and keys
 * are dropped, numbers clamped. A rule the patch doesn't mention keeps what it
 * had.
 *
 * Approval: a rule that is on carries `approved_at` / `approved_by`. They are
 * stamped when the rule goes from off to on, when its copy changes while it is
 * on (the board is approving new words), and when an enabled rule has none;
 * otherwise the earlier approval stays. A rule that is off carries none.
 */
export function prepareReminderSettings(current: unknown, patch: unknown, who: ReminderApprover): ReminderSettings {
  const cur = resolveReminderSettings(current);
  const curRules = obj(obj(current)?.rules) ?? {};
  const p = obj(patch) ?? {};
  const pRules = obj(p.rules) ?? {};

  const rules: Partial<Record<ReminderRule, ReminderRuleSettings>> = {};
  for (const rule of REMINDER_RULES) {
    const prev = cur.rules[rule];
    const prevRaw = obj(curRules[rule]) ?? {};
    const r = obj(pRules[rule]) ?? {};
    const rStages = obj(r.stages) ?? {};

    const enabled = r.enabled === undefined ? prev.enabled : r.enabled === true;
    const stagesOff: Record<string, boolean> = {};
    for (const stage of RULE_STAGES[rule]) {
      const on = rStages[stage] === undefined ? prev.stages[stage] : rStages[stage] !== false;
      if (!on) stagesOff[stage] = false;
    }
    const copy = r.copy === undefined ? prev.copy : copyOf(r.copy);

    const next: ReminderRuleSettings = { enabled };
    if (Object.keys(stagesOff).length) next.stages = stagesOff;
    if (RULES_WITH_DAYS.includes(rule)) next.days = intIn(r.days ?? prev.days, 1, DAYS_MAX, DEFAULT_DAYS[rule]);
    if (rule === "dues") next.tenants = r.tenants === undefined ? prev.tenants : r.tenants === true;
    if (copy) next.copy = copy;

    if (enabled) {
      const keep = prev.enabled && sameCopy(prev.copy, copy) && typeof prevRaw.approved_at === "string" && prevRaw.approved_at;
      next.approved_at = keep ? prevRaw.approved_at : who.now;
      next.approved_by = keep ? (typeof prevRaw.approved_by === "string" ? prevRaw.approved_by : who.userId) : who.userId;
    }
    rules[rule] = next;
  }

  return { send_hour: intIn(p.send_hour ?? cur.sendHour, SEND_HOUR_MIN, SEND_HOUR_MAX, cur.sendHour), rules };
}

// ── 24 hours of dry runs → one answer ───────────────────────────────────────

/** The part of a dry-run `ReminderOrgResult` the summary reads. */
export interface DryRunInput {
  wouldSendGroups?: Array<{ group: string; subject: string; recipients: number }>;
  off?: Record<string, number>;
  unreachable?: Record<string, number>;
}

export interface DryRunSummary {
  /** How many hourly runs were folded in. */
  hours: number;
  /** Notifications: a member's dues at one stage is one, a meeting's invitees are one. */
  total: number;
  /** "14 dues reminders, 1 meeting reminder" — or the sentence for nothing. */
  headline: string;
  rules: Array<{ rule: ReminderRule; label: string; count: number; recipients: number }>;
  /** What rules that are off would have sent. */
  off: Array<{ rule: ReminderRule; label: string; count: number; text: string }>;
  /** Due, with nobody to send to (no app account). */
  unreachable: Array<{ rule: ReminderRule; label: string; count: number; text: string }>;
  /** What goes out, in rule order; capped. */
  notifications: Array<{ rule: ReminderRule; subject: string; recipients: number }>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ruleOf = (key: string): ReminderRule | null => {
  const rule = key.split(/[:.]/)[0] as ReminderRule;
  return (REMINDER_RULES as readonly string[]).includes(rule) ? rule : null;
};

/**
 * Fold the dry runs of consecutive hours. A reminder inside a window is listed
 * by every hour of it, so a notification is counted once per `group` (the most
 * recipients any hour saw), and `off` / `unreachable` — which carry counts, not
 * keys — take the largest count any hour saw per `rule.stage`, then add the
 * stages of a rule up.
 */
export function summarizeDryRuns(runs: DryRunInput[], opts: { cap?: number } = {}): DryRunSummary {
  const groups = new Map<string, { rule: ReminderRule; subject: string; recipients: number }>();
  const off = new Map<string, number>();
  const unreachable = new Map<string, number>();

  for (const run of runs) {
    for (const g of run.wouldSendGroups ?? []) {
      const rule = ruleOf(g.group);
      if (!rule) continue;
      const seen = groups.get(g.group);
      if (!seen || g.recipients > seen.recipients) groups.set(g.group, { rule, subject: g.subject, recipients: g.recipients });
    }
    for (const [k, n] of Object.entries(run.off ?? {})) off.set(k, Math.max(off.get(k) ?? 0, n));
    for (const [k, n] of Object.entries(run.unreachable ?? {})) unreachable.set(k, Math.max(unreachable.get(k) ?? 0, n));
  }

  const rules = REMINDER_RULES.flatMap((rule) => {
    const mine = [...groups.values()].filter((g) => g.rule === rule);
    return mine.length ? [{ rule, label: RULE_LABELS[rule], count: mine.length, recipients: mine.reduce((s, g) => s + g.recipients, 0) }] : [];
  });
  const total = rules.reduce((s, r) => s + r.count, 0);

  const perRule = (m: Map<string, number>) => {
    const sums = new Map<ReminderRule, number>();
    for (const [k, n] of m) {
      const rule = ruleOf(k);
      if (rule && n > 0) sums.set(rule, (sums.get(rule) ?? 0) + n);
    }
    return REMINDER_RULES.filter((r) => sums.has(r)).map((rule) => ({ rule, label: RULE_LABELS[rule], count: sums.get(rule)! }));
  };

  return {
    hours: runs.length,
    total,
    headline: total
      ? rules.map((r) => plural(r.count, `${RULE_NOUN[r.rule]} reminder`)).join(", ")
      : `Nothing is scheduled to go out in the next ${runs.length || 24} hours.`,
    rules,
    off: perRule(off).map((r) => ({
      ...r,
      text: `${plural(r.count, "reminder")} would go out if ${r.label.toLowerCase()} reminders were on.`,
    })),
    unreachable: perRule(unreachable).map((r) => ({
      ...r,
      text:
        r.rule === "dues"
          ? `${r.count} ${r.count === 1 ? "has" : "have"} no app account — the billing worker emails them.`
          : `${r.count} ${r.count === 1 ? "has" : "have"} no app account, so ${r.count === 1 ? "it" : "they"} can't be reached here.`,
    })),
    notifications: [...groups.values()]
      .sort((a, b) => REMINDER_RULES.indexOf(a.rule) - REMINDER_RULES.indexOf(b.rule) || a.subject.localeCompare(b.subject))
      .slice(0, opts.cap ?? 25),
  };
}
