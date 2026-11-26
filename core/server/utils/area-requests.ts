/**
 * The inquiries area's reads (docs/spec-delegation.md): the community's
 * requests and one request with its linked channel, read with the app's token
 * behind requireAreaWork("inquiries"). A request of another community is a
 * 404, never a 403, so an id says nothing about where it lives.
 */
import type { H3Event } from "h3";
import { readItems, updateItem } from "@directus/sdk";
import { MANAGED_REQUEST_FIELDS } from "#core/shared/requests/managed";
import type { ReadSpec } from "#core/server/utils/directus-graphql";
import { readForArea } from "#core/server/utils/area-reads";

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

export function requestListSpec(orgId: string): ReadSpec {
  return {
    collection: "hoa_requests",
    filter: { organization: { _eq: orgId } },
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

/** One request of `orgId` for a caller who works inquiries: 401, 403, then 404. */
export async function readAreaRequest(event: H3Event, orgId: string, id: string) {
  const { rows, via } = await readForArea(event, orgId, "inquiries", { request: requestSpec(orgId, id) });
  const request = rows.request?.[0];
  if (!request || idOf(request.organization) !== orgId) throw createError({ statusCode: 404, message: "Request not found" });
  return { request, via };
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
