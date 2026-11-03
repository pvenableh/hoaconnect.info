/**
 * Reminder settings (Earnest parity round 3, Phase 5a): the shape of
 * `organization.settings.reminders` (`block_settings.reminders`, json) and its
 * defaults. Phase 5b's Settings → Reminders writes it; the tick reads it
 * through `resolveReminderSettings`, which never throws on a bad value.
 *
 *   {
 *     "send_hour": 9,                       // local hour day-based reminders go out (6–20)
 *     "rules": {
 *       "dues":      { "enabled": true, "days": 7, "tenants": false,
 *                      "stages": { "overdue": false },
 *                      "approved_at": "2026-11-03T15:00:00Z", "approved_by": "<user id>",
 *                      "copy": { "subject": "…", "intro": "…" } },
 *       "meeting":   { "enabled": true },
 *       …
 *     }
 *   }
 *
 * EVERY RULE IS OFF until `enabled: true`. Reminders reach residents' inboxes
 * in the board's name, so the board turns each one on — in 5b that is the same
 * click that approves its copy (the outbound rule: the template is approved
 * once, each send is not a new approval). Nothing goes out on deploy.
 *
 * A stage missing from `stages` is on; `days` is the lead time of the `before`
 * stage (dues 7, violation 3, coverage 30) or, for requests, the quiet days
 * before the assignee is nudged (7).
 */

export const REMINDER_RULES = ["dues", "meeting", "request", "violation", "poll", "coverage"] as const;
export type ReminderRule = (typeof REMINDER_RULES)[number];

export const RULE_STAGES = {
  dues: ["before", "due", "overdue"],
  meeting: ["week", "day", "hour"],
  request: ["status", "stale"],
  violation: ["before", "due"],
  poll: ["opened", "closing", "closed"],
  coverage: ["before", "expired"],
} as const satisfies Record<ReminderRule, readonly string[]>;
export type ReminderStage = (typeof RULE_STAGES)[ReminderRule][number];

export const RULE_LABELS: Record<ReminderRule, string> = {
  dues: "Dues",
  meeting: "Meetings",
  request: "Requests",
  violation: "Violations",
  poll: "Polls",
  coverage: "Vendor coverage",
};

/** The local hour day-based reminders go out at, when the org hasn't chosen one. */
export const DEFAULT_SEND_HOUR = 9;
/** The send hour is clamped to this range: nobody wants a dues reminder at 3 am. */
export const SEND_HOUR_MIN = 6;
export const SEND_HOUR_MAX = 20;
/** No reminder goes out at or after this local hour (the meeting-in-an-hour push excepted). */
export const QUIET_FROM_HOUR = 21;

export const DEFAULT_DAYS: Record<ReminderRule, number> = {
  dues: 7,
  meeting: 7,
  request: 7,
  violation: 3,
  poll: 1,
  coverage: 30,
};
const DAYS_MAX = 60;

export interface ReminderCopy {
  /** Replaces the subject. `{{name}}` tokens are the template's vars. */
  subject?: string | null;
  /** Replaces the first sentence of the body. */
  intro?: string | null;
}

export interface ReminderRuleSettings {
  enabled?: boolean;
  /** Stages turned off; a missing key means on. */
  stages?: Partial<Record<string, boolean>>;
  days?: number;
  /** Dues: the unit's tenants too (the billed member and owners always). */
  tenants?: boolean;
  /** Set by 5b when the board approves this rule's copy. */
  approved_at?: string | null;
  approved_by?: string | null;
  copy?: ReminderCopy | null;
}

export interface ReminderSettings {
  send_hour?: number;
  rules?: Partial<Record<ReminderRule, ReminderRuleSettings>>;
}

export interface ResolvedRuleSettings {
  enabled: boolean;
  stages: Record<string, boolean>;
  days: number;
  tenants: boolean;
  copy: ReminderCopy | null;
}

export interface ResolvedReminderSettings {
  sendHour: number;
  rules: Record<ReminderRule, ResolvedRuleSettings>;
}

const obj = (v: unknown): Record<string, any> | null => {
  if (typeof v === "string") {
    try {
      return obj(JSON.parse(v));
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : null;
};

const intIn = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

/** The settings with every default filled in. Accepts the raw json (object or string) or nothing. */
export function resolveReminderSettings(raw: unknown): ResolvedReminderSettings {
  const s = obj(raw) ?? {};
  const rules = obj(s.rules) ?? {};
  const out = {} as Record<ReminderRule, ResolvedRuleSettings>;
  for (const rule of REMINDER_RULES) {
    const r = obj(rules[rule]) ?? {};
    const stagesRaw = obj(r.stages) ?? {};
    const stages: Record<string, boolean> = {};
    for (const stage of RULE_STAGES[rule]) stages[stage] = stagesRaw[stage] !== false;
    const copy = obj(r.copy);
    const subject = text(copy?.subject);
    const intro = text(copy?.intro);
    out[rule] = {
      enabled: r.enabled === true,
      stages,
      days: intIn(r.days, 1, DAYS_MAX, DEFAULT_DAYS[rule]),
      tenants: r.tenants === true,
      copy: subject || intro ? { subject, intro } : null,
    };
  }
  return { sendHour: intIn(s.send_hour, SEND_HOUR_MIN, SEND_HOUR_MAX, DEFAULT_SEND_HOUR), rules: out };
}

/** Is any rule on? The tick skips an org with none (and loads nothing for it). */
export function anyReminderEnabled(settings: ResolvedReminderSettings): boolean {
  return REMINDER_RULES.some((r) => settings.rules[r].enabled);
}
