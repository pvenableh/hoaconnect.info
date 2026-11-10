// POST /api/ops/support/:id/messages — HOA Connect replies, or adds an internal
// note. App Admin and Platform Support (`support`). Body: { body, internal? }.
// A reply reaches the requester by bell and email (or email alone without a
// community) and sets the request to "waiting on you"; a note reaches no one.
import { z } from "zod";
import { BODY_MAX } from "#core/shared/support/access";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { rateLimit } from "#core/server/utils/rate-limit";
import { addSupportMessage, readSupportRequest } from "#core/server/utils/support";

const schema = z.object({
  body: z.string().trim().min(1, "Write a message.").max(BODY_MAX),
  internal: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const actor = await requireOpsPermission(event, "support");
  if (!rateLimit(`ops-support:${actor.userId}`, 120, 10 * 60_000)) {
    throw createError({ statusCode: 429, message: "Too many messages in a short time." });
  }
  const id = getRouterParam(event, "id") ?? "";
  const req = id ? await readSupportRequest(id) : null;
  if (!req) throw createError({ statusCode: 404, message: "Request not found" });
  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Write a message." });

  const row = await addSupportMessage({
    request: req,
    author: { id: actor.userId },
    kind: "staff",
    body: parsed.data.body,
    internal: parsed.data.internal === true,
  });
  return { ok: true, id: row.id, internal: parsed.data.internal === true };
});
