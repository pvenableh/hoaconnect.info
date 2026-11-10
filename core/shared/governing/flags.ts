/**
 * Statute flags: the five relationships (spec §5). Never a yes/no.
 * `counsel_review` comes first everywhere and is shown most prominently.
 * The labels are the spec's own words.
 */
import type { FlagStatus, GovFlag, GovReference, Relationship, Severity } from "./types";

export const RELATIONSHIP_ORDER: Relationship[] = ["counsel_review", "statute_controls", "statute_supplements", "document_controls", "consistent"];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  counsel_review: "Ask counsel.",
  statute_controls: "State law now governs this point.",
  statute_supplements: "State law adds requirements.",
  document_controls: "Your documents govern.",
  consistent: "Consistent with state law.",
};

export const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "info"];

/** Shown on every flag view (spec §5, "Never legal advice"). */
export const FLAG_NOTICE = "A working comparison, not legal advice. Confirm with association counsel before relying on it.";

/** counsel_review first, then by severity, then by topic. */
export function sortFlags<T extends Pick<GovFlag, "relationship" | "severity" | "topic">>(flags: T[]): T[] {
  return [...flags].sort(
    (a, b) =>
      RELATIONSHIP_ORDER.indexOf(a.relationship) - RELATIONSHIP_ORDER.indexOf(b.relationship) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (a.topic ?? "").localeCompare(b.topic ?? "")
  );
}

export function countByRelationship(flags: Array<Pick<GovFlag, "relationship">>): Record<Relationship, number> {
  const counts = Object.fromEntries(RELATIONSHIP_ORDER.map((r) => [r, 0])) as Record<Relationship, number>;
  for (const f of flags) if (f.relationship in counts) counts[f.relationship]++;
  return counts;
}

export const SEVERITY_LABELS: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };

export const FLAG_STATUS_LABELS: Record<FlagStatus, string> = {
  suggested: "Suggested, not confirmed",
  confirmed: "Confirmed by the board",
  counsel_confirmed: "Confirmed by counsel",
  dismissed: "Dismissed",
};

/** The statuses a manager may set. `suggested` is where a flag starts, never where it is put back. */
export const SETTABLE_FLAG_STATUSES = ["confirmed", "dismissed", "counsel_confirmed"] as const satisfies readonly FlagStatus[];
export type SettableFlagStatus = (typeof SETTABLE_FLAG_STATUSES)[number];

/** What a manager may do with a flag in each status. */
export const FLAG_STATUS_ACTIONS: Record<FlagStatus, SettableFlagStatus[]> = {
  suggested: ["confirmed", "dismissed"],
  confirmed: ["counsel_confirmed", "dismissed"],
  counsel_confirmed: ["dismissed"],
  dismissed: ["confirmed"],
};

// ── Freshness (spec §5): references not checked within a set age ────────────

/** Default age, in days, after which a statute reference should be read again. */
export const STALE_AFTER_DAYS = 365;

export type StaleReason = "never_checked" | "recheck_noted" | "old";

export const STALE_REASON_LABELS: Record<StaleReason, string> = {
  never_checked: "No checked date",
  recheck_noted: "Edition marked for recheck",
  old: "Checked too long ago",
};

/**
 * Why a reference needs reading again, or null when it is fresh. A reference is
 * stale when it has no checked date, when the person who read it wrote
 * "recheck" in the edition (three seed sources carry that), or when the checked
 * date is older than `maxAgeDays`.
 */
export function referenceStaleness(
  reference: Pick<GovReference, "edition" | "checked_on">,
  today: Date,
  maxAgeDays: number = STALE_AFTER_DAYS
): StaleReason | null {
  if (/\brecheck\b/i.test(reference.edition ?? "")) return "recheck_noted";
  if (!reference.checked_on) return "never_checked";
  const checked = Date.parse(reference.checked_on);
  if (Number.isNaN(checked)) return "never_checked";
  return today.getTime() - checked > maxAgeDays * 86_400_000 ? "old" : null;
}

/** Each stale reference the flags cite, once, with how many flags cite it. Oldest check first. */
export function staleReferences(flags: Array<Pick<GovFlag, "references">>, today: Date, maxAgeDays: number = STALE_AFTER_DAYS) {
  const found = new Map<string, { reference: GovReference; reason: StaleReason; flag_count: number }>();
  for (const flag of flags) {
    for (const reference of flag.references) {
      const reason = referenceStaleness(reference, today, maxAgeDays);
      if (!reason) continue;
      const entry = found.get(reference.id);
      if (entry) entry.flag_count++;
      else found.set(reference.id, { reference, reason, flag_count: 1 });
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      String(a.reference.checked_on ?? "").localeCompare(String(b.reference.checked_on ?? "")) ||
      String(a.reference.code ?? "").localeCompare(String(b.reference.code ?? ""))
  );
}
