/**
 * GET /api/org/change-requests/:id/document?orgId= — the signed lease on an
 * owner's lease report.
 *
 * Until the lease is approved no record claims the file, so the asset proxy
 * refuses it to everyone; this serves it by the request instead:
 *   - a reviewer (admin, or a manager with the directory grant) while it waits;
 *   - an admin at any time;
 *   - the owner who sent it.
 * Once approved, the lease's own readers open it through the asset proxy
 * (lease-documents.ts).
 */
import { readFile, readItem } from "@directus/sdk";
import { streamDirectusFile } from "#core/server/utils/asset-stream";

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const id = getRouterParam(event, "id");
  const orgId = String(getQuery(event).orgId || "");
  if (!id) throw createError({ statusCode: 400, message: "Missing request id" });
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();
  const cr = (await directus
    .request(readItem("hoa_member_change_requests", id, { fields: ["id", "kind", "status", "organization", "submitted_by", "payload"] }))
    .catch(() => null)) as { kind?: string | null; status?: string | null; organization?: unknown; submitted_by?: unknown; payload?: any } | null;
  const fileId = typeof cr?.payload?.document === "string" ? cr.payload.document : null;
  if (!cr || idOf(cr.organization) !== orgId || cr.kind !== "lease" || !fileId) {
    throw createError({ statusCode: 404, message: "Document not found" });
  }

  const mine = idOf(cr.submitted_by) === userId;
  const allowed =
    mine ||
    (await checkAdminAccess(event, orgId)).isAdmin ||
    (cr.status === "pending" && (await isChangeReviewer(event, orgId)));
  if (!allowed) throw createError({ statusCode: 403, message: "Not authorized to read this document." });

  const file = (await directus
    .request(readFile(fileId, { fields: ["id", "filename_download"] }))
    .catch(() => null)) as { id: string; filename_download?: string | null } | null;
  if (!file) throw createError({ statusCode: 404, message: "Document not found" });

  return streamDirectusFile(event, file, { transforms: false });
});
