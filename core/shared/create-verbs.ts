/**
 * Create verbs — every "+ New …" the workspace offers, declared ONCE.
 *
 * Two consumers read this list: the Nav's "+ New" menu (App/CreateMenu.vue)
 * and Spotlight's Create group. Before it, each page built its own "Add …"
 * button with its own gate, and a global surface that copied those lists would
 * have copied every gate that was missing along with them.
 *
 * ⚠️ THE GATE LIVES HERE, not with the consumer: `visibleVerbs(gate)` is the
 * only way to get a list. A verb is offered when
 *   - the viewer is an admin of the org being viewed (not previewing the member
 *     view) — every page that owns one of these forms is behind the `admin`
 *     route middleware, so offering a verb to anyone else would only send them
 *     to a redirect; and
 *   - the verb's module is on (useModules), the same switch that hides the
 *     page's dock slot and refuses its URL (module.global.ts).
 * The capability matrix (core/shared/permissions.ts) is deliberately NOT the
 * gate: a board treasurer holds `money:write`, but `/admin/payments` turns
 * them away, and a verb must never promise a door its page will not open.
 * If a page widens its middleware, widen its verb here in the same change.
 *
 * Runners: a verb navigates to the page that owns the form, with
 * `?new=<verb>`; that page opens its OWN form via `useCreateIntent` — the same
 * opener its button calls. Two need no intent: Compose is a page of its own,
 * and Members already opens its invite form from `?tab=invite`.
 *
 * Words: actions are Title Case (docs/button-type-case-system.md).
 */

export type VerbId =
  | "member"
  | "unit"
  | "request"
  | "meeting"
  | "document"
  | "email"
  | "channel"
  | "project"
  | "poll"
  | "expense"
  | "charge";

export interface CreateVerb {
  id: VerbId;
  /** The menu row and the Spotlight row: "Invite Member". */
  label: string;
  /** Iconify name. */
  icon: string;
  /** The module (useModules key) that must be on for the verb to exist. */
  module: string;
  /** Org-relative route that owns the form; carries `?new=<id>` unless it IS the form. */
  to: string;
  /** Extra words Spotlight matches on ("dues" finds New Charge). */
  aliases?: readonly string[];
}

export const CREATE_VERBS: readonly CreateVerb[] = [
  { id: "member", label: "Invite Member", icon: "lucide:user-plus", module: "directory", to: "/admin/members?tab=invite", aliases: ["owner", "resident", "tenant", "add member", "person"] },
  { id: "unit", label: "Add Unit", icon: "lucide:door-closed", module: "directory", to: "/admin/units?new=unit", aliases: ["home", "address", "apartment", "lot"] },
  { id: "request", label: "New Request", icon: "lucide:clipboard-list", module: "requests", to: "/admin/requests?new=request", aliases: ["maintenance", "violation", "ticket", "complaint", "work order"] },
  { id: "meeting", label: "New Meeting", icon: "lucide:calendar-days", module: "meetings", to: "/admin/meetings?new=meeting", aliases: ["agenda", "schedule", "board meeting"] },
  { id: "document", label: "Upload Document", icon: "lucide:file-up", module: "documents", to: "/admin/documents?new=document", aliases: ["file", "pdf", "minutes", "bylaws"] },
  { id: "email", label: "New Email", icon: "lucide:mail", module: "email", to: "/admin/communications/compose", aliases: ["message", "newsletter", "announcement", "notice", "send"] },
  { id: "channel", label: "New Channel", icon: "lucide:messages-square", module: "channels", to: "/admin/channels?new=channel", aliases: ["chat", "conversation", "group"] },
  { id: "project", label: "New Project", icon: "lucide:kanban-square", module: "projects", to: "/admin/projects?new=project", aliases: ["task", "repair", "renovation"] },
  { id: "poll", label: "New Poll", icon: "lucide:vote", module: "polls", to: "/polls?new=poll", aliases: ["vote", "survey", "ballot"] },
  { id: "expense", label: "Log Expense", icon: "lucide:receipt", module: "expenses", to: "/admin/expenses?new=expense", aliases: ["bill", "invoice", "spend", "cost"] },
  { id: "charge", label: "New Charge", icon: "lucide:wallet", module: "payments", to: "/admin/payments?new=charge", aliases: ["dues", "assessment", "fee", "payment", "record payment"] },
];

const BY_ID = new Map(CREATE_VERBS.map((v) => [v.id, v]));

export function createVerb(id: VerbId): CreateVerb {
  const v = BY_ID.get(id);
  if (!v) throw new Error(`Unknown create verb: ${id}`);
  return v;
}

export interface VerbGate {
  /** Admin of the org being VIEWED, and not previewing the member view. */
  isAdmin: boolean;
  isEnabled: (module: string) => boolean;
}

/** The verbs this viewer may run here, in registry order. The ONLY door to the list. */
export function visibleVerbs(gate: VerbGate): CreateVerb[] {
  if (!gate.isAdmin) return [];
  return CREATE_VERBS.filter((v) => gate.isEnabled(v.module));
}

// Words that say "make a thing" without naming the thing. They match every
// verb, so typing "new" in Spotlight lists them all. ("Upload", "invite" and
// "log" are NOT here: each names one verb, and matches it through its label.)
const VERB_WORDS = new Set(["new", "add", "create"]);

/**
 * Spotlight's matcher. Every typed word must start a word of the verb's label
 * or aliases, or be a generic verb word ("new", "add"…). An empty query
 * matches nothing — the Create group appears once you type.
 */
export function matchVerbs(query: string, verbs: readonly CreateVerb[]): CreateVerb[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return verbs.filter((v) => {
    const words = [v.label, ...(v.aliases ?? [])].join(" ").toLowerCase().split(/[\s-]+/);
    return tokens.every((t) => VERB_WORDS.has(t) || words.some((w) => w.startsWith(t)));
  });
}
