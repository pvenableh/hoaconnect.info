/**
 * GET /api/org/forms/:id/document?orgId= — the document a form asks people to
 * read before signing. Readers: an admin or board of this community, or a
 * member the form addresses (open forms only).
 */
import { readFile } from "@directus/sdk";
import { streamDirectusFile } from "#core/server/utils/asset-stream";
import { formReaches } from "#core/shared/home/forms";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  const orgId = String(getQuery(event).orgId || "");
  if (!id || !orgId) throw createError({ statusCode: 400, statusMessage: "id and orgId are required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });

  const form = (await readSignForms(orgId, { onlyId: id }))[0];
  if (!form?.document) throw createError({ statusCode: 404, statusMessage: "Document not found" });
  const staff = context.hats.admin || context.hats.board;
  const addressed = form.status === "open" && formReaches(form.audience, { residency: context.residency, board: context.hats.board });
  if (!staff && !addressed) throw createError({ statusCode: 403, statusMessage: "Not authorized to read this document." });

  const file = (await getTypedDirectus()
    .request(readFile(form.document, { fields: ["id", "filename_download"] }))
    .catch(() => null)) as { id: string; filename_download?: string | null } | null;
  if (!file) throw createError({ statusCode: 404, statusMessage: "Document not found" });
  return streamDirectusFile(event, file, { transforms: false });
});
