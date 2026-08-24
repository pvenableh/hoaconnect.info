/**
 * useDirectorLayer — the one brain behind the Director surface, the place the
 * assistant's advisory presence appears *outside* its slide-over panel.
 *
 * It introduces no engine of its own. It composes four things that already
 * exist into a single contract, so a hub page and a detail page can mount the
 * same component and get the right thing:
 *
 *   · useAiContext        — "what am I looking at", set by the page or derived
 *                           from the route (scope + focus sentence).
 *   · /api/ai/notices     — Phase 4's deterministic notices, surfaced through
 *                           `useAINotices` so dismissal keeps working.
 *   · /api/ai/actions     — the HITL queue, read and resolved by `useAiActions`
 *                           so approve/reject/undo is never reimplemented.
 *   · /api/ai/notices/propose — a notice's `proposedAction` becomes a real
 *                           pending row, through `proposeAction`.
 *   · /api/ai/director/plan — the Board Room (P6): a briefing plus several
 *                           proposed steps in one turn, every step a real row
 *                           through the same `proposeAction`.
 *
 * ── The one boundary this composable owns ───────────────────────────────────
 * Earnest's version exists to reconcile a singular/plural split (`client` in
 * awareness, `clients` on the action row). **HOA has no such split** — notices,
 * page context and `ai_actions.entity_type` all speak the same singular words —
 * so that translation is not ported. What HOA has instead is a *vocabulary*
 * split: a violation page announces itself as `violation` and a ticket page as
 * `ticket`, but both are rows in `hoa_requests`, so the notices generator and
 * `entityRefFor()` in `ai-actions.ts` both call them `request`. Ask the notices
 * endpoint about a `violation` and you get nothing back, forever, silently.
 * `groundedType` is that translation, in one place.
 *
 * Give it no scope and it reflects the current page. Give it an explicit entity
 * and it pins to that record.
 */

import type { MaybeRefOrGetter } from "vue";

/**
 * Page vocabulary → grounding vocabulary. Violations and tickets are rows in
 * `hoa_requests`; everything else already agrees with itself.
 */
const GROUNDED_TYPE: Record<string, string> = {
  violation: "request",
  ticket: "request",
};

/**
 * The entity types the notices generators actually cover. Anything else has no
 * notices by construction — asking is a wasted round trip, not an empty result
 * worth waiting for.
 */
export const NOTICE_ENTITY_TYPES = new Set([
  "request",
  "member",
  "project",
  "channel",
  "vendor",
  "meeting",
  "payment_request",
]);

/**
 * Route scope → the Director agenda subject this area plans against. Two of
 * these deserve a note:
 *
 *   `people` → **money**. The only notices the generators produce about members
 *   are balance notices, and those bucket to Money in `collectDirectorAgenda`.
 *   Mapping People to a subject that generates nothing would give the hub a
 *   planning button that always came back empty.
 *
 *   Vendors is resolved from the PATH, not the scope, because
 *   `deriveRouteFocus` files `/vendors` under `people` along with the member
 *   roster. It is the one place the coarse scope is too coarse.
 */
const SCOPE_SUBJECT: Record<string, string> = {
  requests: "requests",
  money: "money",
  work: "projects",
  governance: "meetings",
  communications: "community",
  people: "money",
  documents: "operations",
};

/** Route scope → what the pill calls this area. */
const SCOPE_NAME: Record<string, string> = {
  dashboard: "your association",
  workspace: "your association",
  people: "People",
  requests: "Requests",
  work: "Projects",
  money: "Money",
  governance: "Meetings",
  communications: "Communications",
  documents: "Documents",
  settings: "Settings",
};

/** One step of a plan, as the Board Room endpoint returns it. */
export interface DirectorPlanStep {
  id: string;
  actionType: string;
  title: string;
  preview: any;
  status: string;
  outbound: boolean;
  entityType: string | null;
  entityId: string | null;
  errorMessage: string | null;
  dateCreated: string | null;
}

/** What `POST /api/ai/director/plan` hands back — briefing, bullets, steps. */
export interface DirectorPlan {
  planId: string | null;
  cacheKey: string;
  cached: boolean;
  savedAt: string | null;
  subject: string | null;
  entityType: string | null;
  entityId: string | null;
  intro: string;
  points: string[];
  money: any;
  agenda: any;
  steps: DirectorPlanStep[];
  stepCount: number;
  credits?: number;
  balanceCredits?: number;
}

export interface DirectorLayerScope {
  entityType?: string | null;
  entityId?: string | null;
  label?: string | null;
}

export function useDirectorLayer(scope?: MaybeRefOrGetter<DirectorLayerScope | undefined>) {
  const route = useRoute();
  const { currentContext } = useAiContext();
  const { open: openAssistant, openWith } = useAiAssistant();

  // The same synchronous source the assistant panel and the nav badge read.
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const orgId = computed(() => selectedOrgId.value || "");

  // Explicit scope wins; otherwise follow the page's own AI context.
  const resolved = computed<DirectorLayerScope>(() => {
    const s = toValue(scope);
    if (s?.entityType && s?.entityId) {
      return { entityType: s.entityType, entityId: String(s.entityId), label: s.label ?? null };
    }
    const c = currentContext.value;
    if (c.entityType && c.entityId) {
      return { entityType: c.entityType, entityId: String(c.entityId), label: c.label ?? null };
    }
    return { entityType: null, entityId: null, label: null };
  });

  const hasEntity = computed(() => !!resolved.value.entityType && !!resolved.value.entityId);

  /** The type the notices endpoint and `ai_actions.entity_type` both understand. */
  const groundedType = computed(() => {
    const t = resolved.value.entityType;
    if (!t) return null;
    return GROUNDED_TYPE[t] ?? t;
  });

  const hasNotices = computed(
    () => !!groundedType.value && NOTICE_ENTITY_TYPES.has(groundedType.value)
  );

  const routeScope = computed(() => currentContext.value.scope || "workspace");
  const isVendorArea = computed(() => /\/vendors(\/|$)/.test(route.path.toLowerCase()));
  const scopeSubject = computed(() => {
    if (hasEntity.value) return null;
    if (isVendorArea.value) return "vendors";
    return SCOPE_SUBJECT[routeScope.value] ?? null;
  });
  const scopeName = computed(() => {
    if (isVendorArea.value) return "Vendors";
    return SCOPE_NAME[routeScope.value] ?? "your association";
  });

  /** What the surface calls the thing it is about — entity label or area name. */
  const subjectName = computed(() =>
    hasEntity.value ? resolved.value.label || resolved.value.entityType || "this record" : scopeName.value
  );

  // ── Notices ────────────────────────────────────────────────────────────────
  // Entity-scoped mounts get their own state bucket so a detail page's notices
  // never overwrite the community feed the hub and the badge share. The key is
  // fixed at setup because `useState` binds once — a computed key would look
  // reactive and silently keep the bucket it was first evaluated with. A mount
  // that names its entity through props gets its own bucket; one that discovers
  // it later through page context shares, which is harmless now that a scoped
  // refresh no longer prunes the shared dismissal list.
  const initialScope = toValue(scope);
  const noticesApi = useAINotices(orgId, {
    stateKey:
      initialScope?.entityType && initialScope?.entityId
        ? `entity:${GROUNDED_TYPE[initialScope.entityType] ?? initialScope.entityType}:${initialScope.entityId}`
        : undefined,
  });

  async function refreshNotices() {
    if (!orgId.value) return;
    if (hasEntity.value) {
      if (!hasNotices.value) return;
      await noticesApi.refresh({
        entityType: groundedType.value as string,
        entityId: String(resolved.value.entityId),
      });
      return;
    }
    await noticesApi.refresh();
  }

  // ── Proposals (the HITL queue) ─────────────────────────────────────────────
  const actions = useAiActions(orgId);
  const entityPendingCount = ref(0);

  async function refreshEntityPending() {
    if (import.meta.server) return;
    if (!hasEntity.value || !orgId.value || !groundedType.value) {
      entityPendingCount.value = 0;
      return;
    }
    try {
      const res = await $fetch<{ actions: any[] }>("/api/ai/actions", {
        query: {
          orgId: orgId.value,
          entityType: groundedType.value,
          entityId: String(resolved.value.entityId),
          status: "pending",
        },
      });
      entityPendingCount.value = (res?.actions || []).length;
    } catch {
      // Fail soft — an ambient chip must never break the page under it.
      entityPendingCount.value = 0;
    }
  }

  /** How many decisions are waiting in whatever this surface is about. */
  const approvalsCount = computed(() =>
    hasEntity.value ? entityPendingCount.value : actions.pendingCount.value
  );

  /** Load the queue this surface would expand to. */
  async function loadQueue() {
    if (!orgId.value) return;
    await actions.fetchActions(
      hasEntity.value && groundedType.value
        ? { status: "pending", entityType: groundedType.value, entityId: String(resolved.value.entityId) }
        : { status: "pending" }
    );
  }

  async function afterDecision() {
    await Promise.all([actions.refreshPendingCount(), refreshEntityPending()]);
  }

  // ── Turning a notice into a proposal ───────────────────────────────────────
  const proposingId = ref<string | null>(null);
  const proposeError = ref<string | null>(null);

  /**
   * Ask the server to enact a notice's suggested action. The notice id is all
   * that travels — the server re-derives the action and the payload, and routes
   * both through `proposeAction()`, which is where the trust dial and the
   * outbound cap live. Nothing here decides whether it runs.
   */
  async function proposeFromNotice(noticeId: string): Promise<{ status: string } | null> {
    if (!orgId.value || !noticeId || proposingId.value) return null;
    proposingId.value = noticeId;
    proposeError.value = null;
    try {
      const body: Record<string, string> = { orgId: orgId.value, noticeId };
      if (hasEntity.value && groundedType.value) {
        body.entityType = groundedType.value;
        body.entityId = String(resolved.value.entityId);
      }
      const res = await $fetch<{ actionId: string | null; status: string; summary: string }>(
        "/api/ai/notices/propose",
        { method: "POST", body }
      );
      await afterDecision();
      // An auto-run changes the world, so the notice behind it is likely gone.
      if (res.status === "executed") await refreshNotices();
      return { status: res.status };
    } catch (e: any) {
      proposeError.value = e?.data?.message || e?.statusMessage || e?.message || "Could not do that.";
      return null;
    } finally {
      proposingId.value = null;
    }
  }

  // ── Bulk decisions ─────────────────────────────────────────────────────────
  const bulkBusy = ref(false);

  /** Approve or reject several proposals — one request, the same approval path. */
  async function decideMany(ids: string[], decision: "approve" | "reject") {
    if (!orgId.value || !ids.length || bulkBusy.value) return null;
    bulkBusy.value = true;
    try {
      const res = await $fetch<{ approved: number; rejected: number; failed: number }>(
        "/api/ai/actions/bulk",
        { method: "POST", body: { orgId: orgId.value, ids, decision } }
      );
      await Promise.all([loadQueue(), afterDecision()]);
      return res;
    } catch {
      return null;
    } finally {
      bulkBusy.value = false;
    }
  }

  // ── Planning ───────────────────────────────────────────────────────────────
  const planning = ref(false);
  const plan = ref<DirectorPlan | null>(null);
  const planError = ref<string | null>(null);

  /**
   * The pill's outline button, and the ONE handler that reaches the Board Room.
   *
   * Phase 5 shipped this opening the assistant panel with a planning prompt,
   * because `/api/ai/director/plan` did not exist yet and a button wired to a
   * 404 is worse than a button wired to a workaround. It exists now, so this
   * calls it — and everything the workaround was careful about still holds:
   * the same wallet meters it, and every step it drafts is a real `ai_actions`
   * row through `proposeAction()`, which is where the trust dial and the
   * outbound cap live. Nothing here decides what runs.
   *
   * The steps land in the queue this same pill already counts, so the approvals
   * chip grows by the number of steps drafted and expands to the real cards.
   * The briefing prose is returned and held in `plan` for the Board Room page
   * to render; a surface that has nowhere to put it simply ignores it.
   *
   * Still nothing without a click — this is only ever called from the button.
   */
  async function planThis(): Promise<DirectorPlan | null> {
    if (!orgId.value || planning.value) return null;
    planning.value = true;
    planError.value = null;
    try {
      const body: Record<string, unknown> = { orgId: orgId.value };
      if (hasEntity.value && groundedType.value) {
        body.entityType = groundedType.value;
        body.entityId = String(resolved.value.entityId);
      } else if (scopeSubject.value) {
        body.subject = scopeSubject.value;
      }
      const res = await $fetch<DirectorPlan & { error?: string }>("/api/ai/director/plan", {
        method: "POST",
        body,
      });
      // A 402 comes back as a body, not a throw — the same shape chat uses.
      if ((res as any)?.error === "insufficient_credits") {
        planError.value = "You are out of AI credits. Top up to draft a plan.";
        return null;
      }
      plan.value = res;
      // Steps are proposals in the queue this pill already shows.
      await Promise.all([afterDecision(), loadQueue()]);
      return res;
    } catch (e: any) {
      planError.value =
        e?.data?.message || e?.statusMessage || e?.message || "Could not draft a plan.";
      return null;
    } finally {
      planning.value = false;
    }
  }

  return {
    // context
    orgId,
    resolved,
    hasEntity,
    groundedType,
    hasNotices,
    scopeSubject,
    scopeName,
    subjectName,
    focus: computed(() => currentContext.value.focus),
    // notices
    notices: noticesApi.notices,
    noticesLoading: noticesApi.loading,
    dismissNotice: noticesApi.dismiss,
    hydrateDismissed: noticesApi.hydrateDismissed,
    refreshNotices,
    // proposals
    actions,
    approvalsCount,
    entityPendingCount,
    loadQueue,
    refreshEntityPending,
    afterDecision,
    proposeFromNotice,
    proposingId,
    proposeError,
    decideMany,
    bulkBusy,
    // planning
    planThis,
    planning,
    plan,
    planError,
    // asking
    ask: openWith,
    openAssistant,
  };
}
