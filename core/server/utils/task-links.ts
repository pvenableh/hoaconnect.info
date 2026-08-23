/**
 * Org-validation for the foreign keys a task carries.
 *
 * A task row is written with the CALLER's organization id, but its links —
 * project, phase, request, team, parent task, assignees — arrived in the
 * request body. Writing those on trust is not a dangling-pointer problem, it
 * is a cross-tenant READ: `GET /api/org/tasks` expands
 * `{ project: [...], project_event: ["id","title"], request: ["id","title"] }`,
 * so an id belonging to another community comes straight back out as that
 * community's project, phase or request title, inside a list the caller is
 * entitled to see. One unchecked id turns a task list into a window.
 *
 * So every link is resolved and confirmed to belong to the same org before it
 * is written, and anything that isn't gets a 404 — not a 403, because the
 * caller is not entitled to learn that the row exists somewhere else.
 *
 * The team that comes back is the one the WRITE CHECK should run against, from
 * the strongest link present: a project's own team beats a phase's project's
 * team, which beats a team named directly in the body. Precedence matters —
 * `requireProjectsWrite` lets a team LEAD through for their own team, and
 * taking the team from the body rather than from the project would let a lead
 * name their own team to authorise a write to somebody else's project.
 */

import { readItems } from "@directus/sdk";
import { orgMemberUserIds } from "./org-members";

export interface TaskLinkInput {
  project?: string | null;
  project_event?: string | null;
  request?: string | null;
  team?: string | null;
  parent_task?: string | null;
  assigned_to?: string[] | null;
}

export interface ResolvedTaskLinks {
  /** Team for the write check, from the strongest link present. */
  teamId: string | null;
  /** A project or phase was named — this is managed work, not a quick task. */
  linkedToProject: boolean;
}

/** One row of `collection` with this id, in this org, or a 404. */
async function requireInOrg(
  collection: string,
  id: string,
  organizationId: string,
  notFound: string,
  fields: (string | Record<string, unknown>)[] = ["id", "organization"],
): Promise<any> {
  const rows = (await getTypedDirectus().request(
    readItems(collection as never, {
      filter: { id: { _eq: id } },
      fields,
      limit: 1,
    } as never)
  )) as any[];
  const row = (rows || [])[0];
  const org = typeof row?.organization === "string" ? row.organization : row?.organization?.id;
  if (!row || org !== organizationId) {
    throw createError({ statusCode: 404, message: notFound });
  }
  return row;
}

/**
 * Validate every link a task write is trying to set, and report the team the
 * write check should use. Only the keys actually present are checked — a patch
 * that touches nothing but `title` costs no reads.
 */
export async function resolveTaskLinks(
  organizationId: string,
  links: TaskLinkInput,
): Promise<ResolvedTaskLinks> {
  let teamId: string | null = null;

  // Weakest first, so the stronger links below overwrite it.
  if (links.team) {
    await requireInOrg("hoa_teams", String(links.team), organizationId, "Team not found");
    teamId = String(links.team);
  }

  if (links.project_event) {
    const ev = await requireInOrg(
      "hoa_project_events",
      String(links.project_event),
      organizationId,
      "Milestone not found",
      ["id", "organization", { project: ["id", "team"] }],
    );
    teamId = typeof ev.project?.team === "string" ? ev.project.team : ev.project?.team?.id ?? null;
  }

  if (links.project) {
    const meta = await getProjectMeta(String(links.project));
    if (meta.organization !== organizationId) {
      throw createError({ statusCode: 404, message: "Project not found" });
    }
    teamId = meta.team;
  }

  if (links.request) {
    await requireInOrg("hoa_requests", String(links.request), organizationId, "Request not found");
  }

  // A subtask inherits nothing, but pointing at another community's task would
  // put this row inside that task's `subtasks` expansion.
  if (links.parent_task) {
    await requireInOrg("hoa_tasks", String(links.parent_task), organizationId, "Task not found");
  }

  if (links.assigned_to?.length) {
    await requireOrgMembers(organizationId, links.assigned_to);
  }

  return { teamId, linkedToProject: Boolean(links.project || links.project_event) };
}

/**
 * Every assignee must belong to this community.
 *
 * Assignment is not a quiet field: `notifyTaskAssigned` writes a bell row, may
 * send a push, and emails the person. An unchecked id therefore reaches a
 * stranger's inbox with this community's branding on it, which is worse than
 * the read leak the other checks close.
 *
 * This is the REJECT face of the same question `scopeRecipientsToOrg` asks on
 * the notification path, where the right answer is to drop the outsider rather
 * than fail the action. Both sit on `orgMemberUserIds` so the definition of
 * membership can't drift between the check and the send.
 */
export async function requireOrgMembers(
  organizationId: string,
  userIds: string[],
): Promise<void> {
  const wanted = [...new Set(userIds.filter(Boolean).map(String))];
  if (!wanted.length) return;

  const found = await orgMemberUserIds(organizationId, wanted);
  if (wanted.some((id) => !found.has(id))) {
    throw createError({
      statusCode: 404,
      message: "Assignee is not a member of this community",
    });
  }
}
