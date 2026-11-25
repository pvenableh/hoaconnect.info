/**
 * Restricted members on the server (docs/spec-member-restrictions.md).
 *
 * Two jobs:
 *   - `requireCanPost` / `canPostIn`: the server half of "posting paused". The
 *     routes that act for a caller and reach other people (a chat fan-out, a
 *     message edit, notify-event) refuse an archived, inactive or paused
 *     member. The Directus half is posts_in / posts_to (core/shared/roles/
 *     admin-scope.ts).
 *   - What the admin-only /api/org/member-restrictions routes share.
 *
 * Restricted is derived from hoa_member_restrictions at the moment of asking,
 * never read from posts_in (a mirror that may lag the end date by a sync).
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import type { LedgerActor } from "#core/shared/ledger/entry";
import { canPost, refId, type RestrictionRow } from "#core/shared/members/restrictions";
import { orgTimeZone } from "#core/shared/org-timezone";
import { restrictedNow } from "./admin-scope";
import { ledgerActorFor, memberNamesFor } from "./member-names";
import type { ReadSpec } from "./directus-graphql";

export interface PostingState {
  /** The caller's active membership here, else their first, else null. */
  memberId: string | null;
  status: string | null;
  restricted: boolean;
  canPost: boolean;
}

/**
 * The caller's posting state in `orgId`, cached per request. A person with
 * two memberships in one community (rare) posts if either may, as the Directus
 * rule reads any of their posts_in. A failed restrictions read throws: never
 * "may post" because it could not tell.
 */
export async function postingStateFor(event: H3Event, orgId: string): Promise<PostingState> {
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__postingState ??= new Map<string, Promise<PostingState>>()) as Map<string, Promise<PostingState>>;
  const hit = cache.get(orgId);
  if (hit) return hit;
  const run = readPostingState(event, orgId);
  cache.set(orgId, run);
  run.catch(() => cache.delete(orgId));
  return run;
}

async function readPostingState(event: H3Event, orgId: string): Promise<PostingState> {
  const none: PostingState = { memberId: null, status: null, restricted: false, canPost: false };
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId || !orgId) return none;
  const directus = getTypedDirectus();
  const rows = ((await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId } },
      fields: ["id", "status"],
      limit: -1,
    })
  )) ?? []) as { id: string; status?: string | null }[];
  if (!rows.length) return none;
  const active = rows.filter((r) => r.status === "active");
  if (!active.length) return { memberId: String(rows[0]!.id), status: rows[0]!.status ?? null, restricted: false, canPost: false };
  const paused = await restrictedNow(directus, active.map((r) => String(r.id)));
  const free = active.find((r) => !paused.has(String(r.id)));
  const pick = free ?? active[0]!;
  const restricted = !free;
  return { memberId: String(pick.id), status: "active", restricted, canPost: canPost({ status: "active", restricted }) };
}

export async function canPostIn(event: H3Event, orgId: string): Promise<boolean> {
  return (await postingStateFor(event, orgId)).canPost;
}

/** 403 unless the caller is an active member of `orgId` whose posting is not paused. */
export async function requireCanPost(event: H3Event, orgId: string | null | undefined): Promise<PostingState> {
  if (!orgId) throw createError({ statusCode: 403, message: "Only a member of this community can post here." });
  const state = await postingStateFor(event, orgId);
  if (state.status !== "active") throw createError({ statusCode: 403, message: "Only an active member of this community can post here." });
  if (state.restricted) throw createError({ statusCode: 403, message: "Your posting is paused in this community." });
  return state;
}

// ── The admin routes ─────────────────────────────────────────────────────────

/** 401 without a session, 403 unless an admin of `orgId`. Returns the ledger actor. */
export async function requireRestrictionAdmin(event: H3Event, orgId: string): Promise<LedgerActor> {
  const session = await requireUserSession(event);
  const user: any = session?.user ?? {};
  if (!user.id) throw createError({ statusCode: 401, message: "Authentication required" });
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an administrator can pause a member's posting." });
  return await ledgerActorFor(orgId, user);
}

export interface RestrictionRecord extends RestrictionRow {
  id: string;
  organization?: unknown;
  member_note?: string | null;
  internal_note?: string | null;
  holder_name?: string | null;
  imposed_by?: any;
  lifted_by?: any;
}

const PERSON = (f: string) => [`${f}.id`, `${f}.first_name`, `${f}.last_name`, `${f}.email`];

/** Every row (open and ended) for one membership in `orgId`, newest first. */
export async function readRestrictionRows(orgId: string, memberId: string): Promise<RestrictionRecord[]> {
  return ((await getTypedDirectus().request(
    readItems("hoa_member_restrictions" as any, {
      filter: { organization: { _eq: orgId }, member: { _eq: memberId } } as any,
      fields: [
        "id", "organization", "member", "starts_at", "ends_at", "lifted_at", "member_note", "internal_note", "holder_name",
        ...PERSON("imposed_by"), ...PERSON("lifted_by"),
      ] as any,
      sort: ["-starts_at"] as any,
      limit: -1,
    })
  )) ?? []) as RestrictionRecord[];
}

/** One row, read through the org filter: 404 for another community's. */
export async function loadRestriction(orgId: string, id: string): Promise<RestrictionRecord> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_member_restrictions" as any, {
      filter: { id: { _eq: id }, organization: { _eq: orgId } } as any,
      fields: ["id", "organization", "member", "starts_at", "ends_at", "lifted_at", "member_note", "holder_name"] as any,
      limit: 1,
    })
  )) ?? []) as RestrictionRecord[];
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404, message: "No such pause in this community." });
  return row;
}

/** Does this membership hold a board term now? A director's speech is a governance question, not moderation. */
export async function holdsCurrentBoardTerm(memberId: string, now = new Date()): Promise<boolean> {
  const iso = now.toISOString();
  const terms = ((await getTypedDirectus().request(
    readItems("hoa_board_members", {
      filter: {
        status: { _eq: "published" },
        hoa_member: { _eq: memberId },
        _or: [{ term_start: { _null: true } }, { term_start: { _lte: iso } }],
      },
      fields: ["id", "term_end"],
      limit: -1,
    })
  )) ?? []) as { term_end?: string | null }[];
  return terms.some((t) => !t.term_end || t.term_end >= iso);
}

/** The community's name and time zone (for the copy and the end date). */
export async function orgCopyContext(orgId: string): Promise<{ name: string; timeZone: string }> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["name", "timezone"] as any, limit: 1 })
  )) ?? []) as { name?: string | null; timezone?: string | null }[];
  return { name: rows[0]?.name || "this community", timeZone: orgTimeZone(rows[0] ?? null) };
}

/** A login's own name from an expanded M2O, or null. */
function loginName(u: any): string | null {
  if (!u || typeof u !== "object") return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || null;
}

/**
 * Who imposed and lifted each row, as others see them: the membership's name
 * in this community, else the login's (core/shared/members/display-name.ts).
 */
export async function actorNamesFor(orgId: string, rows: readonly RestrictionRecord[]): Promise<(u: any) => string | null> {
  const ids = rows.flatMap((r) => [refId(r.imposed_by), refId(r.lifted_by)]);
  const names = await memberNamesFor(orgId, ids);
  return (u: any) => {
    const id = refId(u);
    return (id && names.get(id)) || loginName(u);
  };
}

export { refId };

/**
 * GET /api/org/member-restrictions/mine's two reads as ONE batch: the
 * caller's active memberships here (the id and the posts_in mirror; a
 * posts_in the collection does not have yet is left out, as `*` left it
 * out), and the open restrictions on those memberships. The restriction
 * read names the memberships by the same filter rather than by their ids,
 * so it needs no first round; a caller with no membership here reads none.
 */
export function myRestrictionSpecs(userId: string, orgId: string): { mr_mine: ReadSpec; mr_open: ReadSpec } {
  const mine = { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" } };
  return {
    mr_mine: { collection: "hoa_members", filter: mine, fields: ["id", "posts_in"], limit: -1 },
    mr_open: {
      collection: "hoa_member_restrictions",
      filter: { organization: { _eq: orgId }, member: mine, lifted_at: { _null: true } },
      fields: ["id", "member", "starts_at", "ends_at", "lifted_at", "member_note"],
      limit: -1,
    },
  };
}
