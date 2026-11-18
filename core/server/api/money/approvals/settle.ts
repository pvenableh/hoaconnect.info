/**
 * The daily re-check of open money approvals (docs/spec-money-approvals.md) —
 * Vercel Cron, 00:20 UTC.
 *
 * A board term can end on its date with no route call (isCurrentBoardTerm is
 * by UTC day, both ends inclusive), and a membership can leave a community
 * elsewhere. The board-term routes resettle at once; this catches the rest:
 * for every community with an open approval, resettleCommunity asks the rule
 * again and settles what the change decided, credited to "HOA Connect".
 *
 * `settle.ts`, not `settle.post.ts`: Vercel Cron issues GET (see cron-auth.ts).
 * Gate: CRON_SECRET, or an App Admin's session (via cronJobHandler).
 */
import { readItems } from "@directus/sdk";
import { cronJobHandler } from "../../../utils/job-heartbeat";

interface SettleRun {
  communities: number;
  checked: number;
  settled: number;
  reopened: number;
}

export default cronJobHandler<SettleRun>(
  "money-approvals-settle",
  { summarize: (r) => ({ ...r }) },
  async () => {
    const rows = ((await getTypedDirectus().request(
      readItems("money_approvals" as any, {
        filter: { state: { _in: [...OPEN_STATES] } } as any,
        fields: ["organization"] as any,
        limit: -1,
      })
    )) ?? []) as Array<{ organization?: unknown }>;
    const orgs = [...new Set(rows.map((r) => (typeof r.organization === "string" ? r.organization : (r.organization as { id?: string } | null)?.id)).filter((x): x is string => !!x))];
    const run: SettleRun = { communities: orgs.length, checked: 0, settled: 0, reopened: 0 };
    for (const orgId of orgs) {
      try {
        const r = await resettleCommunity(orgId, SYSTEM_ACTOR);
        run.checked += r.checked;
        run.settled += r.settled;
        run.reopened += r.reopened;
      } catch (e) {
        console.error(`[money-approvals] settle failed for ${orgId}:`, e);
      }
    }
    return run;
  }
);
