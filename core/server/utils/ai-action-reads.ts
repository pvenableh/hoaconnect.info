/**
 * The reads behind the assistant's action routes, as batch specs.
 *
 * Each route checked the caller's standing (the access snapshot) and then
 * made its own read: two requests in two rounds, and Directus serves
 * requests in turn (~40ms of CPU each). These specs ride with the access
 * snapshot as ONE request (batchWithAccessSnapshot); each route still
 * refuses before it returns any of the rows.
 */
import type { CountSpec, ReadSpec } from "./directus-graphql";

/** The query GET /api/ai/actions takes: the community, and optional status, entity and limit. */
export interface ActionListQuery {
  status?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  limit?: unknown;
}

/** The feed's filter, as the route always built it. */
export function actionListFilter(orgId: string, q: ActionListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (q.status) filter.status = { _eq: String(q.status) };
  if (q.entityType && q.entityId) {
    filter.entity_type = { _eq: String(q.entityType) };
    filter.entity_id = { _eq: String(q.entityId) };
  }
  return filter;
}

/** The feed's page size: 50 unless asked, at most 200. */
export const actionListLimit = (q: ActionListQuery) => Math.min(Number(q.limit) || 50, 200);

/** The action feed for a community, newest first, with who asked and who decided. */
export function actionListSpec(orgId: string, q: ActionListQuery): ReadSpec {
  return {
    collection: "ai_actions",
    filter: actionListFilter(orgId, q),
    fields: [
      "id", "action_type", "status", "category", "risk", "outbound",
      "payload", "preview", "result", "error_message", "title",
      "entity_type", "entity_id", "date_created", "date_updated",
      "requested_by.first_name", "requested_by.last_name",
      "approved_by.first_name", "approved_by.last_name",
    ],
    sort: ["-date_created"],
    limit: actionListLimit(q),
  };
}

/** How many of the community's proposals await approval (the launcher badge). */
export function pendingCountSpec(orgId: string): CountSpec {
  return {
    collection: "ai_actions",
    count: "*",
    filter: { organization: { _eq: orgId }, status: { _eq: "pending" } },
  };
}
