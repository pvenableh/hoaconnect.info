/**
 * Phase 9 (Stage C) — process due scheduled emails.
 *
 * Called on a schedule by the Directus Flow "Email Scheduler" (or by hand).
 * Since Phase 3b it only ENQUEUES: each due email's audience is snapshotted as
 * `queued` rows (email-send-enqueue.ts) and the tick,
 * `GET /api/email/cron/continue-sends`, sends them — the same enqueue the tick
 * itself runs first, so the Flow and the Vercel cron can both fire until the
 * Flow is retired: the per-email lease means two schedulers cannot
 * double-enqueue. Recurrence is rolled forward at completion.
 *
 * Before `pnpm add:email-send-queue` has run, it keeps the old synchronous
 * send (legacySendEmailJob), status and recurrence included.
 *
 * Auth: the cron secret (`x-cron-secret`, or `Authorization: Bearer` from
 * Vercel Cron), or a signed-in App Administrator triggering a run by hand —
 * see `requireCronOrAppAdmin`. This sweeps EVERY org's queue, so an HOA admin
 * session is not enough (until 2026-10 any session was accepted).
 */
import { readItems, updateItem } from "@directus/sdk";
import { legacySendEmailJob } from "../../utils/sendEmailJob";
import { EmailComplianceRefusal, enqueueDue } from "../../utils/email-send-enqueue";
import { computeNextRun, directusRecipientStore, emailQueueSchema } from "../../utils/email-send-queue";
import { requireCronOrAppAdmin } from "../../utils/cron-auth";

export default defineEventHandler(async (event) => {
  await requireCronOrAppAdmin(event);

  const directus = getTypedDirectus();
  const nowIso = new Date().toISOString();

  if (await emailQueueSchema(directus)) {
    const r = await enqueueDue(directus, directusRecipientStore(directus), { now: () => Date.now() });
    return { success: true, checkedAt: nowIso, queued: true, processedCount: r.enqueued.length, ...r };
  }

  // ── Before the queue's schema exists: today's synchronous send ────────────
  const due = (await directus.request(
    readItems("hoa_emails", {
      filter: {
        status: { _eq: "scheduled" },
        scheduled_at: { _lte: nowIso } as any,
      },
      fields: ["id", "scheduled_at", "recurrence_rule"],
      sort: ["scheduled_at"],
      limit: 25,
    })
  )) as Array<{ id: string; scheduled_at: string | null; recurrence_rule: string | null }>;

  const processed: Array<{ emailId: string; delivered: number; failed: number; rescheduled?: string }> = [];

  for (const item of due) {
    try {
      // Mark sending to avoid a double-fire if a second poll overlaps
      await directus.request(updateItem("hoa_emails", item.id, { status: "sending" }));

      const result = await legacySendEmailJob(item.id);

      const rule = item.recurrence_rule || "none";
      const next = rule !== "none" ? computeNextRun(new Date(item.scheduled_at || nowIso), rule) : null;

      if (next) {
        await directus.request(
          updateItem("hoa_emails", item.id, {
            status: "scheduled",
            scheduled_at: next.toISOString(),
            next_run_at: next.toISOString(),
            sent_at: new Date().toISOString(),
          })
        );
        processed.push({ emailId: item.id, delivered: result.delivered, failed: result.failed, rescheduled: next.toISOString() });
      } else {
        await directus.request(
          updateItem("hoa_emails", item.id, {
            status: result.failed === result.total && result.total > 0 ? "failed" : "sent",
            sent_at: new Date().toISOString(),
            next_run_at: null,
          })
        );
        processed.push({ emailId: item.id, delivered: result.delivered, failed: result.failed });
      }
    } catch (err: any) {
      console.error(`[process-scheduled] Failed to process ${item.id}:`, err);
      // A compliance refusal (no postal address on a community send; a
      // newsletter marked essential) fails the same way every tick, so it is
      // marked failed for an admin to fix. Anything else resets to scheduled so
      // it retries next tick rather than getting stuck "sending".
      const refused = err instanceof EmailComplianceRefusal;
      await directus
        .request(updateItem("hoa_emails", item.id, { status: refused ? "failed" : "scheduled" }))
        .catch(() => {});
    }
  }

  return { success: true, checkedAt: nowIso, processedCount: processed.length, processed };
});
