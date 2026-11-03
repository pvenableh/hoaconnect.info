/**
 * Phase 9 (Stage C) — process due scheduled emails.
 *
 * Called on a cron schedule by a Directus Flow (or any external scheduler).
 * Finds hoa_emails with status='scheduled' and scheduled_at <= now, sends each
 * via sendEmailJob, then either marks it 'sent' or — when recurrence_rule is set
 * — rolls scheduled_at forward and leaves it 'scheduled'.
 *
 * Auth: the cron secret (`x-cron-secret`, or `Authorization: Bearer` from
 * Vercel Cron), or a signed-in App Administrator triggering a run by hand —
 * see `requireCronOrAppAdmin`. This sweeps EVERY org's queue, so an HOA admin
 * session is not enough (until 2026-10 any session was accepted).
 */
import { readItems, updateItem } from "@directus/sdk";
import { EmailComplianceRefusal, sendEmailJob } from "../../utils/sendEmailJob";
import { requireCronOrAppAdmin } from "../../utils/cron-auth";

function computeNextRun(base: Date, rule: string): Date | null {
  const d = new Date(base);
  if (rule === "weekly") { d.setDate(d.getDate() + 7); return d; }
  if (rule === "monthly") { d.setMonth(d.getMonth() + 1); return d; }
  return null;
}

export default defineEventHandler(async (event) => {
  // --- Authorization ---
  await requireCronOrAppAdmin(event);

  const directus = getTypedDirectus();
  const nowIso = new Date().toISOString();

  // Find due scheduled emails
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

      const result = await sendEmailJob(item.id);

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
