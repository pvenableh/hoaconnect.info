/**
 * POST /api/org/reminders/test   (Settings → Reminders, Earnest parity round 3, Phase 5b)
 *
 *   { orgId | slug, template: "reminder-dues" | "reminder-meeting" | "reminder-violation" | "reminder-poll" }
 *
 * "Send me a test": one sample reminder (the same one the preview shows, made
 * by the real rules) to the signed-in admin and nobody else — bell, push and
 * the email twin, through `sendReminder`, so it is the real path and the real
 * footer. Subject marked "[Test]". Never logged: no `hoa_reminder_log` row, so
 * it can't use up or collide with a real reminder's key.
 */
import { readItems } from "@directus/sdk";
import { orgTimeZone } from "#core/shared/org-timezone";
import { REMINDER_EMAIL_TEMPLATES, sampleReminders } from "../../../utils/reminder-email";
import { sendReminder } from "../../../utils/reminders";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { orgId, userId, email } = await requireReminderAdmin(event, body);

  const template = String(body?.template ?? "") as (typeof REMINDER_EMAIL_TEMPLATES)[number];
  if (!REMINDER_EMAIL_TEMPLATES.includes(template)) {
    throw createError({ statusCode: 400, statusMessage: `template must be one of ${REMINDER_EMAIL_TEMPLATES.join(", ")}` });
  }

  const rows = (await getTypedDirectus().request(
    readItems("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["id", "slug", "name", "timezone"] as any, limit: 1 })
  )) as any[];
  const org = rows?.[0];
  if (!org) throw createError({ statusCode: 404, statusMessage: "No such community." });

  const sample = sampleReminders(String(org.name || "Your community"))[template];
  const counts = await sendReminder(
    { id: orgId, slug: String(org.slug ?? ""), name: String(org.name ?? ""), timeZone: orgTimeZone(org), graceDays: 0, reminders: null },
    { ...sample, recipients: [userId], keys: [], subject: `[Test] ${sample.subject}` }
  );
  return { success: true, to: email, ...counts };
});
