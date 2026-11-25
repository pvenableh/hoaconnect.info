/**
 * The list reads behind GET /api/org/projects and /api/org/projects-timeline,
 * made in the same request as the caller's access snapshot.
 *
 * Each route asked getProjectAccess first (the snapshot's memberships, then
 * its teams, restrictions and area grants for the helper check, then the
 * caller's team rows) and read its list after: four Directus requests, and
 * Directus serves them one after another (~40ms of CPU each). Which rows the
 * caller may see depends on that answer (elevated callers see every project;
 * members only `member_visible` ones), so the batch reads both lists and the
 * route keeps the one the answer allows. A caller refused afterwards gets the
 * refusal and none of these rows.
 *
 * If the batch fails (an id that is not a UUID makes Directus refuse the
 * read, say), `projectRowsWithAccess` returns null and the route reads as it
 * did, so its errors are the ones it always gave.
 */
import type { H3Event } from "h3";
import { getProjectAccess, type ProjectAccess } from "./project-access";
import { batchWithAccessSnapshot } from "./access-snapshot";
import type { ReadSpec } from "./directus-graphql";

type Query = Record<string, unknown>;

/** The fields /api/org/projects reads, as dotted paths. */
export const PROJECT_LIST_FIELDS = [
  "id", "status", "title", "description",
  "team.id", "team.name", "team.color",
  "parent_project.id", "parent_project.title",
  "parent_event.id", "parent_event.title",
  "start_date", "due_date", "completion_date", "color", "icon", "member_visible",
  "budget_amount", "actual_spend", "sort", "date_created", "date_updated",
  "assigned_to.directus_users_id.id", "assigned_to.directus_users_id.first_name",
  "assigned_to.directus_users_id.last_name", "assigned_to.directus_users_id.avatar",
  "events.id", "events.status", "events.is_milestone", "events.event_date",
  "children.id", "children.title", "children.status",
  "requests.id",
  "tasks.id", "tasks.status",
] as const;

/** GET /api/org/projects: every matching project, and the member-visible ones. */
export function projectListSpecs(orgId: string, query: Query): { pr_all: ReadSpec; pr_visible: ReadSpec } {
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (query.status) filter.status = { _eq: String(query.status) };
  if (query.team) filter.team = { _eq: String(query.team) };
  if (query.parent === "none") filter.parent_project = { _null: true };
  else if (query.parent) filter.parent_project = { _eq: String(query.parent) };
  const spec = (f: Record<string, unknown>): ReadSpec => ({
    collection: "hoa_projects",
    filter: f,
    fields: PROJECT_LIST_FIELDS,
    sort: ["sort", "-date_updated"],
    limit: 200,
  });
  return { pr_all: spec(filter), pr_visible: spec({ ...filter, member_visible: { _eq: true } }) };
}

/** The fields /api/org/projects-timeline reads, as dotted paths. */
export const PROJECT_TIMELINE_FIELDS = [
  "id", "status", "title", "color", "icon",
  "start_date", "due_date", "completion_date", "member_visible",
  "team.id", "team.name", "team.color",
  "parent_event.id", "parent_event.title", "parent_event.project.id",
  "events.id", "events.status", "events.title", "events.type", "events.event_date", "events.end_date",
  "events.duration_days", "events.is_milestone", "events.approval", "events.sort",
] as const;

/** GET /api/org/projects-timeline: every project, and the member-visible ones. */
export function projectTimelineSpecs(orgId: string): { pr_all: ReadSpec; pr_visible: ReadSpec } {
  const spec = (f: Record<string, unknown>): ReadSpec => ({
    collection: "hoa_projects",
    filter: f,
    fields: PROJECT_TIMELINE_FIELDS,
    sort: ["sort", "start_date"],
    limit: 300,
  });
  return {
    pr_all: spec({ organization: { _eq: orgId } }),
    pr_visible: spec({ organization: { _eq: orgId }, member_visible: { _eq: true } }),
  };
}

/**
 * The route's rows and the caller's project access, from one request: the
 * specs ride with the access snapshot, and getProjectAccess then answers from
 * it. Null when the batch fails; the route then reads as it did.
 */
export async function projectRowsWithAccess<S extends Record<string, ReadSpec | undefined>>(
  event: H3Event,
  orgId: string,
  specs: S
): Promise<{ access: ProjectAccess; rows: { [K in keyof S]: undefined extends S[K] ? any[] | undefined : any[] } } | null> {
  // A spec left undefined is not read, and its rows are undefined.
  const present = Object.fromEntries(Object.entries(specs).filter(([, s]) => s)) as Record<string, ReadSpec>;
  let rows: Record<string, any[]>;
  try {
    rows = await batchWithAccessSnapshot(event, orgId, present);
  } catch {
    return null;
  }
  return { access: await getProjectAccess(event, orgId), rows: rows as any };
}
