/**
 * POST /api/email/:id/resume — resume a send that paused itself (Phase 4,
 * core/server/utils/email-send-health.ts). `paused` → `sending`, with the
 * event counts at this moment stored as the baseline, so only new bounces and
 * spam reports are judged from here on. Its rows were never claimed while it
 * was paused; the next tick carries on where it stopped.
 *
 * Same gate as the send and the progress route. 409 unless the email is
 * paused (already resumed, never paused), or while a tick holds its lease.
 * Answers the progress object, so the dialog re-renders at once.
 */
import { readItem } from "@directus/sdk";
import { directusRecipientStore, emailQueueSchema } from "../../../utils/email-send-queue";
import { directusHealthStore, emailPhase4Schema, resumeSend } from "../../../utils/email-send-health";
import { readSendProgress } from "../../../utils/email-send-tick";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Email ID is required" });

  const directus = getTypedDirectus();
  const email = (await directus
    .request(readItem("hoa_emails", id, { fields: ["id", "organization", "status"] }))
    .catch(() => null)) as { organization?: string | { id: string } | null; status?: string | null } | null;
  if (!email) throw createError({ statusCode: 404, message: "Email not found" });
  const organizationId = typeof email.organization === "object" ? email.organization?.id : email.organization;
  if (!organizationId) throw createError({ statusCode: 404, message: "Email not found" });
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  if (email.status !== "paused" || !(await emailQueueSchema(directus))) {
    throw createError({ statusCode: 409, message: "This email isn't paused.", data: { code: "not_paused" } });
  }

  const bounceTypes = await emailPhase4Schema(directus).catch(() => false);
  const outcome = await resumeSend(directusRecipientStore(directus), directusHealthStore(directus, { bounceTypes }), id, {
    now: () => Date.now(),
  });
  if (outcome === "busy") {
    throw createError({ statusCode: 409, message: "The send is busy; try again in a moment.", data: { code: "send_busy" } });
  }
  if (outcome === "not_paused") {
    throw createError({ statusCode: 409, message: "This email isn't paused.", data: { code: "not_paused" } });
  }

  const progress = await readSendProgress(directus, id);
  return { ...progress, provisioned: true };
});
