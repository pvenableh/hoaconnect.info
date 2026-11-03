/**
 * GET /api/email/:id/progress — the send queue's progress (docs/spec-email-send-queue.md
 * §5.4), polled every 5 s by the compose page's send dialog and the detail page
 * while `phase !== "done"`.
 *
 * Same gate as the send: an admin of the email's org, or a property manager with
 * the communications grant; 404 for an email that doesn't exist or isn't
 * readable (the org check runs on the email's own org, so another org's id
 * answers 403 from the gate).
 *
 * `phase` is derived — preparing while `total_recipients` is null, done once
 * the status is sent/failed (or a recurring email is back to scheduled with
 * this occurrence finished), sending otherwise. The numbers come from one
 * aggregate over the occurrence's rows, so they are never ahead of the rows.
 */
import { readItem } from "@directus/sdk";
import { emailQueueSchema } from "../../../utils/email-send-queue";
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

  if (!(await emailQueueSchema(directus))) {
    // Before the queue exists a send finishes inside its request: report the status only.
    const done = email.status === "sent" || email.status === "failed";
    return { status: email.status ?? null, phase: done ? "done" : email.status === "sending" ? "sending" : "done", provisioned: false };
  }

  const progress = await readSendProgress(directus, id);
  if (!progress) throw createError({ statusCode: 404, message: "Email not found" });
  return { ...progress, provisioned: true };
});
