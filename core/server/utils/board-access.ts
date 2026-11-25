/**
 * Board-position access (server-side enforcement).
 *
 * Board membership is NOT a Directus role — it's a current-term row in
 * hoa_board_members keyed to a hoa_member. So "what office does the caller
 * currently hold" can only be answered with an elevated lookup, the same
 * doctrine as project-access.ts / manager-access.ts.
 *
 * `getBoardPosition` resolves the caller's current-term office title;
 * `resolveActors` gathers the FULL set of actor hats a user wears in an org
 * (admin / board office / property manager / team lead / member) so the
 * shared capability matrix (shared/permissions.ts) can decide what they may do.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import type { Actor } from "#core/shared/permissions";
import { boardTitleToActor } from "#core/shared/permissions";
import { accessSnapshot, boardPositionFrom, boardSeatActorFrom, isTeamLeadFrom } from "./access-snapshot";

export type BoardTitle =
  | "president"
  | "vice_president"
  | "secretary"
  | "treasurer"
  | "director";

/**
 * Resolve the org member id for a user in an org (active membership), or null.
 * Shared by the board lookups below.
 */
async function getMemberId(userId: string, organizationId: string): Promise<string | null> {
  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_members", {
      filter: {
        user: { _eq: userId },
        organization: { _eq: organizationId },
        status: { _eq: "active" },
      },
      fields: ["id"],
      limit: 1,
    })
  );
  return (rows?.[0] as any)?.id ?? null;
}

/**
 * The caller's CURRENT-TERM board office title in an org, or null if they hold
 * none. "Current term" = published row whose term has started (term_start null
 * or ≤ today) and not ended (term_end null or ≥ today). Fails closed (null) on
 * any lookup error.
 */
export async function getBoardPosition(
  event: H3Event,
  organizationId: string
): Promise<BoardTitle | null> {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) return null;

  const snapshot = await accessSnapshot(event, organizationId, "base");
  if (snapshot) return boardPositionFrom(snapshot) as BoardTitle | null;

  try {
    // The same active-membership read getMemberId makes, once per request.
    const memberId = (await checkMembership(event, organizationId)).memberId ?? null;
    if (!memberId) return null;

    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems("hoa_board_members", {
        filter: {
          _and: [
            { hoa_member: { _eq: memberId } },
            { status: { _eq: "published" } },
            { _or: [{ term_start: { _lte: now } }, { term_start: { _null: true } }] },
            { _or: [{ term_end: { _gte: now } }, { term_end: { _null: true } }] },
          ],
          // term_start/term_end are string-typed in the schema; the SDK's
          // operator types don't allow _lte/_gte there (known gap).
        } as any,
        fields: ["title"],
        sort: ["sort"],
        limit: 1,
      })
    );
    return ((rows?.[0] as any)?.title as BoardTitle) || null;
  } catch (e) {
    console.error("[board-access] position lookup failed:", e);
    return null;
  }
}

/** The caller's current-term board seat as an actor, or null (one read; fails closed). */
export async function getBoardSeatActor(event: H3Event, orgId: string): Promise<Actor | null> {
  try {
    const session = await getUserSession(event);
    const userId = session?.user?.id;
    if (!userId) return null;
    const snapshot = await accessSnapshot(event, orgId, "base");
    if (snapshot) return boardSeatActorFrom(snapshot);
    const today = new Date().toISOString().split("T")[0];
    // Same term rule getBoardPosition applies, with the membership as a join: one round trip where
    // getBoardPosition needs two (the membership, then the seat).
    const rows = await getTypedDirectus().request(
      readItems("hoa_board_members", {
        filter: {
          _and: [
            { hoa_member: { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" } } },
            { status: { _eq: "published" } },
            { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
            { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
          ],
        } as any,
        fields: ["title"],
        sort: ["sort"],
        limit: 1,
      })
    );
    return boardTitleToActor(((rows?.[0] as any)?.title as BoardTitle) ?? null);
  } catch {
    return null;
  }
}

/**
 * The full set of actor hats the caller wears in an org. Used by the
 * capabilities endpoint (UI gating) and by routes that need a capability check.
 * Order is not significant — `hasCapability` ORs across them.
 */
export async function resolveActors(
  event: H3Event,
  organizationId: string,
  /** Manager grants a caller already has in flight, so they are read once. */
  grantsRead?: Promise<Record<string, boolean> | null>
): Promise<Actor[]> {
  const actors = new Set<Actor>();
  // The team-lead check needs the full snapshot; read it first, so the
  // membership questions share its one request (access-snapshot.ts).
  await accessSnapshot(event, organizationId);

  // None of these reads needs another's result: one round trip, not five.
  const [admin, membership, office, grants, isTeamLead] = await Promise.all([
    checkAdminAccess(event, organizationId),
    checkMembership(event, organizationId),
    getBoardPosition(event, organizationId),
    grantsRead ?? getManagerGrants(event, organizationId),
    // Team lead of any team in the org.
    (async () => {
      try {
        const session = await getUserSession(event);
        const userId = session?.user?.id;
        if (!userId) return false;
        const snapshot = await accessSnapshot(event, organizationId);
        if (snapshot) return isTeamLeadFrom(snapshot);
        const rows = await getTypedDirectus().request(
          readItems("hoa_team_members", {
            filter: {
              user: { _eq: userId },
              organization: { _eq: organizationId },
              role: { _eq: "lead" },
            },
            fields: ["id"],
            limit: 1,
          })
        );
        return !!rows?.length;
      } catch (e) {
        console.error("[board-access] team-lead lookup failed:", e);
        return false;
      }
    })(),
  ]);

  if (admin.isAdmin) actors.add("admin");
  if (membership.isMember) actors.add("member");
  const boardActor = boardTitleToActor(office);
  if (boardActor) actors.add(boardActor);
  if (grants) actors.add("property_manager");
  if (isTeamLead) actors.add("team_lead");

  return [...actors];
}
