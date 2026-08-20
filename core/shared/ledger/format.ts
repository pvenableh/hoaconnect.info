/**
 * Turning a stored entry into something a person can read.
 *
 * `summary` is already a sentence, so the feed needs no help with it. `payload`
 * is the machine record, and this is what stops the drill-down from being a
 * `<pre>` block of JSON. The promise in `./entry` is that a reader must not need
 * this codebase to understand a row; a wall of snake_case keys and UUIDs would
 * break that promise while technically keeping it.
 *
 * It is generic on purpose. Every writer's payload has a different shape, and a
 * per-event renderer would be one more thing each new writer has to remember —
 * and one more thing that goes stale when an old row's shape stops matching the
 * renderer written for it. A generic walker renders a five-year-old entry
 * written by a version of this app nobody remembers, which is precisely the
 * case an append-only ledger exists to serve.
 *
 * Pure: no Directus, no H3, no clock. Every function takes the time zone it
 * should format in rather than reading the ambient one, so the same entry
 * renders identically in a test, on the server, and in a browser in Denver.
 */

const MAX_DEPTH = 3;
const MAX_ITEMS = 12;
const MAX_VALUE_CHARS = 240;

/** Keys whose humanized form reads badly or ambiguously. */
const LABELS: Record<string, string> = {
  id: "ID",
  member_id: "Member ID",
  user_id: "User ID",
  organization_name: "Community",
  grace_ends_at: "Grace period ends",
  occurred_at: "Occurred",
  had_grants: "Had permissions",
  outgoing: "Access ended",
  ai_action_id: "AI action ID",
  preset: "Preset",
  added: "Permissions added",
  removed: "Permissions removed",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** snake_case → "Sentence case", with the overrides above taking precedence. */
export function humanizeKey(key: string): string {
  const override = LABELS[key];
  if (override) return override;
  const words = key.replace(/[_-]+/g, " ").trim();
  if (!words) return "Value";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "October 19, 2026" — a date a person reads, in the zone they live in.
 *
 * Returns the input untouched if it is not a date this understands. A row that
 * says `2026-10-19` is worse than one that says "October 19, 2026" but far
 * better than one that says "Invalid Date".
 */
export function formatDate(value: string, timeZone = "UTC"): string {
  if (!ISO_DATE.test(value) && !ISO_DATETIME.test(value)) return value;
  const d = new Date(ISO_DATE.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(d);
}

/** "October 19, 2026 at 12:07 PM" — for the one line under an entry's summary. */
export function formatDateTime(value: string, timeZone = "UTC"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const date = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
  return `${date} at ${time}`;
}

function formatScalar(value: unknown, timeZone: string): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (!value.trim()) return "None";
    const formatted = formatDate(value, timeZone);
    return formatted.length > MAX_VALUE_CHARS
      ? `${formatted.slice(0, MAX_VALUE_CHARS)}…`
      : formatted;
  }
  const json = JSON.stringify(value) ?? String(value);
  return json.length > MAX_VALUE_CHARS ? `${json.slice(0, MAX_VALUE_CHARS)}…` : json;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The best one-line name for an object inside a list: what a human would call it. */
function itemLabel(item: Record<string, unknown>, index: number): { label: string; usedKey?: string } {
  for (const key of ["label", "name", "title", "summary", "email"]) {
    const v = item[key];
    if (typeof v === "string" && v.trim()) return { label: v.trim(), usedKey: key };
  }
  return { label: `Item ${index + 1}` };
}

export interface PayloadRow {
  readonly label: string;
  /** Empty for a group heading whose children follow it. */
  readonly value: string;
  /** 0 for a top-level field; children indent under their parent. */
  readonly depth: number;
}

/**
 * Flatten a payload into indented label/value rows.
 *
 * Lists of scalars collapse onto one line ("Projects, Communications"); lists of
 * objects become a heading plus one indented block per item. Anything deeper
 * than `MAX_DEPTH` or longer than `MAX_ITEMS` is truncated with a row that SAYS
 * it was truncated — silently dropping part of a permanent record would be
 * worse than an ugly row.
 */
export function payloadRows(
  payload: unknown,
  opts: { timeZone?: string } = {}
): readonly PayloadRow[] {
  const timeZone = opts.timeZone ?? "UTC";
  const out: PayloadRow[] = [];

  const walk = (label: string, value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) {
      out.push({ label, value: formatScalar(value, timeZone), depth });
      return;
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        out.push({ label, value: "None", depth });
        return;
      }
      const shown = value.slice(0, MAX_ITEMS);
      const hidden = value.length - shown.length;

      if (shown.every((v) => !isPlainObject(v) && !Array.isArray(v))) {
        const joined = shown.map((v) => formatScalar(v, timeZone)).join(", ");
        out.push({
          label,
          value: hidden ? `${joined} and ${hidden} more` : joined,
          depth,
        });
        return;
      }

      out.push({ label, value: "", depth });
      shown.forEach((item, i) => {
        if (isPlainObject(item)) {
          const { label: name, usedKey } = itemLabel(item, i);
          out.push({ label: name, value: "", depth: depth + 1 });
          for (const [k, v] of Object.entries(item)) {
            if (k === usedKey) continue;
            walk(humanizeKey(k), v, depth + 2);
          }
        } else {
          walk(`Item ${i + 1}`, item, depth + 1);
        }
      });
      if (hidden) out.push({ label: `and ${hidden} more`, value: "", depth: depth + 1 });
      return;
    }

    if (isPlainObject(value)) {
      const keys = Object.keys(value);
      if (!keys.length) {
        out.push({ label, value: "None", depth });
        return;
      }
      out.push({ label, value: "", depth });
      for (const k of keys) walk(humanizeKey(k), value[k], depth + 1);
      return;
    }

    out.push({ label, value: formatScalar(value, timeZone), depth });
  };

  if (!isPlainObject(payload)) {
    if (payload === null || payload === undefined) return [];
    return [{ label: "Record", value: formatScalar(payload, timeZone), depth: 0 }];
  }

  for (const [k, v] of Object.entries(payload)) walk(humanizeKey(k), v, 0);
  return out;
}

export interface LedgerMonthGroup<T> {
  /** `YYYY-MM` in the requested zone — stable, sortable, usable as a key. */
  readonly key: string;
  /** "August 2026" */
  readonly label: string;
  readonly entries: readonly T[];
}

/**
 * Group already-sorted entries by the month they happened in.
 *
 * The zone is a parameter and not a default of "wherever this runs" because a
 * ledger that groups by UTC would file an 8pm entry on the last of the month
 * under the NEXT month while displaying the previous day's date beside it — the
 * kind of small wrongness that makes a permanent record look untrustworthy.
 * The browser passes its own zone; tests pass a fixed one.
 *
 * Order is preserved exactly as given: this groups, it does not sort.
 */
export function groupByMonth<T extends { readonly occurred_at: string }>(
  entries: readonly T[],
  timeZone = "UTC"
): readonly LedgerMonthGroup<T>[] {
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    timeZone,
  });
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  });

  const groups: LedgerMonthGroup<T>[] = [];
  let current: { key: string; label: string; entries: T[] } | null = null;

  for (const entry of entries) {
    const d = new Date(entry.occurred_at);
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? parts.format(d).slice(0, 7) : "unknown";
    const label = valid ? monthLabel.format(d) : "Undated";
    if (!current || current.key !== key) {
      current = { key, label, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }

  return groups;
}
