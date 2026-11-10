/**
 * Re-banding's daily run (launch-followups Session 3) — Vercel Cron, 09:30 UTC.
 *
 *   ?dry=1   report what would move, write nothing (not recorded as a run)
 *
 * Moves a community up a band at its next renewal (no proration) when its
 * units outgrow the band it pays for; never down. Crossing into Enterprise
 * opens a support entry and leaves Stripe alone. Rules:
 * core/shared/billing/reband.ts; work: core/server/utils/reband.ts.
 *
 * `run.ts`, not `run.post.ts`: Vercel Cron issues GET (see cron-auth.ts).
 * Gate: CRON_SECRET, or an App Admin's session (via cronJobHandler).
 */
import { cronJobHandler } from "../../../utils/job-heartbeat";
import { runRebanding, type RebandRunResult } from "../../../utils/reband";

const isDry = (event: Parameters<typeof getQuery>[0]) => {
  const q = getQuery(event);
  return q.dry === "1" || q.dry === "true";
};

export default cronJobHandler<RebandRunResult>(
  "rebanding",
  {
    isDry,
    summarize: (r) => ({ checked: r.checked, moved: r.moved.length, unitsUpdated: r.unitsUpdated, enterprise: r.enterprise, errors: r.errors.length }),
  },
  async (event) => {
    const result = await runRebanding({ dry: isDry(event) });
    if (result.moved.length || result.enterprise || result.errors.length) {
      console.info(
        `[reband] ${result.dry ? "DRY " : ""}checked ${result.checked} · moved ${result.moved.map((m) => `${m.orgId}:${m.from}→${m.to}`).join(" ")} · enterprise ${result.enterprise} · errors ${result.errors.length}`
      );
    }
    return result;
  }
);
