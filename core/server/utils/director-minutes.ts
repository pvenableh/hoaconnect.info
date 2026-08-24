// Minutes — the durable decision record of a finished Board Room meeting
// (Round 2, Phase 6).
//
// A board keeps minutes because a decision nobody wrote down is a decision
// nobody can point to six months later. So does this: one `hoa_director_minutes`
// row snapshots a meeting as it stood when it ended — the scope, the briefing on
// screen, every proposed step and how it was decided, what was captured in the
// room, and a rollup. It is deliberately a SNAPSHOT and not a set of joins: the
// steps live in `ai_actions` and will keep changing, and minutes that silently
// rewrite themselves afterwards are not minutes.
//
// The natural home for the list is the meetings hub, alongside the association's
// other minutes — which is the point of building this for an HOA rather than
// porting a sales tool's "meeting recap".
//
// Backed by `hoa_director_minutes` (scripts/create-boardroom-collections.ts).
// Admin client only, every call wrapped: an unprovisioned store makes the recap
// layer inert, never broken.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { createItem, readItems, updateItem } from "@directus/sdk";

const MINUTES = "hoa_director_minutes";

export type MinutesStatus = "recorded" | "shared";

export interface MinutesStep {
  id: string;
  actionType: string;
  title: string;
  status: string;
  outbound?: boolean;
  decidedBy?: string | null;
}

export interface MinutesCaptured {
  type: "task" | "request" | "note";
  title: string;
  priority?: string | null;
}

export interface MinutesQaTurn {
  role: "user" | "assistant";
  text: string;
}

export interface MinutesStats {
  done: number;
  skipped: number;
  failed: number;
  open: number;
  total: number;
  captured: number;
}

/**
 * Roll a plan's steps up into the counts the recap leads with. Derived from the
 * step list rather than tallied by the caller so the numbers on the minutes can
 * never disagree with the steps printed underneath them.
 */
export function summarizeMinutesSteps(
  steps: MinutesStep[],
  capturedCount = 0
): MinutesStats {
  const stats: MinutesStats = {
    done: 0,
    skipped: 0,
    failed: 0,
    open: 0,
    total: steps.length,
    captured: capturedCount,
  };
  for (const s of steps) {
    switch (s.status) {
      case "executed":
        stats.done++;
        break;
      case "rejected":
        stats.skipped++;
        break;
      case "failed":
        stats.failed++;
        break;
      default:
        // pending / approved / anything the lifecycle grows later: still open.
        stats.open++;
    }
  }
  return stats;
}

export interface SaveMinutesParams {
  organizationId: string;
  authorId: string;
  sessionId?: string | number | null;
  title?: string | null;
  scopeType: "org" | "entity";
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
  planId?: string | null;
  summary?: string | null;
  intro?: string | null;
  points?: string[] | null;
  money?: any | null;
  steps?: MinutesStep[] | null;
  captured?: MinutesCaptured[] | null;
  qa?: MinutesQaTurn[] | null;
  stats?: MinutesStats | null;
}

/**
 * Record a meeting. Returns the new row id, or null when the store is not
 * provisioned. Stats are computed from the steps when the caller does not
 * supply them.
 */
export async function saveMinutes(params: SaveMinutesParams): Promise<string | number | null> {
  try {
    const steps = params.steps ?? [];
    const created = (await getTypedDirectus().request(
      createItem(MINUTES as any, {
        organization: params.organizationId,
        author: params.authorId,
        session: params.sessionId ?? null,
        title: params.title ?? null,
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        plan_id: params.planId ?? null,
        summary: params.summary ?? null,
        intro: params.intro ?? null,
        points: params.points ?? null,
        money: params.money ?? null,
        steps,
        captured: params.captured ?? null,
        qa: params.qa ?? null,
        stats: params.stats ?? summarizeMinutesSteps(steps, params.captured?.length ?? 0),
        status: "recorded",
      } as any)
    )) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn(
      "[director-minutes] save failed (recap layer inert until create:boardroom is run):",
      err?.message
    );
    return null;
  }
}

/** Mark minutes as shared with the board. Idempotent by nature. */
export async function markMinutesShared(
  minutesId: string | number,
  organizationId: string
): Promise<boolean> {
  try {
    // Confirm the row is this community's before touching it — a minutes id is a
    // bare uuid, and "share" is the one verb here that reaches people.
    const existing = await loadMinutes(minutesId, organizationId);
    if (!existing) return false;
    await getTypedDirectus().request(
      updateItem(MINUTES as any, minutesId, { status: "shared" } as any)
    );
    return true;
  } catch (err: any) {
    console.warn("[director-minutes] markShared failed:", err?.message);
    return false;
  }
}

export interface LoadedMinutes {
  id: string | number;
  organizationId: string | null;
  authorId: string | null;
  authorName: string | null;
  sessionId: string | number | null;
  title: string | null;
  scopeType: "org" | "entity";
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  summary: string | null;
  intro: string | null;
  points: string[];
  money: any | null;
  steps: MinutesStep[];
  captured: MinutesCaptured[];
  qa: MinutesQaTurn[];
  stats: MinutesStats | null;
  status: MinutesStatus;
  dateCreated: string | null;
}

const idOf = (v: any) => (v && typeof v === "object" ? v.id : v) ?? null;

function personName(u: any): string | null {
  if (!u || typeof u !== "object") return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
}

const MINUTES_FIELDS = [
  "id",
  "organization",
  "session",
  "title",
  "scope_type",
  "entity_type",
  "entity_id",
  "subject",
  "topic",
  "plan_id",
  "summary",
  "intro",
  "points",
  "money",
  "steps",
  "captured",
  "qa",
  "stats",
  "status",
  "date_created",
  { author: ["id", "first_name", "last_name"] },
];

function mapMinutes(r: any): LoadedMinutes {
  return {
    id: r.id,
    organizationId: idOf(r.organization),
    authorId: idOf(r.author),
    authorName: personName(r.author),
    sessionId: idOf(r.session),
    title: r.title ?? null,
    scopeType: r.scope_type === "entity" ? "entity" : "org",
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    subject: r.subject ?? null,
    topic: r.topic ?? null,
    planId: r.plan_id ?? null,
    summary: r.summary ?? null,
    intro: r.intro ?? null,
    points: Array.isArray(r.points) ? r.points : [],
    money: r.money ?? null,
    steps: Array.isArray(r.steps) ? r.steps : [],
    captured: Array.isArray(r.captured) ? r.captured : [],
    qa: Array.isArray(r.qa) ? r.qa : [],
    stats: r.stats ?? null,
    status: r.status === "shared" ? "shared" : "recorded",
    dateCreated: r.date_created ?? null,
  };
}

/** One set of minutes, and only if it belongs to this community. */
export async function loadMinutes(
  minutesId: string | number,
  organizationId: string
): Promise<LoadedMinutes | null> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems(MINUTES as any, {
        filter: {
          _and: [{ id: { _eq: minutesId } }, { organization: { _eq: organizationId } }],
        } as any,
        fields: MINUTES_FIELDS,
        limit: 1,
      })
    )) as any[];
    return rows?.[0] ? mapMinutes(rows[0]) : null;
  } catch {
    return null;
  }
}

export interface MinutesListRow {
  id: string | number;
  title: string | null;
  subject: string | null;
  topic: string | null;
  scopeType: "org" | "entity";
  summary: string | null;
  authorName: string | null;
  status: MinutesStatus;
  stats: MinutesStats | null;
  dateCreated: string | null;
}

/** This community's decision records, newest first. */
export async function listMinutes(
  organizationId: string,
  limit = 40
): Promise<MinutesListRow[]> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems(MINUTES as any, {
        filter: { organization: { _eq: organizationId } } as any,
        fields: [
          "id",
          "title",
          "subject",
          "topic",
          "scope_type",
          "summary",
          "status",
          "stats",
          "date_created",
          { author: ["first_name", "last_name"] },
        ],
        sort: ["-date_created"],
        limit,
      })
    )) as any[];
    return (rows || []).map((r) => ({
      id: r.id,
      title: r.title ?? null,
      subject: r.subject ?? null,
      topic: r.topic ?? null,
      scopeType: r.scope_type === "entity" ? "entity" : "org",
      summary: r.summary ?? null,
      authorName: personName(r.author),
      status: r.status === "shared" ? "shared" : "recorded",
      stats: r.stats ?? null,
      dateCreated: r.date_created ?? null,
    }));
  } catch {
    return [];
  }
}
