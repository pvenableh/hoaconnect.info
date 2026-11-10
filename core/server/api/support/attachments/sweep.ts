/**
 * The daily sweep of support uploads no message ever claimed (operator console,
 * after Session F) — Vercel Cron, 09:50 UTC.
 *
 *   ?dry=1   count what would go, delete nothing (not recorded as a run)
 *
 * Deletes files in the "Support attachments" folder still marked
 * `support-upload:<user>` once they're over 7 days old, and nothing else
 * (sweepUnattachedSupportUploads in core/server/utils/support-attachments.ts).
 *
 * `sweep.ts`, not `sweep.post.ts`: Vercel Cron issues GET (see cron-auth.ts).
 * Gate: CRON_SECRET, or an App Admin's session (via cronJobHandler).
 */
import { cronJobHandler } from "../../../utils/job-heartbeat";
import { sweepUnattachedSupportUploads, type SupportUploadSweep } from "../../../utils/support-attachments";

const isDry = (event: Parameters<typeof getQuery>[0]) => {
  const q = getQuery(event);
  return q.dry === "1" || q.dry === "true";
};

export default cronJobHandler<SupportUploadSweep>(
  "support-uploads-sweep",
  {
    isDry,
    summarize: (r) => ({ found: r.found, deleted: r.deleted, folder: r.folder }),
  },
  async (event) => {
    const result = await sweepUnattachedSupportUploads({ dry: isDry(event) });
    if (result.found) console.info(`[support-sweep] ${result.dry ? "DRY " : ""}found ${result.found} · deleted ${result.deleted}`);
    return result;
  }
);
