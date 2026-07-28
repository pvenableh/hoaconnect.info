// The "what the AI can see" model — the transparency layer. Turns the current
// grounding sources into a togglable list the user can inspect and switch off,
// so a conversation's knowledge is never a black box. Coarse keys mirror the
// server's grounding blocks:
//   organization → org profile + announcements + rules + brand/amenities/board
//   documents    → governing documents & bylaws (RAG, searched on demand)
//   entity       → the focused record's dossier (member/vendor/project/…)
//
// Framework-free so it's unit-testable. The composable (useAiAwareness) wires it
// to the live context; the chat route enforces the toggles server-side.

export type AwarenessKey = "organization" | "documents" | "entity";

export interface AwareItem {
  key: AwarenessKey;
  /** lucide icon name for the chip row. */
  icon: string;
  /** Human description of what this source contributes. */
  label: string;
  /** Whether it's currently included (not toggled off). */
  included: boolean;
}

/** Per-entity descriptions of what the focused dossier contributes. */
const ENTITY_KNOWLEDGE: Record<string, string> = {
  member: "This member — contact, payments, household & open requests",
  vendor: "This vendor — category, contacts & projects worked",
  project: "This project — timeline, tasks & budget",
  request: "This item — status, subject member, assignee & comments",
  violation: "This violation — status, subject member & comments",
  ticket: "This ticket — status, assignee & comments",
  meeting: "This meeting — agenda, date & attendance",
  channel: "This channel — linked ticket, members & recent messages",
};

export function entityKnowledgeLabel(entityType: string): string {
  return ENTITY_KNOWLEDGE[entityType] || `This ${entityType} — its record details`;
}

/**
 * Build the awareness list for the current turn. `excluded` are the keys the
 * user has toggled OFF. `documents` only appears when RAG is available, and
 * `entity` only when a record is focused — so the list reflects exactly what
 * would ground this conversation.
 */
export function buildAwareness(opts: {
  entityType?: string | null;
  ragAvailable?: boolean;
  excluded?: Set<string> | string[];
}): AwareItem[] {
  const excluded = opts.excluded instanceof Set ? opts.excluded : new Set(opts.excluded || []);
  const items: AwareItem[] = [
    {
      key: "organization",
      icon: "lucide:building-2",
      label: "This association — profile, announcements, rules, amenities & board",
      included: !excluded.has("organization"),
    },
  ];
  if (opts.ragAvailable) {
    items.push({
      key: "documents",
      icon: "lucide:file-text",
      label: "Governing documents & bylaws (searched on demand)",
      included: !excluded.has("documents"),
    });
  }
  if (opts.entityType) {
    items.push({
      key: "entity",
      icon: "lucide:crosshair",
      label: entityKnowledgeLabel(opts.entityType),
      included: !excluded.has("entity"),
    });
  }
  return items;
}

/** The keys currently toggled OFF among the visible items (what to send/gate). */
export function excludedKeysOf(items: AwareItem[]): AwarenessKey[] {
  return items.filter((i) => !i.included).map((i) => i.key);
}
