/**
 * The inquiries area's reads (docs/spec-delegation.md): the community's
 * requests and one request with its linked channel, read with the app's token
 * behind requireAreaWork. "inquiries" reads every request; "violations" alone
 * reads the violation requests (they are worked on the same page). A request
 * of another community, or outside the caller's scope, is a 404, never a 403,
 * so an id says nothing about where it lives.
 */
import type { H3Event } from "h3";
import { readItems, updateItem } from "@directus/sdk";
import { MANAGED_REQUEST_FIELDS } from "#core/shared/requests/managed";
import type { ReadSpec } from "#core/server/utils/directus-graphql";
import { readBeforeGate } from "#core/server/utils/area-reads";

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

/** Which requests the caller works: every one (inquiries), or the violations. 403 for neither. */
export type RequestScope = "all" | "violations";

export async function requestScope(event: H3Event, orgId: string): Promise<RequestScope> {
  try {
    await requireAreaWork(event, orgId, "inquiries");
    return "all";
  } catch (e: any) {
    if (e?.statusCode !== 403) throw e;
  }
  await requireAreaWork(event, orgId, "violations");
  return "violations";
}

export function requestListSpec(orgId: string, scope: RequestScope = "all"): ReadSpec {
  return {
    collection: "hoa_requests",
    filter: { organization: { _eq: orgId }, ...(scope === "violations" ? { type: { _eq: "violation" } } : {}) },
    fields: [...MANAGED_REQUEST_FIELDS],
    sort: ["-date_updated"],
    limit: 100,
  };
}

export function requestSpec(orgId: string, id: string): ReadSpec {
  return {
    collection: "hoa_requests",
    filter: { id: { _eq: id }, organization: { _eq: orgId } },
    fields: [...MANAGED_REQUEST_FIELDS],
    limit: 1,
  };
}

/**
 * The requests a caller works in `orgId`: both lists ride in one batch with
 * the access snapshot, and the scope picks one. 401, then 403.
 */
export async function readAreaRequests(event: H3Event, orgId: string) {
  const read = await readBeforeGate(event, orgId, { all: requestListSpec(orgId), violations: requestListSpec(orgId, "violations") });
  const scope = await requestScope(event, orgId);
  const rows = await read.rows();
  return { requests: rows[scope] ?? [], scope };
}

/**
 * One request of `orgId` in the caller's scope: 401, 403, then 404. `extra`
 * specs ride in the same batch and come back in `rows` only once the request
 * has passed the gate.
 */
export async function readAreaRequest<K extends string = never>(
  event: H3Event,
  orgId: string,
  id: string,
  extra?: Record<K, ReadSpec>
): Promise<{ request: any; scope: RequestScope; rows: Record<K, any[]> }> {
  const read = await readBeforeGate(event, orgId, { ...(extra ?? ({} as Record<K, ReadSpec>)), request: requestSpec(orgId, id) });
  const scope = await requestScope(event, orgId);
  const { request: found, ...rows } = await read.rows();
  const request = found?.[0];
  if (!request || idOf(request.organization) !== orgId) throw createError({ statusCode: 404, message: "Request not found" });
  if (scope === "violations" && request.type !== "violation") throw createError({ statusCode: 404, message: "Request not found" });
  return { request, scope, rows: rows as Record<K, any[]> };
}

/** The fields the comment thread reads, as useComments reads them. */
export const NOTE_FIELDS = [
  "id", "status", "target_collection", "target_id", "parent_comment", "body", "attachments",
  "mentioned_users", "is_edited", "is_internal", "is_hidden", "hidden_reason", "report_count",
  "organization", "date_created", "date_updated",
  "user_created.id", "user_created.first_name", "user_created.last_name", "user_created.email", "user_created.avatar",
] as const;

/** A request's internal notes (board-only comments), oldest first. */
export function internalNotesSpec(orgId: string, requestId: string): ReadSpec {
  return {
    collection: "hoa_comments",
    filter: {
      organization: { _eq: orgId },
      target_collection: { _eq: "hoa_requests" },
      target_id: { _eq: requestId },
      is_internal: { _eq: true },
      status: { _neq: "deleted" },
    },
    fields: [...NOTE_FIELDS],
    sort: ["date_created"],
    limit: 200,
  };
}

/** The channel a ticket's discussion lives in, or null (no channels module, or the field before its migration). */
export async function linkedChannelOf(orgId: string, requestId: string): Promise<{ id: string; name: string; slug: string } | null> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_channels" as any, {
        filter: { request: { _eq: requestId }, organization: { _eq: orgId } },
        fields: ["id", "name", "slug"],
        limit: 1,
      } as any)
    )) as any[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Write a patch to a request already read for this org, and read it back with the page's fields. */
export async function writeAreaRequest(orgId: string, id: string, patch: Record<string, any>) {
  const directus = getTypedDirectus();
  await directus.request(updateItem("hoa_requests" as any, id, patch as any));
  const rows = (await directus.request(readItems("hoa_requests" as any, requestSpec(orgId, id) as any))) as any[];
  return rows?.[0] ?? null;
}
