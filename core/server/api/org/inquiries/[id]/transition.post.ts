/**
 * POST /api/org/inquiries/:id/transition — { orgId, to }: move a request along
 * its workflow (docs/spec-delegation.md). The server reads the request, checks
 * `to` is a move its workflow allows from where it stands (planTransition),
 * writes the status, posts the system note to the request's thread, and tells
 * the submitter through the reminder engine when the status is news to them.
 *
 * Admin, the `inquiries` area, or the `violations` area for a violation
 * (readAreaRequest); 404 for a request of another community or outside that
 * scope, 409 for a move the workflow does not allow.
 * Returns the request and the note's id, which the page announces as it
 * announces any comment (`announce` false when the submitter hears otherwise).
 */
import { createItem } from "@directus/sdk";
import { z } from "zod";
import { requireOrgId } from "#core/server/utils/area-reads";
import { readAreaRequest, writeAreaRequest } from "#core/server/utils/area-requests";
import { planTransition } from "#core/shared/requests/managed";

const Body = z.object({ orgId: z.string().optional(), to: z.string().trim().min(1, "to is required") });

export default defineEventHandler(async (event) => {
  const raw = await readBody(event).catch(() => null);
  const orgId = requireOrgId(raw?.orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Invalid body" });

  const { request } = await readAreaRequest(event, orgId, id);
  const session = await requireUserSession(event);
  const plan = planTransition(request, parsed.data.to, String(session.user?.id ?? "") || null, new Date());
  if (plan.ok === false) throw createError({ statusCode: 409, message: plan.reason });

  const updated = await writeAreaRequest(orgId, id, plan.patch);

  // The timeline's note. Best-effort, as in the browser: a move never fails on it.
  let commentId: string | null = null;
  try {
    const note: any = await getTypedDirectus().request(
      createItem("hoa_comments" as any, {
        status: "published",
        target_collection: "hoa_requests",
        target_id: id,
        organization: orgId,
        is_internal: false,
        body: plan.comment,
      } as any)
    );
    commentId = note?.id ? String(note.id) : null;
  } catch (e) {
    console.warn("[inquiries/transition] system note failed:", e);
  }

  if (plan.tellsSubmitter) {
    await Promise.resolve()
      .then(() => notifyReminderEvent(orgId, { collection: "hoa_requests", id }, "status"))
      .catch((e) => console.warn("[inquiries/transition] status event failed:", e));
  }

  return { request: updated, label: plan.label, commentId, announce: !plan.tellsSubmitter };
});
