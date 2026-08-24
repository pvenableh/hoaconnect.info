/**
 * useBoardroomSession — the multiplayer half of the Board Room.
 *
 * A session is the room, not the plan. The briefing and the steps stay where
 * they already are (`/api/ai/director/plan` and `ai_actions`); a
 * `hoa_director_sessions` row only records who is at the table, which plan is
 * on it, and a `revision` counter that moves whenever anything happens.
 *
 * ── Why this polls ──────────────────────────────────────────────────────────
 * The three Board Room collections are admin-only, so nothing in a browser can
 * subscribe to the session row and be *pushed* a revision bump — the WS manager
 * has nothing to listen to. The alternative was a scoped read policy on that
 * one collection, which is a production permission run; polling is not, and the
 * contract is identical either way ("the revision moved, re-read the steps"),
 * so the socket stays a drop-in upgrade rather than a rewrite.
 *
 * The poll is cheap on the quiet path on purpose: `?since=<revision>` returns
 * the one session row and omits the steps entirely when nothing has changed.
 * It also stops dead while the tab is hidden — a Board Room left open on a
 * second monitor overnight costs nothing.
 */

import type { DirectorPlanStep } from "#core/app/composables/useDirectorLayer";

/** How often an open room asks whether anything happened. */
const POLL_MS = 5000;

export interface BoardroomAttendee {
  userId: string;
  name: string;
  role: "host" | "member";
  status: "invited" | "active" | "left";
  lastSeen: string | null;
}

export interface BoardroomActivity {
  type: string;
  actorId?: string | null;
  actorName?: string | null;
  stepId?: string | null;
  status?: string | null;
  label?: string | null;
  at: string;
}

export interface BoardroomSession {
  id: string | number;
  organizationId: string | null;
  hostId: string | null;
  presenterId: string | null;
  title: string | null;
  status: "live" | "ended";
  scopeType: "org" | "entity";
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  currentSlide: number;
  revision: number;
  lastActivity: BoardroomActivity | null;
  attendees: BoardroomAttendee[];
  viewOnly: boolean;
  dateCreated: string | null;
}

export interface ConveneParams {
  title?: string | null;
  subject?: string | null;
  topic?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  planId?: string | null;
}

export function useBoardroomSession(orgId: Ref<string | null | undefined>) {
  const session = ref<BoardroomSession | null>(null);
  const liveSessions = ref<BoardroomSession[]>([]);
  const busy = ref(false);
  const error = ref<string | null>(null);

  /**
   * Steps as the ROOM last saw them. The page owns the plan it drafted; this is
   * what somebody else's decision looked like when it landed, and the page
   * merges it in. Null until a poll actually brings a change.
   */
  const remoteSteps = ref<DirectorPlanStep[] | null>(null);
  /** The revision the last change arrived on — a page can watch this alone. */
  const revision = ref(0);

  const isLive = computed(() => session.value?.status === "live");
  const attendees = computed(() =>
    (session.value?.attendees || []).filter((a) => a.status !== "left")
  );
  const lastActivity = computed(() => session.value?.lastActivity ?? null);

  function fail(e: any, fallback: string) {
    error.value = e?.data?.message || e?.statusMessage || e?.message || fallback;
    return null;
  }

  /** Meetings running right now in this community. */
  async function listLive(): Promise<BoardroomSession[]> {
    if (!orgId.value) return [];
    try {
      const res = await $fetch<{ sessions: BoardroomSession[] }>("/api/ai/director/sessions", {
        query: { orgId: orgId.value },
      });
      liveSessions.value = res.sessions || [];
    } catch {
      // A "who else is here" list must never break the room under it.
      liveSessions.value = [];
    }
    return liveSessions.value;
  }

  async function convene(params: ConveneParams = {}): Promise<BoardroomSession | null> {
    if (!orgId.value || busy.value) return null;
    busy.value = true;
    error.value = null;
    try {
      const res = await $fetch<{ session: BoardroomSession | null; provisioned: boolean }>(
        "/api/ai/director/sessions",
        { method: "POST", body: { orgId: orgId.value, ...params } }
      );
      if (!res.provisioned) {
        error.value = "The Board Room's meeting store is not set up yet.";
        return null;
      }
      session.value = res.session;
      revision.value = res.session?.revision ?? 0;
      startPolling();
      return res.session;
    } catch (e: any) {
      return fail(e, "Could not open the room.");
    } finally {
      busy.value = false;
    }
  }

  /** One in-room verb. Every op ends in a revision bump on the server. */
  async function send(op: string, extra: Record<string, unknown> = {}) {
    const id = session.value?.id;
    if (!orgId.value || !id) return null;
    try {
      const res = await $fetch<{ session: BoardroomSession }>(
        `/api/ai/director/sessions/${id}`,
        { method: "POST", body: { orgId: orgId.value, op, ...extra } }
      );
      session.value = res.session;
      return res.session;
    } catch (e: any) {
      return fail(e, "That did not reach the room.");
    }
  }

  async function join(sessionId: string | number): Promise<BoardroomSession | null> {
    if (!orgId.value) return null;
    // Seat first, then poll — `join` returns the seated row, so the room is
    // never briefly rendered without the person who just walked in.
    session.value = { id: sessionId } as BoardroomSession;
    const seated = await send("join");
    if (seated) {
      revision.value = seated.revision;
      startPolling();
      await pollOnce(true);
    }
    return seated;
  }

  const leave = () => send("leave").then((s) => (stopPolling(), (session.value = null), s));
  const attachPlan = (planId: string, title?: string | null) => send("plan", { planId, title });
  const present = (slide: number) => send("present", { slide });
  /** Tell the room a step was decided. The server reads back what it really is. */
  const reportDecision = (stepId: string) => send("activity", { stepId });

  async function end() {
    const s = await send("end");
    stopPolling();
    session.value = null;
    return s;
  }

  // ── The poll ───────────────────────────────────────────────────────────────
  let timer: ReturnType<typeof setInterval> | null = null;

  async function pollOnce(force = false) {
    const id = session.value?.id;
    if (!orgId.value || !id) return;
    try {
      const res = await $fetch<{
        session: BoardroomSession;
        revision: number;
        changed: boolean;
        steps: DirectorPlanStep[] | null;
      }>(`/api/ai/director/sessions/${id}`, {
        query: { orgId: orgId.value, since: force ? undefined : revision.value },
      });
      session.value = res.session;
      if (res.changed) {
        revision.value = res.revision;
        if (res.steps) remoteSteps.value = res.steps;
      }
      // The host closed the room from somewhere else — stop asking.
      if (res.session.status === "ended") stopPolling();
    } catch {
      // A dropped tick is not an error worth surfacing; the next one recovers.
    }
  }

  function startPolling() {
    // `import.meta.server`, not `!import.meta.client` — the same guard the WS
    // manager uses, and the one that reads as false in a plain vitest run.
    if (import.meta.server || timer) return;
    timer = setInterval(() => {
      // Nothing to look at, nothing to ask. A room left open behind another
      // window costs exactly zero requests.
      if (document.visibilityState !== "visible") return;
      void pollOnce();
    }, POLL_MS);
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Coming back to the tab should not wait out a whole interval.
  function onVisible() {
    if (document.visibilityState === "visible" && timer) void pollOnce();
  }

  if (!import.meta.server) {
    document.addEventListener("visibilitychange", onVisible);
    onScopeDispose(() => {
      document.removeEventListener("visibilitychange", onVisible);
      stopPolling();
    });
  }

  return {
    session,
    liveSessions,
    attendees,
    lastActivity,
    revision,
    remoteSteps,
    isLive,
    busy,
    error,
    listLive,
    convene,
    join,
    leave,
    attachPlan,
    present,
    reportDecision,
    end,
    pollOnce,
  };
}
