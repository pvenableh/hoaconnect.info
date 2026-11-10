/**
 * Statute flags: the five relationships (spec §5). Never a yes/no.
 * `counsel_review` comes first everywhere and is shown most prominently.
 * The labels are the spec's own words.
 */
import type { GovFlag, Relationship, Severity } from "./types";

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
