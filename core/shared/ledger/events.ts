/**
 * The event catalogue — every kind of thing the Community Ledger records, as
 * data rather than as `switch` statements scattered across the writers.
 *
 * A descriptor answers three questions a writer and a reader both need:
 *
 *   1. **What is this called in English?** (`label`, `icon`, `category`) — so a
 *      board reading the feed sees "Manager permissions changed" and not
 *      `manager_grants_changed`.
 *   2. **Who may see it?** (`defaultVisibility`) — decided ONCE, here, instead
 *      of by whoever happens to be writing the entry. Phase 4 let its writer
 *      pass a string; that does not survive a second writer, let alone a sixth.
 *   3. **Is it record at all?** — if a thing you want to log has no entry here,
 *      the first question is whether it belongs in the ledger at all. See the
 *      header of `./entry` for where that line sits.
 *
 * `event_type` is a plain string column, NOT a database enum, so adding a key
 * here is the whole of adding an event type — no migration, and an older client
 * meeting a newer row renders it generically via `descriptorFor`'s fallback
 * rather than failing.
 *
 * Entries appear in this catalogue before their writer exists. That is
 * deliberate: the catalogue is the plan for Phase 5's remaining writers, and a
 * reader that already knows how to label an event type can render rows written
 * by a deploy that is ahead of it.
 *
 * Pure: no Directus, no H3, no clock.
 */

import type { LedgerVisibility } from "./entry";

/**
 * The lens a reader filters by. Coarser than the event types on purpose — a
 * board member scanning a year of history thinks in "money" and "who had
 * access", not in eleven event names.
 */
export type LedgerCategory =
  | "management"
  | "access"
  | "money"
  | "records"
  | "governance"
  | "ai";

export interface LedgerCategoryDescriptor {
  readonly key: LedgerCategory;
  readonly label: string;
  readonly icon: string;
}

/** Ordered as they should appear as filters: the account first, the day-to-day after. */
export const LEDGER_CATEGORIES: readonly LedgerCategoryDescriptor[] = [
  { key: "management", label: "Management", icon: "building-2" },
  { key: "access", label: "Access", icon: "key-round" },
  { key: "money", label: "Money", icon: "banknote" },
  { key: "records", label: "Records", icon: "file-text" },
  { key: "governance", label: "Decisions", icon: "gavel" },
  { key: "ai", label: "AI", icon: "sparkles" },
];

export interface LedgerEventDescriptor {
  readonly key: string;
  /** Sentence-case, for a chip and a row heading. */
  readonly label: string;
  /** lucide icon name, no `i-lucide-` prefix. */
  readonly icon: string;
  readonly category: LedgerCategory;
  /**
   * Who may see entries of this type unless the writer has a specific reason to
   * narrow it. Writers should take this rather than hardcode a string.
   */
  readonly defaultVisibility: LedgerVisibility;
  /** Why this type exists, for the next person deciding whether theirs belongs. */
  readonly note: string;
}

const CATALOGUE = [
  {
    key: "management_transition",
    label: "Management transition",
    icon: "arrow-left-right",
    category: "management",
    defaultVisibility: "owners",
    note: "A community changed who runs it. The single event an association is most likely to need to prove years later.",
  },
  {
    key: "manager_onboarded",
    label: "Manager added",
    icon: "user-plus",
    category: "access",
    defaultVisibility: "owners",
    note: "A property manager was given a seat and a set of grants.",
  },
  {
    key: "admin_promoted",
    label: "Administrator promoted",
    icon: "shield-check",
    category: "access",
    defaultVisibility: "owners",
    note: "Someone gained the administrator role for the community.",
  },
  {
    key: "manager_grants_changed",
    label: "Manager permissions changed",
    icon: "key-round",
    category: "access",
    defaultVisibility: "owners",
    // Owner-visible because VISION names grant changes explicitly: who is
    // allowed to act for a community, on whose authority, is the community's
    // business. The entry records which permissions moved, never why.
    note: "A property manager's permissions were widened or narrowed.",
  },
  {
    key: "payment_recorded",
    label: "Payment recorded",
    icon: "receipt",
    category: "money",
    // Board-only, and this is the one default that must not be relaxed
    // casually: a single payment names one household. VISION's first listed
    // risk is a delinquency-shaming incident. Aggregate money is owner-visible
    // through the reporting ledger; individual payments are not.
    defaultVisibility: "board",
    note: "A payment was posted against one member's account. Names a household — board-only.",
  },
  {
    key: "expense_recorded",
    label: "Expense recorded",
    icon: "banknote",
    category: "money",
    defaultVisibility: "owners",
    note: "Community money went out. Where the dues went is exactly what owners are entitled to see.",
  },
  {
    key: "document_published",
    label: "Document published",
    icon: "file-text",
    category: "records",
    defaultVisibility: "owners",
    note: "A document became part of the community's library. Publishing is the outcome; drafts are not record.",
  },
  {
    key: "meeting_minutes_published",
    label: "Minutes published",
    icon: "calendar-check",
    category: "records",
    defaultVisibility: "owners",
    note: "Minutes for a meeting were published. The minutes are the record; the meeting's discussion is not.",
  },
  {
    key: "poll_closed",
    label: "Vote decided",
    icon: "gavel",
    category: "governance",
    defaultVisibility: "owners",
    note: "A poll or vote reached its outcome. The outcome and the tally, never who voted which way.",
  },
  {
    key: "ai_action_executed",
    label: "AI action carried out",
    icon: "sparkles",
    category: "ai",
    defaultVisibility: "owners",
    note: "An approved AI action ran. 'Auditable AI' is only a claim if the executions are visible.",
  },
  {
    key: "ai_action_undone",
    label: "AI action undone",
    icon: "undo-2",
    category: "ai",
    defaultVisibility: "owners",
    // Its own type rather than a second meaning for `ai_action_executed`.
    // Without it the ledger would say the assistant did a thing and stop there,
    // while a human had reversed it two minutes later — a record that is
    // technically true and materially misleading. Corrections are new entries.
    note: "An executed AI action was reversed. Visible wherever the execution was, or the record misleads.",
  },
] as const satisfies readonly LedgerEventDescriptor[];

export const LEDGER_EVENTS: readonly LedgerEventDescriptor[] = CATALOGUE;

/** The known event types. Writers should use this; readers must not require it. */
export type LedgerEventType = (typeof CATALOGUE)[number]["key"];

const BY_KEY: ReadonlyMap<string, LedgerEventDescriptor> = new Map(
  CATALOGUE.map((e) => [e.key as string, e as LedgerEventDescriptor])
);

/** snake_case → "Sentence case", for a type this build has never heard of. */
function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  if (!words) return "Recorded";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The descriptor for an event type, or a generic one for a type written by a
 * newer deploy. Never throws and never returns undefined: a row this client
 * cannot name is still a row in the community's history, and dropping it would
 * be the worst possible failure mode for an append-only record.
 *
 * The fallback is `board`-visible, which is the conservative direction: an
 * unknown event shown to fewer people is a smaller mistake than one shown to
 * more.
 */
export function descriptorFor(eventType: string | null | undefined): LedgerEventDescriptor {
  const key = (eventType ?? "").trim();
  const known = BY_KEY.get(key);
  if (known) return known;
  return {
    key: key || "unknown",
    label: humanize(key),
    icon: "circle-dot",
    category: "records",
    defaultVisibility: "board",
    note: "Recorded by a newer version of the app than this one.",
  };
}

/** The visibility a writer should use for an event type unless it has a reason not to. */
export function defaultVisibilityFor(eventType: string): LedgerVisibility {
  return descriptorFor(eventType).defaultVisibility;
}

export function categoryFor(eventType: string): LedgerCategory {
  return descriptorFor(eventType).category;
}

export function categoryDescriptor(key: LedgerCategory): LedgerCategoryDescriptor {
  return (
    LEDGER_CATEGORIES.find((c) => c.key === key) ?? {
      key,
      label: humanize(key),
      icon: "circle-dot",
    }
  );
}

/** Event types belonging to a category — how a category filter becomes a query. */
export function eventTypesInCategory(category: LedgerCategory): readonly string[] {
  return CATALOGUE.filter((e) => e.category === category).map((e) => e.key);
}
