/**
 * Reads for an area's pages, made with the app's token behind `requireAreaWork`
 * (docs/spec-delegation.md). A helper is a plain HOA Member in Directus, so an
 * area becomes holdable only once every page in it reads and writes through a
 * route; these helpers are how the inquiries, violations, directory,
 * communications and meetings routes do that.
 *
 * The route's reads ride with the caller's access snapshot as ONE request
 * (docs/prompts/perf-batch-next-routes.md), and the gate decides before any
 * row is returned. A failed batch reads one by one after the gate.
 */
import type { H3Event } from "h3";
import type { BatchSpec } from "#core/server/utils/directus-graphql";
import { readItemsBatchRest } from "#core/server/utils/directus-graphql";
import type { ManagerGrantKey } from "#core/shared/transition/grants";

/** The `orgId` from the query (GET, DELETE) or a body, or 400. */
export function requireOrgId(value: unknown): string {
  const orgId = typeof value === "string" ? value.trim() : "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  return orgId;
}

/**
 * `specs` read for a caller who can work `area` in `orgId`: 401 without a
 * session, 403 for anyone else, and nothing read is returned before the gate.
 */
export async function readForArea<K extends string>(
  event: H3Event,
  orgId: string,
  area: ManagerGrantKey,
  specs: Record<K, BatchSpec>
): Promise<{ rows: Record<K, any[]>; via: "admin" | "manager" | "helper" }> {
  await requireUserSession(event);
  const batched = await Promise.resolve()
    .then(() => batchWithAccessSnapshot(event, orgId, specs))
    .catch(() => null);
  const { via } = await requireAreaWork(event, orgId, area);
  return { rows: batched ?? (await readItemsBatchRest(specs)), via };
}
