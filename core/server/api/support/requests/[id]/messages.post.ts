// POST /api/support/requests/:id/messages — the requester (or their community's
// HOA Admin, or the billing account's admin) adds to a platform request. It goes
// to HOA Connect by email and reopens the request. Body: { body, attachmentIds? };
// a message may be attachments alone.
import { z } from "zod";
import { BODY_MAX, supportAccess } from "#core/shared/support/access";
import { ATTACHMENTS_PER_MESSAGE } from "#core/shared/support/attachments";
import { rateLimit } from "#core/server/utils/rate-limit";
import { addSupportMessage, readSupportRequest, supportViewerFor } from "#core/server/utils/support";

const schema = z
  .object({
    body: z.string().trim().max(BODY_MAX).default(""),
    attachmentIds: z.array(z.string().uuid()).max(ATTACHMENTS_PER_MESSAGE, "Attach up to 5 files to one message.").optional(),
  })
  .refine((b) => b.body.length > 0 || !!b.attachmentIds?.length, "Write a message.");
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  const viewer = await supportViewerFor(event);
  if (!rateLimit(`support-msg:${viewer.userId}`, 30, 60 * 60_000)) {
    throw createError({ statusCode: 429, message: "Too many messages in an hour. Try again shortly." });
  }
  const id = getRouterParam(event, "id") ?? "";
  const req = id ? await readSupportRequest(id) : null;
  const access = req
    ? supportAccess({ ...viewer, staff: false }, { requester: idOf(req.requester), organization: idOf(req.organization), billing_account: idOf(req.billing_account) })
    : null;
  if (!req || !access || access === "staff") throw createError({ statusCode: 404, message: "Request not found" });

  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Write a message." });

  return addSupportMessage({
    request: req,
    author: { id: viewer.userId },
    kind: access,
    body: parsed.data.body,
    attachmentIds: parsed.data.attachmentIds,
  });
});
