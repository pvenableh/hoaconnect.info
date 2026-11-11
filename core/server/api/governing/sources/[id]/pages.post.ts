// POST /api/governing/sources/:id/pages (multipart/form-data) — store one page
// of an original: the image the browser rendered and, when the PDF has a text
// layer, that page's text. Managers only. Fields: `page_number`, `image`
// (JPEG, PNG or WebP), `text` (optional).
//
// Sending a page again replaces its image and keeps text already taken.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { storeSourcePage } from "#core/server/utils/governing-pages";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const form = (await readMultipartFormData(event)) ?? [];
  const image = form.find((part) => part.name === "image");
  if (!image?.data?.length) throw createError({ statusCode: 400, message: "That page image is empty" });
  const text = form.find((part) => part.name === "text")?.data;

  return storeSourcePage(orgId, String(getRouterParam(event, "id") ?? ""), {
    page_number: Number(form.find((part) => part.name === "page_number")?.data?.toString() ?? ""),
    bytes: new Uint8Array(image.data),
    type: image.type || "application/octet-stream",
    // As the browser read it from the file: not trimmed, not normalized.
    text: text ? text.toString("utf8") : null,
  });
});
