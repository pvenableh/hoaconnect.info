/**
 * Phase 9 (Stage C) — process due scheduled emails.
 *
 * Called on a cron schedule by a Directus Flow (or any external scheduler).
 * Finds hoa_emails with status='scheduled' and scheduled_at <= now, sends each
 * via sendEmailJob, then either marks it 'sent' or — when recurrence_rule is set
 * — rolls scheduled_at forward and leaves it 'scheduled'.
 *
 * Auth: either the `x-cron-secret` header matches process.env.CRON_SECRET, OR
 * the caller has a valid (admin) user session — so it can be triggered manually
 * from the app while logged in, and headlessly by the Flow in production.
 */
import { readItems, updateItem } from "@directus/sdk";
import { sendEmailJob } from "../../utils/sendEmailJob";

function computeNextRun(base: Date, rule: string): Date | null {
  const d = new Date(base);
  if (rule === "weekly") { d.setDate(d.getDate() + 7); return d; }
  if (rule === "monthly") { d.setMonth(d.getMonth() + 1); return d; }
  return null;
}

export default defineEventHandler(async (event) => {
  // --- Authorization ---
  const secret = process.env.CRON_SECRET;
  const provided = getHeader(event, "x-cron-secret");
  let authorized = !!secret && !!provided && provided === secret;
  if (!authorized) {
    try {
      await requireUserSession(event);
      authorized = true;
    } catch {
      // no session
    }
  }
  if (!authorized) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const directus = getTypedDirectus();
  const nowIso = new Date().toISOString();

  // Find due scheduled emails
  const due = (await directus.request(
    readItems("hoa_emails", {
      filter: {
        status: { _eq: "scheduled" },
        scheduled_at: { _lte: nowIso },
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
      // Reset to scheduled so it retries next tick rather than getting stuck "sending"
      await directus.request(updateItem("hoa_emails", item.id, { status: "scheduled" })).catch(() => {});
    }
  }

  return { success: true, checkedAt: nowIso, processedCount: processed.length, processed };
});
