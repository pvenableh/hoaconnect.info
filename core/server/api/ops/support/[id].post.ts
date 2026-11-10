// POST /api/ops/support/:id — set a platform request's status or priority.
// App Admin and Platform Support (`support`). Body: { status?, priority? }.
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { rateLimit } from "#core/server/utils/rate-limit";
import { readSupportRequest } from "#core/server/utils/support";

const schema = z
  .object({
    status: z.enum(["new", "open", "waiting", "closed"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  })
  .refine((b) => b.status || b.priority, "Nothing to change.");

export default defineEventHandler(async (event) => {
  const actor = await requireOpsPermission(event, "support");
  if (!rateLimit(`ops-support:${actor.userId}`, 120, 10 * 60_000)) {
    throw createError({ statusCode: 429, message: "Too many changes in a short time." });
  }
  const id = getRouterParam(event, "id") ?? "";
  const req = id ? await readSupportRequest(id) : null;
  if (!req) throw createError({ statusCode: 404, message: "Request not found" });
  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { status, priority } = parsed.data;

  const data: Record<string, unknown> = {
    ...(status ? { status, closed_at: status === "closed" ? new Date().toISOString() : null } : {}),
    ...(priority ? { priority } : {}),
  };
  await getTypedDirectus().request(updateItem("support_requests", req.id, data));
  return { ok: true, status: status ?? req.status, priority: priority ?? req.priority };
});
