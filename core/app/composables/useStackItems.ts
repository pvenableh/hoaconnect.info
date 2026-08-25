/**
 * The stacks home's item model, its source adapters, and the one rule that
 * makes the page work: a fact appears exactly once.
 *
 * ── Why stacks ──────────────────────────────────────────────────────────────
 * The classic dashboard groups by DATA SOURCE — a widget per collection — which
 * is why the same overdue request can be a stat, a chart bar, a notice and a
 * pending proposal on one screen. The stacks group by the KIND OF ATTENTION an
 * item wants:
 *
 *   Decide — waiting on your judgment. Pending `ai_actions` proposals, plus
 *            notices carrying a `proposedAction` that nobody has turned into a
 *            proposal yet.
 *   Do     — things only a person can do, each pre-wired to one verb: the
 *            actionable notices (overdue requests, lapsed vendor cover, minutes
 *            nobody wrote) and unread channel conversations.
 *   Know   — worth reading, nothing required: insight notices and the Board
 *            Room's saved briefing headlines.
 *
 * The community area (requests, money, people…) demotes from a grouping to a
 * coloured dot, the same demotion Earnest made.
 *
 * ── Nothing here re-derives a source ────────────────────────────────────────
 * Every input already exists and is verified live: `useAiActions` owns the HITL
 * queue, `useAINotices` owns the deterministic notices feed (including its
 * localStorage dismissal, which keeps working because the stacks read
 * `notices`, the already-filtered list), `useChannelUnread` owns unread counts,
 * and `GET /api/ai/director/briefing` reads a SAVED briefing. That last one is
 * load-bearing: `POST /api/ai/director/plan` would draft — and bill — on a cold
 * cache, and a home page that spends credits on mount is the worst thing this
 * page could do. The read-only door cannot draft, so landing here costs
 * nothing, ever.
 *
 * ── The de-duplication rule ─────────────────────────────────────────────────
 * Every item carries a `factKey` naming the underlying fact rather than the row
 * that reported it. Piles are built in order — Decide, then Do, then Know — and
 * a fact already claimed by an earlier pile is dropped from every later one.
 *
 * The key case: a notice's `proposedAction` and the pending `ai_actions` row
 * created from it are the SAME fact. They share
 * `act:<entityType>:<entityId>:<actionType>` — deliberately the same identity
 * `/api/ai/notices/propose` uses to avoid stacking duplicate proposals — so
 * once a proposal exists, the row appears in Decide and the notice behind it
 * disappears entirely rather than nagging twice.
 *
 * Briefing headlines get a second, looser guard: they are prose restatements of
 * the same agenda the notices come from, so a headline whose normalised text
 * matches a title already on screen is dropped too. Only headlines are matched
 * this way — text similarity is a weak signal, and it is only applied to the
 * one source that has no structural identity of its own.
 */

import type { AiActionRow } from "#core/app/composables/useAiActions";
import type { AINoticeView } from "#core/app/composables/useAINotices";

export type StackPile = "decide" | "do" | "know";

/** The community area a row belongs to — the coloured dot, nothing more. */
export type StackDomain =
  | "requests"
  | "people"
  | "money"
  | "comms"
  | "governance"
  | "vendors"
  | "projects";

export interface StackItem {
  /** Stable key for list rendering and optimistic removal. */
  key: string;
  /** Identity of the FACT, not of the row that reported it. Drives de-dup. */
  factKey: string;
  pile: StackPile;
  kind: "proposal" | "notice" | "channel" | "headline";
  title: string;
  sub: string;
  domain?: StackDomain;
  /** Fallback navigation for rows whose verb is "go look at it". */
  route?: string;
  /** Label for that fallback verb. */
  routeLabel?: string;
  /** Higher sorts first within its pile. */
  score: number;
  action?: AiActionRow;
  notice?: AINoticeView;
  channel?: { id: string; name: string; slug?: string | null; count: number };
}

/** `ai_actions.entity_type` and `AINotice.entityType` share this vocabulary. */
export const ENTITY_DOMAIN: Record<string, StackDomain> = {
  hoa_requests: "requests",
  request: "requests",
  requests: "requests",
  hoa_members: "people",
  member: "people",
  members: "people",
  hoa_units: "people",
  unit: "people",
  hoa_projects: "projects",
  project: "projects",
  projects: "projects",
  hoa_vendors: "vendors",
  vendor: "vendors",
  vendors: "vendors",
  hoa_meetings: "governance",
  meeting: "governance",
  meetings: "governance",
  hoa_channels: "comms",
  channel: "comms",
  channels: "comms",
  hoa_emails: "comms",
  email: "comms",
  hoa_announcements: "comms",
  announcement: "comms",
  hoa_expenses: "money",
  expense: "money",
  expenses: "money",
  hoa_ledger_entries: "money",
  ledger: "money",
  organization: "governance",
};

export const DOMAIN_DOT: Record<StackDomain, string> = {
  requests: "bg-amber-500",
  people: "bg-sky-500",
  money: "bg-emerald-500",
  comms: "bg-violet-500",
  governance: "bg-slate-400",
  vendors: "bg-orange-500",
  projects: "bg-indigo-500",
};

export const DOMAIN_LABEL: Record<StackDomain, string> = {
  requests: "Requests",
  people: "People",
  money: "Money",
  comms: "Communications",
  governance: "Governance",
  vendors: "Vendors",
  projects: "Projects",
};

function domainFor(entityType?: string | null): StackDomain | undefined {
  if (!entityType) return undefined;
  return ENTITY_DOMAIN[String(entityType).toLowerCase()];
}

/**
 * The shared identity of "this action, on this record". The propose endpoint
 * dedupes pending proposals on exactly these three values, so a notice and the
 * row created from it land on the same string without either side knowing about
 * the other.
 */
export function actionFactKey(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  actionType: string
): string | null {
  if (!entityType || !entityId) return null;
  return `act:${String(entityType).toLowerCase()}:${String(entityId)}:${actionType}`;
}

/** Loose text identity, used ONLY to keep briefing prose off a row it restates. */
export function normalizeTitle(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  create_task: "Create a task",
  add_comment: "Add a comment",
  create_request: "Open a request",
  update_request_status: "Change a request's status",
  assign_request: "Assign a request",
  update_member_field: "Update a member record",
  log_violation: "Log a violation",
  assign_vendor: "Assign a vendor",
  schedule_meeting: "Schedule a meeting",
  set_due_date: "Set a due date",
  send_email: "Send an email",
  post_announcement: "Post an announcement",
  notify_board: "Notify the board",
};

export function actionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABEL[actionType] || "Proposed action";
}

// ── Adapters, one per source. All pure. ──────────────────────────────────────

/**
 * A pending proposal. Ordered newest-first within Decide by giving older rows a
 * lower score — a proposal is not more urgent for having aged, but the person
 * who just asked for it expects to see it at the top.
 */
export function proposalToStackItem(a: AiActionRow): StackItem {
  const label = actionTypeLabel(a.action_type);
  const bits = [label];
  if (a.outbound) bits.push("goes out to people");
  const created = a.date_created ? Date.parse(a.date_created) : NaN;
  return {
    key: `aa:${a.id}`,
    factKey: actionFactKey(a.entity_type, a.entity_id, a.action_type) || `aa:${a.id}`,
    pile: "decide",
    kind: "proposal",
    title: a.title || label,
    sub: bits.join(" · "),
    domain: domainFor(a.entity_type),
    score: Number.isFinite(created) ? created / 1e10 : 0,
    action: a,
  };
}

/**
 * A notice. Which pile it lands in is a property of the notice itself:
 * something it wants approved is a decision, an insight is reading, and
 * everything else is work.
 */
export function noticeToStackItem(n: AINoticeView): StackItem {
  const proposed = n.proposedAction;
  const pile: StackPile = proposed ? "decide" : n.type === "insight" ? "know" : "do";
  const factKey =
    (proposed && actionFactKey(n.entityType, n.entityId, proposed.actionType)) || `notice:${n.id}`;
  return {
    key: `nt:${n.id}`,
    factKey,
    pile,
    kind: "notice",
    title: n.title,
    sub: n.description,
    domain: domainFor(n.entityType),
    route: n.actionRoute,
    routeLabel: n.actionLabel,
    score: n.score ?? 0,
    notice: n,
  };
}

/** An unread conversation. One verb: open it. */
export function unreadChannelToStackItem(channel: {
  id: string;
  name: string;
  slug?: string | null;
  count: number;
}): StackItem {
  return {
    key: `ch:${channel.id}`,
    factKey: `chan:${channel.id}`,
    pile: "do",
    kind: "channel",
    title: channel.name,
    sub: `${channel.count} unread ${channel.count === 1 ? "message" : "messages"}`,
    domain: "comms",
    route: channel.slug ? `/admin/channels/${channel.slug}` : "/admin/channels",
    routeLabel: "Open channel",
    score: channel.count,
    channel,
  };
}

/**
 * One TL;DR bullet from the saved Board Room briefing. Read-only by
 * construction — there is no verb on a headline beyond opening the room that
 * wrote it.
 */
export function headlineToStackItem(point: string, index: number, savedAt?: string | null): StackItem {
  const when = savedAt ? new Date(savedAt) : null;
  const sub = when
    ? `From the board briefing · ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "From the board briefing";
  return {
    key: `bp:${index}`,
    factKey: `head:${normalizeTitle(point) || index}`,
    pile: "know",
    kind: "headline",
    title: point,
    sub,
    domain: "governance",
    route: "/admin/boardroom",
    routeLabel: "Open the Board Room",
    score: -index,
  };
}

// ── The piles ────────────────────────────────────────────────────────────────

export interface StackSources {
  proposals?: readonly AiActionRow[];
  notices?: readonly AINoticeView[];
  channels?: ReadonlyArray<{ id: string; name: string; slug?: string | null; count: number }>;
  headlines?: readonly string[];
  briefingSavedAt?: string | null;
}

export interface StackCaps {
  decide?: number;
  do?: number;
  know?: number;
}

export interface Stacks {
  decide: StackItem[];
  do: StackItem[];
  know: StackItem[];
}

const DEFAULT_CAPS: Required<StackCaps> = { decide: 12, do: 12, know: 6 };

/**
 * Build the three piles from raw sources, applying the once-only rule.
 *
 * Order matters and is the whole design: Decide is built first because a
 * decision outranks a chore, Do before Know because work outranks reading. A
 * fact claimed by an earlier pile is gone from the later ones — not moved, not
 * shown quietly, gone.
 */
export function buildStacks(sources: StackSources, caps: StackCaps = {}): Stacks {
  const limit = { ...DEFAULT_CAPS, ...caps };

  const all: StackItem[] = [
    ...(sources.proposals || []).filter((a) => a.status === "pending").map(proposalToStackItem),
    ...(sources.notices || []).map(noticeToStackItem),
    ...(sources.channels || []).filter((c) => c.count > 0).map(unreadChannelToStackItem),
    ...(sources.headlines || [])
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .map((p, i) => headlineToStackItem(p, i, sources.briefingSavedAt)),
  ];

  const claimed = new Set<string>();
  const titles = new Set<string>();
  const out: Stacks = { decide: [], do: [], know: [] };

  for (const pile of ["decide", "do", "know"] as const) {
    const rows = all
      .filter((i) => i.pile === pile)
      .sort((a, b) => b.score - a.score)
      .filter((item) => {
        if (claimed.has(item.factKey)) return false;
        // Prose has no structural identity, so it gets the text guard too.
        if (item.kind === "headline" && titles.has(normalizeTitle(item.title))) return false;
        claimed.add(item.factKey);
        titles.add(normalizeTitle(item.title));
        return true;
      });
    out[pile] = rows.slice(0, limit[pile]);
  }

  return out;
}

// ── The composable ───────────────────────────────────────────────────────────

export interface StackItemsOptions {
  /** The org's channels — the page already lists them; unread counts carry no names. */
  channels?: MaybeRefOrGetter<ReadonlyArray<{ id: string; name: string; slug?: string | null }>>;
  caps?: StackCaps;
}

/**
 * The stacks, wired to their live sources.
 *
 * `load()` is what the page calls on mount. It reads four things and writes to
 * none of them, and the briefing read goes to the saved-only door — there is no
 * code path from this composable to a billable model call.
 */
export function useStackItems(
  organizationId: MaybeRefOrGetter<string | null | undefined>,
  opts: StackItemsOptions = {}
) {
  const orgId = computed(() => toValue(organizationId) || "");
  const orgIdRef = computed(() => orgId.value || null);

  const actionsApi = useAiActions(orgIdRef);
  const noticesApi = useAINotices(orgId, { stateKey: "stacks-home" });
  const unread = useChannelUnread();

  const headlines = useState<string[]>("stacks:headlines", () => []);
  const briefingSavedAt = useState<string | null>("stacks:briefing-at", () => null);
  const loading = useState<boolean>("stacks:loading", () => false);
  const loadedFor = useState<string | null>("stacks:loaded-for", () => null);

  const unreadChannels = computed(() => {
    const roster = toValue(opts.channels) || [];
    const counts = unread.state.value.channels || {};
    return roster
      .map((c) => ({
        id: String(c.id),
        name: c.name,
        slug: c.slug ?? null,
        count: counts[String(c.id)]?.count || 0,
      }))
      .filter((c) => c.count > 0);
  });

  const stacks = computed(() =>
    buildStacks(
      {
        proposals: actionsApi.pending.value,
        notices: noticesApi.notices.value,
        channels: unreadChannels.value,
        headlines: headlines.value,
        briefingSavedAt: briefingSavedAt.value,
      },
      opts.caps
    )
  );

  const total = computed(
    () => stacks.value.decide.length + stacks.value.do.length + stacks.value.know.length
  );

  /**
   * Drop a row the moment its work is done, without waiting for a refetch. The
   * source lists are the truth; this only hides the row until the next load.
   */
  const handled = useState<string[]>("stacks:handled", () => []);
  function markHandled(key: string) {
    if (!handled.value.includes(key)) handled.value = [...handled.value, key];
  }

  /**
   * The saved briefing, and only ever the saved one. `GET` here rather than the
   * Board Room's `POST /plan`: the POST drafts on a cold cache, and nothing this
   * page does is allowed to cost the community credits.
   */
  async function loadHeadlines(): Promise<void> {
    if (!orgId.value) return;
    try {
      const res = await $fetch<{
        briefing: { points?: string[]; savedAt?: string | null } | null;
      }>("/api/ai/director/briefing", { query: { orgId: orgId.value } });
      headlines.value = Array.isArray(res?.briefing?.points) ? res.briefing!.points! : [];
      briefingSavedAt.value = res?.briefing?.savedAt || null;
    } catch {
      // No briefing is a normal state, not an error. Know shows what it has.
      headlines.value = [];
      briefingSavedAt.value = null;
    }
  }

  async function load(force = false): Promise<void> {
    if (!orgId.value) return;
    if (!force && loadedFor.value === orgId.value) return;
    loading.value = true;
    loadedFor.value = orgId.value;
    try {
      // Optimistic hides are only ever a bridge to the next read. Clearing them
      // here means a row the server still returns comes back, rather than
      // staying invisible for the rest of the session.
      handled.value = [];
      noticesApi.hydrateDismissed();
      await Promise.all([
        actionsApi.fetchActions({ status: "pending" }),
        noticesApi.refresh(),
        unread.refresh(),
        loadHeadlines(),
      ]);
    } finally {
      loading.value = false;
    }
  }

  const visible = computed<Stacks>(() => {
    const hidden = new Set(handled.value);
    const s = stacks.value;
    return {
      decide: s.decide.filter((i) => !hidden.has(i.key)),
      do: s.do.filter((i) => !hidden.has(i.key)),
      know: s.know.filter((i) => !hidden.has(i.key)),
    };
  });

  return {
    stacks: visible,
    total,
    loading,
    load,
    markHandled,
    dismissNotice: noticesApi.dismiss,
    approve: actionsApi.approve,
    reject: actionsApi.reject,
    edit: actionsApi.edit,
    undo: actionsApi.undo,
    busyId: actionsApi.busyId,
    refreshActions: () => actionsApi.fetchActions({ status: "pending" }),
  };
}
