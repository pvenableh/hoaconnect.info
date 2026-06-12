/**
 * Project-module access checks (server-side enforcement).
 *
 * Same "elevated server route" doctrine as board/manager access: Directus
 * policies are only the org-scoped ceiling (admin full CRUD, member
 * read-only on member_visible rows). WHO may write projects is decided here:
 *
 *   write = org admin
 *         ∪ property manager with the `projects` grant
 *         ∪ team LEAD of the project's owning team
 *
 *   elevated read (sees non-member_visible projects + budget fields)
 *         = write set ∪ any team member in the org
 *
 * Members (non-elevated) read through these routes too — filtered to
 * member_visible projects with budget fields stripped — so the rules live in
 * exactly one place.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";

export interface ProjectAccess {
  userId: string;
  /** sees all projects + budget fields, may write per `canWrite` */
  elevated: boolean;
  /** admin or PM-with-grant — may write ANY project in the org */
  canWriteAll: boolean;
  /** team ids where the caller is LEAD (may write that team's projects) */
  leadTeamIds: string[];
  /** team ids where the caller is a member (elevated read) */
  teamIds: string[];
}

/**
 * Resolve the caller's project access for an org. Requires org membership
 * (throws 403 otherwise). Never throws for plain members — they get
 * non-elevated read access.
 */
export async function getProjectAccess(event: H3Event, organizationId: string): Promise<ProjectAccess> {
  const { userId } = await requireAuthenticatedUser(event);
  await requireMembership(event, organizationId);

  const admin = await checkAdminAccess(event, organizationId);
  let canWriteAll = admin.isAdmin;

  if (!canWriteAll) {
    const grants = await getManagerGrants(event, organizationId);
    if (grants && grants.projects === true) canWriteAll = true;
  }

  let leadTeamIds: string[] = [];
  let teamIds: string[] = [];
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems("hoa_team_members", {
        filter: {
          user: { _eq: userId },
          organization: { _eq: organizationId },
        },
        fields: ["team", "role"],
        limit: 50,
      })
    );
    teamIds = (rows || []).map((r: any) => (typeof r.team === "string" ? r.team : r.team?.id)).filter(Boolean);
    leadTeamIds = (rows || [])
      .filter((r: any) => r.role === "lead")
      .map((r: any) => (typeof r.team === "string" ? r.team : r.team?.id))
      .filter(Boolean);
  } catch (e) {
    console.error("[project-access] team lookup failed:", e);
  }

  return {
    userId,
    elevated: canWriteAll || teamIds.length > 0,
    canWriteAll,
    leadTeamIds,
    teamIds,
  };
}

/**
 * Authorize a project WRITE (create/update/delete, plus events/tasks under
 * it). For an existing project pass `projectTeamId` (the project's owning
 * team) so team leads of that team qualify. Throws 403 otherwise.
 */
export async function requireProjectsWrite(
  event: H3Event,
  organizationId: string,
  projectTeamId?: string | null
): Promise<ProjectAccess> {
  const access = await getProjectAccess(event, organizationId);
  if (access.canWriteAll) return access;
  if (projectTeamId && access.leadTeamIds.includes(projectTeamId)) return access;
  throw createError({ statusCode: 403, message: "Not authorized to manage projects" });
}

/** Budget fields stripped from non-elevated (member) responses. */
export const PROJECT_BUDGET_FIELDS = ["budget_amount", "actual_spend"] as const;
export const EVENT_BUDGET_FIELDS = ["cost_amount"] as const;

export function stripBudgetFields<T extends Record<string, any>>(row: T, keys: readonly string[]): T {
  const copy: Record<string, any> = { ...row };
  for (const k of keys) delete copy[k];
  return copy as T;
}

/**
 * Look up a project's org + team for write checks on nested routes. Throws
 * 404 when missing.
 */
export async function getProjectMeta(projectId: string): Promise<{ id: string; organization: string; team: string | null; member_visible: boolean }> {
  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_projects", {
      filter: { id: { _eq: projectId } },
      fields: ["id", "organization", "team", "member_visible"],
      limit: 1,
    })
  );
  const p = rows?.[0] as any;
  if (!p) throw createError({ statusCode: 404, message: "Project not found" });
  return {
    id: p.id,
    organization: typeof p.organization === "string" ? p.organization : p.organization?.id,
    team: typeof p.team === "string" ? p.team : p.team?.id ?? null,
    member_visible: !!p.member_visible,
  };
}
