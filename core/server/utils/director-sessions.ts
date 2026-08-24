// The live Board Room — one meeting several people are in at once (Round 2,
// Phase 6).
//
// A `hoa_director_sessions` row IS the meeting: who convened it, what it is
// about, which plan is on screen, and where the presenter has got to. The
// proposed steps do not live here — they are `ai_actions` rows carrying
// `session_id === plan_id` — and `loadPlanSteps()` reads them back so every
// attendee is handed the same list.
//
// ── Why `revision` exists ────────────────────────────────────────────────────
// `ai_actions` is admin-only. Nothing in a browser can subscribe to it, so a
// step being approved in the room cannot push itself to the other people in the
// room. `recordActivity()` bumps the session row's `revision` instead: the row
// is the one thing attendees CAN watch, and a changed revision is the signal to
// re-fetch the steps. It is a clock, not a payload — `last_activity` carries the
// human sentence about what just happened.
//
// Attendance rides on the row as a JSON list rather than earning its own
// collection: it is small, bounded, and meaningless apart from its session.
//
// Everything is wrapped. An unprovisioned store must never break the Board
// Room, so writes swallow and reads return empty — the live layer is simply
// inert until scripts/create-boardroom-collections.ts is run.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { parseActionPreview } from "#core/shared/ai/actions";

const SESSIONS = "hoa_director_sessions";

export type SessionStatus = "live" | "ended";
export type AttendeeRole = "host" | "member";
export type AttendeeStatus = "invited" | "active" | "left";

export interface SessionAttendee {
  userId: string;
  name: string;
  role: AttendeeRole;
  status: AttendeeStatus;
  lastSeen: string | null;
}

export interface SessionActivity {
  /** 'approve' | 'reject' | 'draft' | 'present' | 'join' | 'end' | … */
  type: string;
  actorId?: string | null;
  actorName?: string | null;
  stepId?: string | null;
  status?: string | null;
  label?: string | null;
  at: string;
}

export interface CreateSessionParams {
  organizationId: string;
  hostId: string;
  hostName?: string | null;
  title?: string | null;
  scopeType: "org" | "entity";
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
  planId?: string | null;
  /** Attendees follow along but cannot decide steps. */
  viewOnly?: boolean;
}

/** Convene a meeting and seat the host. Returns the session id, or null. */
export async function createDirectorSession(
  params: CreateSessionParams
): Promise<string | number | null> {
  try {
    const created = (await getTypedDirectus().request(
      createItem(SESSIONS as any, {
        organization: params.organizationId,
        host: params.hostId,
        presenter: params.hostId,
        title: params.title ?? null,
        status: "live",
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        plan_id: params.planId ?? null,
        current_slide: 0,
        revision: 0,
        last_activity: null,
        view_only: params.viewOnly ?? false,
        attendees: [
          {
            userId: params.hostId,
            name: params.hostName || "Host",
            role: "host",
            status: "active",
            lastSeen: new Date().toISOString(),
          } satisfies SessionAttendee,
        ],
      } as any)
    )) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn(
      "[director-sessions] create failed (live layer inert until create:boardroom is run):",
      err?.message
    );
    return null;
  }
}

/** Attach a plan to a session once it has been drafted, and rewind to step one. */
export async function setSessionPlan(
  sessionId: string | number,
  planId: string,
  title?: string | null
): Promise<void> {
  try {
    await getTypedDirectus().request(
      updateItem(SESSIONS as any, sessionId, {
        plan_id: planId,
        ...(title ? { title } : {}),
        current_slide: 0,
      } as any)
    );
  } catch (err: any) {
    console.warn("[director-sessions] setSessionPlan failed:", err?.message);
  }
}

export async function endDirectorSession(sessionId: string | number): Promise<void> {
  try {
    await getTypedDirectus().request(
      updateItem(SESSIONS as any, sessionId, { status: "ended" } as any)
    );
  } catch (err: any) {
    console.warn("[director-sessions] end failed:", err?.message);
  }
}

/** Move the presenter's pointer. Attendees following mirror it. */
export async function setPresenterSlide(
  sessionId: string | number,
  slide: number
): Promise<void> {
  try {
    await getTypedDirectus().request(
      updateItem(SESSIONS as any, sessionId, {
        current_slide: Math.max(0, Math.floor(Number(slide) || 0)),
      } as any)
    );
  } catch (err: any) {
    console.warn("[director-sessions] setPresenterSlide failed:", err?.message);
  }
}

/**
 * Seat someone, or update the seat they already have. One entry per user: a
 * re-join flips a prior `left`/`invited` back to `active` rather than stacking a
 * second row, and a host is never demoted to member by re-entering the room.
 */
export async function upsertAttendee(
  sessionId: string | number,
  attendee: { userId: string; name?: string | null; role?: AttendeeRole; status?: AttendeeStatus }
): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const row = (await directus.request(
      readItem(SESSIONS as any, sessionId, { fields: ["attendees"] })
    )) as any;
    const list: SessionAttendee[] = Array.isArray(row?.attendees) ? row.attendees : [];
    const now = new Date().toISOString();
    const existing = list.find((a) => String(a.userId) === String(attendee.userId));
    if (existing) {
      existing.name = attendee.name || existing.name;
      existing.role = existing.role === "host" ? "host" : attendee.role ?? existing.role ?? "member";
      existing.status = attendee.status ?? "active";
      existing.lastSeen = now;
    } else {
      list.push({
        userId: String(attendee.userId),
        name: attendee.name || "Someone",
        role: attendee.role ?? "member",
        status: attendee.status ?? "active",
        lastSeen: now,
      });
    }
    await directus.request(updateItem(SESSIONS as any, sessionId, { attendees: list } as any));
  } catch (err: any) {
    console.warn("[director-sessions] upsertAttendee failed:", err?.message);
  }
}

/**
 * Bump the revision and stamp what just happened.
 *
 * This is the whole sync mechanism: attendees watch the session row, and a
 * changed revision tells them to re-fetch steps that live in a collection they
 * cannot watch. Read-then-write is not atomic, so two decisions landing in the
 * same instant can share a revision number — which is harmless, because the
 * number is a change signal and not a sequence anyone counts on. What matters
 * is that it moved.
 */
export async function recordActivity(
  sessionId: string | number,
  activity: Omit<SessionActivity, "at">
): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const row = (await directus.request(
      readItem(SESSIONS as any, sessionId, { fields: ["revision"] })
    )) as any;
    const next = (Number(row?.revision) || 0) + 1;
    await directus.request(
      updateItem(SESSIONS as any, sessionId, {
        revision: next,
        last_activity: { ...activity, at: new Date().toISOString() },
      } as any)
    );
  } catch (err: any) {
    console.warn("[director-sessions] recordActivity failed:", err?.message);
  }
}

export interface LoadedSession {
  id: string | number;
  organizationId: string | null;
  hostId: string | null;
  presenterId: string | null;
  title: string | null;
  status: SessionStatus;
  scopeType: "org" | "entity";
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  currentSlide: number;
  revision: number;
  lastActivity: SessionActivity | null;
  attendees: SessionAttendee[];
  viewOnly: boolean;
  dateCreated: string | null;
}

const idOf = (v: any) => (v && typeof v === "object" ? v.id : v) ?? null;

const SESSION_FIELDS = [
  "id",
  "organization",
  "host",
  "presenter",
  "title",
  "status",
  "scope_type",
  "entity_type",
  "entity_id",
  "subject",
  "topic",
  "plan_id",
  "current_slide",
  "revision",
  "last_activity",
  "attendees",
  "view_only",
  "date_created",
];

function mapSession(r: any): LoadedSession {
  return {
    id: r.id,
    organizationId: idOf(r.organization),
    hostId: idOf(r.host),
    presenterId: idOf(r.presenter),
    title: r.title ?? null,
    status: r.status === "ended" ? "ended" : "live",
    scopeType: r.scope_type === "entity" ? "entity" : "org",
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    subject: r.subject ?? null,
    topic: r.topic ?? null,
    planId: r.plan_id ?? null,
    currentSlide: Number(r.current_slide) || 0,
    revision: Number(r.revision) || 0,
    lastActivity: r.last_activity ?? null,
    attendees: Array.isArray(r.attendees) ? r.attendees : [],
    viewOnly: r.view_only === true,
    dateCreated: r.date_created ?? null,
  };
}

/**
 * One session, and only if it belongs to this community. The org is checked
 * HERE rather than left to the caller: a session id is a bare uuid in a URL,
 * and every other Board Room read is org-filtered by construction.
 */
export async function loadSession(
  sessionId: string | number,
  organizationId: string
): Promise<LoadedSession | null> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems(SESSIONS as any, {
        filter: {
          _and: [{ id: { _eq: sessionId } }, { organization: { _eq: organizationId } }],
        } as any,
        fields: SESSION_FIELDS,
        limit: 1,
      })
    )) as any[];
    return rows?.[0] ? mapSession(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Live meetings in this community — the "join the table" list, newest first. */
export async function listLiveSessions(organizationId: string): Promise<LoadedSession[]> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems(SESSIONS as any, {
        filter: {
          _and: [{ organization: { _eq: organizationId } }, { status: { _eq: "live" } }],
        } as any,
        fields: SESSION_FIELDS,
        sort: ["-date_created"],
        limit: 20,
      })
    )) as any[];
    return (rows || []).map(mapSession);
  } catch {
    return [];
  }
}

export interface PlanStep {
  id: string;
  actionType: string;
  title: string;
  preview: any;
  /** The executor's own record — what `AiActionCard` reads to offer Undo. */
  result: any;
  status: string;
  outbound: boolean;
  entityType: string | null;
  entityId: string | null;
  errorMessage: string | null;
  dateCreated: string | null;
}

/**
 * The steps of one plan, in the order they were proposed.
 *
 * `plan_id === ai_actions.session_id` is the whole link, and the org filter
 * rides alongside it so a guessed plan id cannot surface another community's
 * proposals. `preview` goes through the shared parser for the reason documented
 * on `parseActionPreview` — it is a text column, and rendering the raw string
 * enumerates characters.
 */
export async function loadPlanSteps(
  planId: string | null | undefined,
  organizationId: string
): Promise<PlanStep[]> {
  if (!planId) return [];
  try {
    const rows = (await getTypedDirectus().request(
      readItems("ai_actions", {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { session_id: { _eq: String(planId) } },
          ],
        } as any,
        fields: [
          "id",
          "action_type",
          "title",
          "preview",
          "result",
          "status",
          "outbound",
          "entity_type",
          "entity_id",
          "error_message",
          "date_created",
        ],
        sort: ["date_created"],
        limit: 50,
      })
    )) as any[];
    return (rows || []).map((r) => {
      const parsed = parseActionPreview(r);
      return {
        id: String(parsed.id),
        actionType: parsed.action_type,
        title: parsed.title || parsed.action_type,
        preview: parsed.preview ?? null,
        result: (parsed as any).result ?? null,
        status: parsed.status || "pending",
        outbound: parsed.outbound === true,
        entityType: parsed.entity_type ?? null,
        entityId: parsed.entity_id ?? null,
        errorMessage: parsed.error_message ?? null,
        dateCreated: parsed.date_created ?? null,
      };
    });
  } catch {
    return [];
  }
}
