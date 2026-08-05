/**
 * Unified notification preferences — ONE model for both immediate notifications
 * (per-category email + in-app "bell") AND the daily/weekly digest email.
 *
 * Stored as a single JSON field `directus_users.notification_preferences`; the
 * master email kill-switch is the existing `directus_users.email_notifications`
 * boolean. This deliberately unifies what would otherwise scatter across
 * collections — everything a member controls about notifications lives here.
 *
 * Semantics are OPT-IN: a missing key means the channel is ON. `_all: false`
 * mutes every channel and category. All logic here is pure + timezone-agnostic
 * (the caller passes the user's already-resolved local hour/weekday), so it's
 * unit-testable and shared by the settings UI, the send path, and the digest cron.
 */

export const NOTIFICATION_CATEGORIES = [
  { key: "announcement", label: "Announcements" },
  { key: "meeting", label: "Meetings" },
  { key: "payment", label: "Payments & dues" },
  { key: "document", label: "Documents" },
  { key: "request", label: "Requests" },
  { key: "task", label: "Tasks" },
  { key: "mention", label: "Mentions" },
  { key: "comment", label: "Comments" },
  { key: "membership", label: "Membership" },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key) as NotificationCategory[];

export type DigestCadence = "daily" | "weekdays" | "weekly" | "off";

export const DIGEST_SECTIONS = [
  { key: "announcements", label: "New announcements" },
  { key: "meetings", label: "Upcoming meetings" },
  { key: "payments", label: "Dues & payments due" },
  { key: "documents", label: "New documents" },
  { key: "requests", label: "Open requests & tasks" },
] as const;

export type DigestSection = (typeof DIGEST_SECTIONS)[number]["key"];

const SECTION_KEYS = DIGEST_SECTIONS.map((s) => s.key) as DigestSection[];

/**
 * The stored JSON blob. Category channels are `<category>` (email) and
 * `<category>_bell` (in-app), each defaulting to on; the digest fields live in
 * the same object. Typed loosely because it's a free-form JSON column.
 */
export interface NotificationPreferences {
  /** Master mute across every channel + category (false = muted). */
  _all?: boolean;
  digest_enabled?: boolean;
  digest_cadence?: DigestCadence;
  /** Local send hour, 0–23. */
  digest_hour?: number;
  digest_sections?: DigestSection[];
  /** `<category>` and `<category>_bell` booleans (missing = on). */
  [key: string]: unknown;
}

export const DIGEST_DEFAULTS = {
  enabled: false,
  cadence: "weekly" as DigestCadence,
  hour: 8,
  sections: [...SECTION_KEYS],
};

// ── Immediate-notification gating ────────────────────────────────────────────

/** True when the user has muted everything (`_all: false`). */
export function allMuted(prefs?: NotificationPreferences | null): boolean {
  return prefs?._all === false;
}

/**
 * May we send an EMAIL for this category? Respects the master email kill-switch
 * (`email_notifications`), the master mute (`_all`), and the per-category opt-out
 * (default on).
 */
export function emailAllowed(
  prefs: NotificationPreferences | null | undefined,
  emailNotifications: boolean | null | undefined,
  category: NotificationCategory
): boolean {
  if (emailNotifications === false) return false;
  if (allMuted(prefs)) return false;
  return prefs?.[category] !== false;
}

/** May we show an in-app (bell) notification for this category? */
export function bellAllowed(
  prefs: NotificationPreferences | null | undefined,
  category: NotificationCategory
): boolean {
  if (allMuted(prefs)) return false;
  return prefs?.[`${category}_bell`] !== false;
}

// ── Digest ───────────────────────────────────────────────────────────────────

export function digestEnabled(prefs?: NotificationPreferences | null): boolean {
  return prefs?.digest_enabled === true;
}

export function digestCadence(prefs?: NotificationPreferences | null): DigestCadence {
  const c = prefs?.digest_cadence;
  return c === "daily" || c === "weekdays" || c === "weekly" || c === "off"
    ? c
    : DIGEST_DEFAULTS.cadence;
}

export function digestHour(prefs?: NotificationPreferences | null): number {
  const h = Number(prefs?.digest_hour);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DIGEST_DEFAULTS.hour;
}

export function digestSections(prefs?: NotificationPreferences | null): DigestSection[] {
  const s = prefs?.digest_sections;
  if (Array.isArray(s)) {
    const filtered = s.filter((k): k is DigestSection => SECTION_KEYS.includes(k as DigestSection));
    return filtered.length ? filtered : DIGEST_DEFAULTS.sections;
  }
  return DIGEST_DEFAULTS.sections;
}

/**
 * Should this user's digest fire now? The caller passes the user's local hour
 * (0–23) and weekday (0=Sun … 6=Sat), computed from their timezone. `weekly`
 * fires Mondays only; `weekdays` skips Sat/Sun; `off`/disabled never fire.
 */
export function shouldSendDigest(
  prefs: NotificationPreferences | null | undefined,
  localHour: number,
  localDow: number
): boolean {
  if (!digestEnabled(prefs)) return false;
  const cadence = digestCadence(prefs);
  if (cadence === "off") return false;
  if (localHour !== digestHour(prefs)) return false;
  if (cadence === "weekly") return localDow === 1;
  if (cadence === "weekdays") return localDow >= 1 && localDow <= 5;
  return true; // daily
}

// ── Sanitization (write path) ────────────────────────────────────────────────

/**
 * Coerce arbitrary client input into a well-formed preferences blob: only known
 * keys, correct types. Keeps the JSON column tidy and injection-free.
 */
export function sanitizePreferences(input: unknown): NotificationPreferences {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: NotificationPreferences = {};

  if (typeof src._all === "boolean") out._all = src._all;

  for (const cat of CATEGORY_KEYS) {
    if (typeof src[cat] === "boolean") out[cat] = src[cat] as boolean;
    const bell = `${cat}_bell`;
    if (typeof src[bell] === "boolean") out[bell] = src[bell] as boolean;
  }

  if (typeof src.digest_enabled === "boolean") out.digest_enabled = src.digest_enabled;
  if (
    src.digest_cadence === "daily" ||
    src.digest_cadence === "weekdays" ||
    src.digest_cadence === "weekly" ||
    src.digest_cadence === "off"
  ) {
    out.digest_cadence = src.digest_cadence;
  }
  const h = Number(src.digest_hour);
  if (Number.isInteger(h) && h >= 0 && h <= 23) out.digest_hour = h;
  if (Array.isArray(src.digest_sections)) {
    out.digest_sections = src.digest_sections.filter((k): k is DigestSection =>
      SECTION_KEYS.includes(k as DigestSection)
    );
  }

  return out;
}
