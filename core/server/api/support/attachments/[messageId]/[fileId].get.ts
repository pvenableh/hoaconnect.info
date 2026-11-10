// GET /api/support/attachments/:messageId/:fileId — one attachment, to someone
// who may see that message: HOA Connect staff (App Admin, Platform Support) any;
// the requester, their community's HOA Admins and the billing account's admins
// the request's messages except internal notes (core/shared/support/access.ts).
// Anyone else, or a file the message doesn't carry: 404. Raster images show
// inline; everything else downloads. Never a public asset URL.
import { readItems } from "@directus/sdk";
import { contentDisposition, INLINE_ATTACHMENT_TYPES } from "#core/shared/support/attachments";
import { supportAccess } from "#core/shared/support/access";
import { messageAttachments, readSupportAttachmentBytes } from "#core/server/utils/support-attachments";
import { readSupportRequest, supportViewerFor } from "#core/server/utils/support";

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  const viewer = await supportViewerFor(event);
  const messageId = getRouterParam(event, "messageId") ?? "";
  const fileId = getRouterParam(event, "fileId") ?? "";
  const notFound = () => createError({ statusCode: 404, message: "Attachment not found" });
  if (!messageId || !fileId) throw notFound();

  const message = (
    (await getTypedDirectus().request(
      readItems("support_messages", { filter: { id: { _eq: messageId } }, fields: ["id", "request", "internal", "attachments"], limit: 1 })
    )) as any[]
  )?.[0];
  const file = message ? messageAttachments(message).find((a) => a.id === fileId) : null;
  const req = file ? await readSupportRequest(idOf(message.request) ?? "") : null;
  if (!req) throw notFound();
  if (!viewer.staff) {
    if (message.internal) throw notFound();
    const ref = { requester: idOf(req.requester), organization: idOf(req.organization), billing_account: idOf(req.billing_account) };
    if (!supportAccess({ ...viewer, staff: false }, ref)) throw notFound();
  }

  const bytes = await readSupportAttachmentBytes(file!.id).catch(() => null);
  if (!bytes) throw notFound();
  const inline = INLINE_ATTACHMENT_TYPES.has(file!.type);
  setResponseHeaders(event, {
    "Content-Type": inline || file!.type !== "text/plain" ? file!.type : "text/plain; charset=utf-8",
    "Content-Length": String(bytes.byteLength),
    "Content-Disposition": contentDisposition(file!.name, inline),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  return bytes;
});
