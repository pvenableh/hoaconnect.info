// POST /api/support/requests — "Contact HOA Connect".
//
// Body: organizationId or billingAccountId (the context), category, subject,
// body, and optionally page, appVersion and attachmentIds (POST /api/support/attachments). The person's roles there decide
// which categories they may use (core/shared/support/access.ts); a resident may
// only report an app problem, and a Property Manager needs `contact_platform`.
// The roles at this moment are stored on the request.
import { z } from "zod";
import { BODY_MAX, SUBJECT_MAX, supportCategoriesFor } from "#core/shared/support/access";
import { ATTACHMENTS_PER_MESSAGE } from "#core/shared/support/attachments";
import { rateLimit } from "#core/server/utils/rate-limit";
import { createSupportRequest, supportRolesFor } from "#core/server/utils/support";

const schema = z
  .object({
    organizationId: z.string().min(1).optional(),
    billingAccountId: z.string().min(1).optional(),
    category: z.enum(["question", "bug", "billing", "feature"], { message: "Choose what it's about." }),
    subject: z.string().trim().min(3, "Give it a short subject.").max(SUBJECT_MAX),
    body: z.string().trim().min(10, "Say a little more, so we can help.").max(BODY_MAX),
    page: z.string().max(500).optional(),
    appVersion: z.string().max(64).optional(),
    attachmentIds: z.array(z.string().uuid()).max(ATTACHMENTS_PER_MESSAGE, "Attach up to 5 files to one message.").optional(),
  })
  .refine((b) => !!b.organizationId !== !!b.billingAccountId, "Choose a community or a billing account.");

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  if (!rateLimit(`support-new:${userId}`, 10, 60 * 60_000)) {
    throw createError({ statusCode: 429, message: "That's a lot of requests in an hour. Add to an open one instead." });
  }
  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const b = parsed.data;

  const roles = await supportRolesFor(userId, { organizationId: b.organizationId, billingAccountId: b.billingAccountId });
  const allowed = supportCategoriesFor(roles);
  if (!allowed.includes(b.category)) {
    throw createError({
      statusCode: 403,
      message: allowed.length
        ? "Residents can report a problem with the app here. Questions about your community go to your community."
        : "Your role here can't contact HOA Connect. Ask your community's HOA Admin.",
    });
  }

  return createSupportRequest({
    requester: { id: userId },
    organizationId: b.organizationId ?? null,
    billingAccountId: b.billingAccountId ?? null,
    roles,
    category: b.category,
    subject: b.subject,
    body: b.body,
    page: b.page ?? null,
    appVersion: b.appVersion ?? null,
    attachmentIds: b.attachmentIds,
  });
});
