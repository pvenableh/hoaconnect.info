/**
 * POST /api/org/reminders/dry-run   (Settings → Reminders, Earnest parity round 3, Phase 5b)
 *
 *   { orgId | slug }
 *
 * "What would go out in the next 24 hours": the engine's own dry run
 * (`runReminderTick({ dry: true })`) at every hour from now, folded into one
 * answer by `summarizeDryRuns` — "14 dues reminders, 1 meeting reminder", what
 * the rules that are off would add, and who can't be reached. It reads the
 * SAVED settings (the card says so) and writes and sends nothing.
 *
 * The snapshot is loaded once and reused for every hour: the 5a loaders read a
 * day past `asOf` on purpose (a due date, a meeting a week out), so the first
 * hour's read covers the next 24. Only the keys already logged are looked up
 * per hour.
 *
 * Works before `pnpm create:reminder-log` (New York time, every rule off, an
 * empty log), like `GET /api/reminders/run?dry=1`.
 */
import { summarizeDryRuns } from "#core/shared/reminders/admin";
import {
  directusReminderStore,
  reminderSchema,
  runReminderTick,
  sendReminder,
  type ReminderOrgResult,
  type ReminderStore,
} from "../../../utils/reminders";

const HOURS = 24;
const HOUR_MS = 3_600_000;
const PARALLEL = 8;

export default defineEventHandler(async (event) => {
  const { orgId } = await requireReminderAdmin(event, await readBody(event));

  const directus = getTypedDirectus();
  const provisioned = await reminderSchema(directus);
  const store = directusReminderStore(directus, { provisioned });

  let snapshot: ReturnType<ReminderStore["loadSnapshot"]> | null = null;
  const oneRead: ReminderStore = {
    ...store,
    loadSnapshot: (org, settings, opts) => (snapshot ??= store.loadSnapshot(org, settings, opts)),
  };

  const start = Date.now();
  const hours = Array.from({ length: HOURS }, (_, h) => h);
  const runs: ReminderOrgResult[] = [];
  let timeZone: string | null = null;
  let localTime: string | null = null;
  for (let i = 0; i < hours.length; i += PARALLEL) {
    const chunk = await Promise.all(
      hours.slice(i, i + PARALLEL).map((h) =>
        runReminderTick({ store: oneRead, send: sendReminder, dry: true, org: orgId, asOf: new Date(start + h * HOUR_MS) })
      )
    );
    for (const r of chunk) {
      const o = r.orgs[0];
      if (!o) continue;
      if (o.error) throw createError({ statusCode: 500, statusMessage: o.error });
      timeZone ??= o.timeZone;
      localTime ??= o.localTime;
      runs.push(o);
    }
  }
  if (!runs.length) throw createError({ statusCode: 404, statusMessage: "No such community." });

  return { success: true, provisioned, asOf: new Date(start).toISOString(), timeZone, localTime, ...summarizeDryRuns(runs) };
});
