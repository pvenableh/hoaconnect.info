/**
 * PATCH /api/org/inquiries/:id — { orgId, details }: "Save details" on a
 * request (docs/spec-delegation.md). Only the request's workflow detail
 * fields change (mergeDetails); its state, status and anything else in
 * metadata stay as they are. Admin, the `inquiries` area, or the `violations`
 * area for a violation (readAreaRequest); 404 for a request of another
 * community or outside that scope.
 */
import { z } from "zod";
import { requireOrgId } from "#core/server/utils/area-reads";
import { readAreaRequest, writeAreaRequest } from "#core/server/utils/area-requests";
import { mergeDetails } from "#core/shared/requests/managed";

const Body = z.object({
  orgId: z.string().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

export default defineEventHandler(async (event) => {
  const raw = await readBody(event).catch(() => null);
  const orgId = requireOrgId(raw?.orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Invalid body" });

  const { request } = await readAreaRequest(event, orgId, id);
  const metadata = mergeDetails(request, parsed.data.details);
  return { request: await writeAreaRequest(orgId, id, { metadata }) };
});
