// Persistence for the Board Room's thinking (Round 2, Phase 6).
//
// A briefing is one saved plan for one section: the narrative the model wrote,
// the TL;DR bullets it ended on, the money snapshot it reasoned over, and a
// `plan_id` that links to the proposed steps (rows in `ai_actions` where
// `session_id === plan_id`). Reopening a section inside the TTL serves the
// saved briefing instead of calling — and re-billing — the model for the same
// answer against the same facts.
//
// Backed by `hoa_director_briefings` (scripts/create-boardroom-collections.ts).
// All access is through the server's admin client; there are no row-level
// perms, matching `ai_actions`. Every call is wrapped, because a store that is
// not provisioned yet must never break the Board Room: save returns null, load
// returns null, and the planner simply drafts fresh every time until the script
// is run.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { createItem, readItems } from "@directus/sdk";

const BRIEFINGS = "hoa_director_briefings";

export interface DirectorBriefingScope {
  scopeType: "org" | "entity";
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
}

/**
 * The deterministic lookup key for "the latest briefing for this section".
 *
 * The writer (the plan endpoint, on a fresh draft) and the reader (the same
 * endpoint, on reopen) both derive it HERE and only here — the one thing that
 * makes a cache hit possible at all. Topic is normalised (trimmed, folded,
 * whitespace collapsed) so "Pool  Deck " and "pool deck" are the same section
 * rather than two briefings that never find each other.
 */
export function directorBriefingCacheKey(scope: DirectorBriefingScope): string {
  const subject = (scope.subject || "").trim().toLowerCase();
  const topic = (scope.topic || "").trim().toLowerCase().replace(/\s+/g, " ");
  const base =
    scope.scopeType === "entity" && scope.entityType && scope.entityId
      ? `entity:${scope.entityType}:${scope.entityId}`
      : "org";
  return `${base}::${subject}::${topic}`;
}

/**
 * How long a saved briefing is served before a reopen redraws it.
 *
 * A briefing snapshots live community state — arrears, open requests, the steps
 * proposed off them — so an indefinitely cached one keeps showing last week's
 * numbers, and worse, is never regenerated to pick up a fix to the planner
 * itself (a stale `step_count: 0` briefing would hide a now-working plan). Six
 * hours means a working session is stable — reopening the Board Room after
 * lunch shows the same plan, not a different one — while tomorrow's visit
 * starts from today's facts.
 *
 * Overridable via NUXT_DIRECTOR_BRIEFING_TTL_HOURS for demos and tests.
 */
export function briefingTtlMs(): number {
  const hours = Number(process.env.NUXT_DIRECTOR_BRIEFING_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 6) * 60 * 60 * 1000;
}

export interface SaveDirectorBriefingParams extends DirectorBriefingScope {
  organizationId: string;
  userId?: string | null;
  planId: string;
  intro?: string | null;
  points?: string[] | null;
  money?: any;
  agenda?: any;
  stepCount?: number;
}

/**
 * Persist a freshly drafted briefing. Returns the row id, or null if saving
 * failed — never throws. The plan the person is looking at has already been
 * paid for and is already on screen; losing the cache write is a slower next
 * visit, not an error worth showing anybody.
 */
export async function saveDirectorBriefing(
  params: SaveDirectorBriefingParams
): Promise<string | number | null> {
  try {
    const created = (await getTypedDirectus().request(
      createItem(BRIEFINGS as any, {
        organization: params.organizationId,
        user: params.userId || null,
        scope_type: params.scopeType,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        subject: params.subject ?? null,
        topic: params.topic ?? null,
        cache_key: directorBriefingCacheKey(params),
        plan_id: params.planId,
        intro: params.intro ?? null,
        points: params.points ?? null,
        money: params.money ?? null,
        agenda: params.agenda ?? null,
        step_count: params.stepCount ?? 0,
      } as any)
    )) as any;
    return created?.id ?? null;
  } catch (err: any) {
    console.warn(
      "[director-briefings] save failed (store inert until create:boardroom is run):",
      err?.message
    );
    return null;
  }
}

export interface LoadedDirectorBriefing {
  id: string | number;
  planId: string | null;
  intro: string;
  points: string[];
  money: any;
  agenda: any;
  stepCount: number;
  savedAt: string | null;
}

/**
 * The most recently saved briefing for a section, or null when there is none
 * within the TTL window (or the collection is not provisioned). Anything older
 * than the TTL is ignored rather than deleted — the row stays as a record of
 * what was advised and when, which is the point of keeping minutes at all.
 */
export async function loadLatestDirectorBriefing(
  organizationId: string,
  scope: DirectorBriefingScope
): Promise<LoadedDirectorBriefing | null> {
  try {
    const cutoffIso = new Date(Date.now() - briefingTtlMs()).toISOString();
    const rows = (await getTypedDirectus().request(
      readItems(BRIEFINGS as any, {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { cache_key: { _eq: directorBriefingCacheKey(scope) } },
            { date_created: { _gte: cutoffIso } },
          ],
        } as any,
        fields: [
          "id",
          "plan_id",
          "intro",
          "points",
          "money",
          "agenda",
          "step_count",
          "date_created",
        ],
        sort: ["-date_created"],
        limit: 1,
      })
    )) as any[];
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      planId: row.plan_id ?? null,
      intro: row.intro || "",
      points: Array.isArray(row.points) ? row.points : [],
      money: row.money ?? null,
      agenda: row.agenda ?? null,
      stepCount: Number(row.step_count) || 0,
      savedAt: row.date_created ?? null,
    };
  } catch (err: any) {
    console.warn(
      "[director-briefings] load failed (store inert until create:boardroom is run):",
      err?.message
    );
    return null;
  }
}

/** The marker the model is told to end on, and the only one this parser trusts. */
export const TLDR_MARKER = "TL;DR:";

/**
 * Split the model's reply into the briefing prose and its slide bullets.
 *
 * The planner asks for one final line beginning `TL;DR:` with takeaways
 * separated by ` | `. Parsing it here rather than in the page keeps the prose
 * and the bullets from ever disagreeing about which sentences are which, and
 * means a model that ignores the instruction degrades to "prose, no bullets"
 * instead of leaving a stray `TL;DR:` line rendered as body copy.
 *
 * The LAST marker wins: a briefing that mentions the phrase mid-paragraph
 * should not lose everything after it.
 */
export function splitTldr(text: string | null | undefined): {
  intro: string;
  points: string[];
} {
  const raw = String(text ?? "");
  const idx = raw.lastIndexOf(TLDR_MARKER);
  if (idx === -1) return { intro: raw.trim(), points: [] };

  const intro = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + TLDR_MARKER.length);
  // Only the marker's own line is the summary; anything after a newline is prose
  // the model kept writing, and belongs back with the briefing.
  const [line, ...rest] = tail.split("\n");
  const points = String(line)
    .split("|")
    .map((p) => p.replace(/^[\s*\-•]+/, "").trim())
    .filter(Boolean);

  const trailing = rest.join("\n").trim();
  return {
    intro: [intro, trailing].filter(Boolean).join("\n\n"),
    points,
  };
}
