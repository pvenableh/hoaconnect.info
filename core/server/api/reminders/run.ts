/**
 * The reminder engine's tick (Earnest parity round 3, Phase 5a) — Vercel Cron,
 * hourly (vercel.json), and by hand for an app admin.
 *
 *   ?dry=1          evaluate and list what would go out (and what the rules
 *                   that are off would send); writes nothing, sends nothing
 *   ?org=<slug|id>  one community
 *   ?asOf=<ISO>     dry runs only: evaluate at another moment ("what goes out
 *                   tomorrow at 9?")
 *
 * `run.ts`, not `run.post.ts`: Vercel Cron issues GET (see cron-auth.ts), and
 * a person can POST. Gate: CRON_SECRET (header `x-cron-secret` or a Bearer
 * token), or an app admin's session.
 *
 * Before `pnpm create:reminder-log` has run: 200 with `{ provisioned: false }`
 * and nothing else — except a dry run, which still evaluates (every org on New
 * York time, every rule off, an empty log) so a board can see what would go out.
 * The work is core/server/utils/reminders.ts; the rules core/shared/reminders/.
 */
import { requireCronOrAppAdmin } from "../../utils/cron-auth";
import { directusReminderStore, reminderSchema, runReminderTick, sendReminder } from "../../utils/reminders";

export default defineEventHandler(async (event) => {
  const via = await requireCronOrAppAdmin(event);
  const q = getQuery(event);
  const dry = q.dry === "1" || q.dry === "true";
  const org = typeof q.org === "string" && q.org.trim() ? q.org.trim() : null;

  let asOf = new Date();
  if (typeof q.asOf === "string" && q.asOf) {
    if (!dry) throw createError({ statusCode: 400, message: "asOf is for dry runs (?dry=1)" });
    asOf = new Date(q.asOf);
    if (Number.isNaN(asOf.getTime())) throw createError({ statusCode: 400, message: "asOf is not a date" });
  }

  const directus = getTypedDirectus();
  const provisioned = await reminderSchema(directus);
  if (!provisioned && !dry) return { success: true, provisioned: false };

  const store = directusReminderStore(directus, { provisioned });
  const result = await runReminderTick({ asOf, dry, org, store, send: sendReminder });
  if (!dry && (result.totals.groups || result.totals.lost || result.totals.failed || result.continued)) {
    console.info(
      `[reminders] ${result.orgs
        .filter((o) => o.groups || o.lost || o.failed || o.error)
        .map((o) => `${o.slug}: ${o.groups} groups · ${o.sent} sent · ${o.failed} failed · ${o.lost} lost${o.error ? ` · ${o.error}` : ""}`)
        .join(" | ")}${result.continued ? " · continues next tick" : ""}`
    );
  }
  return { success: true, provisioned, via, ...result };
});
