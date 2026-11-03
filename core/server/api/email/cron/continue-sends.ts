/**
 * The send queue's tick (docs/spec-email-send-queue.md §7.1) — Vercel Cron,
 * every minute.
 *
 *   1. enqueue due scheduled emails (what process-scheduled does for the Flow);
 *   2. run `sending` emails oldest first, sharing a 45 s budget;
 *   3. close sends stuck getting ready for 10 minutes;
 *   4. complete any done-but-unwritten send.
 *
 * `continue-sends.ts`, not `.post.ts`: Vercel Cron issues GET only (see
 * cron-auth.ts). There is no body to read.
 *
 * Its hard stop is `maxDuration: 60` — nuxt.config.ts gives this one route its
 * own Vercel function (Nitro otherwise builds every route into one). STALE_MS
 * (3 min) is three times that; a test pins the relation.
 *
 * Before `pnpm add:email-send-queue` has run there is no queue: 200 with
 * `{ provisioned: false }`, and the Flow's process-scheduled keeps sending.
 */
import { requireCronOrAppAdmin } from "../../../utils/cron-auth";
import { emailQueueSchema } from "../../../utils/email-send-queue";
import { runEmailTick } from "../../../utils/email-send-tick";

export default defineEventHandler(async (event) => {
  const via = await requireCronOrAppAdmin(event);
  const directus = getTypedDirectus();
  if (!(await emailQueueSchema(directus))) {
    return { success: true, provisioned: false };
  }
  const result = await runEmailTick(via === "cron" ? "cron" : "manual");
  if (result.enqueued || result.runs.length || result.closed || result.completed) {
    console.info(
      `[continue-sends] enqueued ${result.enqueued} · runs ${result.runs
        .map((r) => `${r.emailId}:${r.stopped}+${r.sent}/${r.failed}/${r.unknown}`)
        .join(" ")} · closed ${result.closed} · completed ${result.completed}`
    );
  }
  return { success: true, ...result };
});
