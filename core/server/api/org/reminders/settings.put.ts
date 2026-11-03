/**
 * PUT /api/org/reminders/settings   (Settings → Reminders, Earnest parity round 3, Phase 5b)
 *
 *   { orgId | slug, send_hour?, timezone?, rules?: { <rule>: { enabled?, stages?, days?, tenants?, copy? } } }
 *
 * Saves `organization.settings.reminders` and the community's time zone. This
 * is a route, not a PATCH from the browser, because turning a rule on is the
 * board's approval of what goes out in its name: `approved_at` and
 * `approved_by` are stamped here, from the signed-in admin, together with
 * `enabled` (`prepareReminderSettings`) — a form can't forge who approved it.
 *
 * Before `pnpm create:reminder-log` has run there is no `block_settings.reminders`
 * to write: 409, with the command.
 */
import { createItem, readItems, updateItem } from "@directus/sdk";
import { prepareReminderSettings } from "#core/shared/reminders/admin";
import { resolveReminderSettings } from "#core/shared/reminders/settings";
import { validTimeZone } from "#core/shared/email/recurrence";
import { reminderSchema } from "../../../utils/reminders";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { orgId, userId } = await requireReminderAdmin(event, body);

  const directus = getTypedDirectus();
  if (!(await reminderSchema(directus))) {
    throw createError({ statusCode: 409, statusMessage: "Reminders aren't set up on this server yet. Run `pnpm create:reminder-log`." });
  }

  let timezone: string | undefined;
  if (body?.timezone !== undefined) {
    const tz = validTimeZone(body.timezone);
    if (!tz) throw createError({ statusCode: 400, statusMessage: "That isn't a time zone." });
    timezone = tz;
  }

  const rows = (await directus.request(
    readItems("hoa_organizations", {
      filter: { id: { _eq: orgId } },
      fields: ["id", "timezone", { settings: ["id", "reminders"] }] as any,
      limit: 1,
    })
  )) as any[];
  const org = rows?.[0];
  if (!org) throw createError({ statusCode: 404, statusMessage: "No such community." });

  const settingsRow = org.settings && typeof org.settings === "object" ? org.settings : null;
  const reminders = prepareReminderSettings(settingsRow?.reminders, body, { userId, now: new Date().toISOString() });

  if (settingsRow?.id) {
    await directus.request(updateItem("block_settings", settingsRow.id, { reminders } as any));
  } else {
    const created = (await directus.request(createItem("block_settings", { reminders } as any))) as any;
    await directus.request(updateItem("hoa_organizations", orgId, { settings: created.id } as any));
  }
  if (timezone && timezone !== org.timezone) {
    await directus.request(updateItem("hoa_organizations", orgId, { timezone } as any));
  }

  return {
    success: true,
    reminders,
    resolved: resolveReminderSettings(reminders),
    timezone: timezone ?? org.timezone ?? null,
  };
});
