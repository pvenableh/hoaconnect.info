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
import { randomBytes } from "node:crypto";
import { boardTitleToActor, hasCapability } from "#core/shared/permissions";

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

/**
 * Authorize a milestone APPROVE/REJECT. Broader than a plain project write:
 * project owners (admin / PM-with-projects-grant / the project's team lead) may
 * decide, AND so may the executive board offices (president / VP) via the
 * `milestone:approve` capability — board oversight that doesn't require project
 * write rights. Throws 403 otherwise.
 */
export async function requireMilestoneApprove(
  event: H3Event,
  organizationId: string,
  projectTeamId?: string | null
): Promise<{ userId: string; via: "project" | "board" }> {
  const access = await getProjectAccess(event, organizationId);
  if (access.canWriteAll || (projectTeamId && access.leadTeamIds.includes(projectTeamId))) {
    return { userId: access.userId, via: "project" };
  }
  const office = await getBoardPosition(event, organizationId);
  const actor = boardTitleToActor(office);
  if (actor && hasCapability([actor], "milestone:approve")) {
    return { userId: access.userId, via: "board" };
  }
  throw createError({ statusCode: 403, message: "Not authorized to approve milestones" });
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

export interface EventMeta {
  id: string;
  organization: string;
  title: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectTeam: string | null;
  approval: string | null;
}

/**
 * Look up an event's org + owning project (id, title, team) for write checks
 * and notifications on the approval/spawn routes. Throws 404 when missing.
 */
export async function getEventMeta(eventId: string): Promise<EventMeta> {
  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { id: { _eq: eventId } },
      fields: ["id", "organization", "title", "approval", { project: ["id", "title", "team", "member_visible"] }],
      limit: 1,
    })
  );
  const ev = rows?.[0] as any;
  if (!ev) throw createError({ statusCode: 404, message: "Event not found" });
  const project = ev.project && typeof ev.project === "object" ? ev.project : null;
  return {
    id: ev.id,
    organization: typeof ev.organization === "string" ? ev.organization : ev.organization?.id,
    title: ev.title ?? null,
    projectId: project ? project.id : typeof ev.project === "string" ? ev.project : null,
    projectTitle: project?.title ?? null,
    projectTeam: project ? (typeof project.team === "string" ? project.team : project.team?.id ?? null) : null,
    approval: ev.approval ?? null,
  };
}

/** Unguessable token for a public approval link (URL-safe, ~32 chars). */
export function generateApprovalToken(): string {
  return randomBytes(24).toString("base64url");
}
