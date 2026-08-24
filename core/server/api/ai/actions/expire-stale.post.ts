/**
 * POST /api/ai/actions/expire-stale — retire proposals nobody ever answered.
 *
 * The review queue fills without anyone asking it to: the notices cron proposes,
 * the assistant proposes, the Director layer proposes. Left alone, a proposal
 * from six weeks ago sits alongside one from this morning looking equally live,
 * and the queue stops meaning "things to decide" and starts meaning "things".
 *
 * So a `pending` row older than the window becomes `rejected`, tagged
 *
 *   error_message: 'auto-expired (stale 14 days)'
 *   result:        { expired: true }
 *
 * **No new status value.** Adding `expired` to the enum would mean a schema
 * change, a types regeneration, and every existing status switch in the app
 * quietly missing a case. `rejected` is already true — nobody approved it — and
 * the card reads the `auto-expired` prefix to render "Expired" instead of
 * "Rejected", so the human distinction survives without the machinery.
 *
 * Only `pending` rows are ever touched. An executed action is a thing that
 * happened; a failed one is a thing that broke. Neither becomes less true with
 * age, and sweeping them would rewrite history.
 *
 * Idempotent by construction: the second run finds nothing pending past the
 * cutoff, because the first run's rows are no longer pending. It returns
 * `expired: 0` rather than doing anything again.
 *
 * Auth, and why it differs by caller:
 *   · `x-cron-secret` matching CRON_SECRET → may sweep every community, or one
 *     if `orgId` is given. This is the droplet crontab.
 *   · an authenticated session → `orgId` is REQUIRED and compose-gated. A
 *     person may retire their own community's stale queue and no one else's.
 *     There is no "sweep everything" for a logged-in user at any role.
 *
 * Body (all optional for the cron, `orgId` required for a session):
 *   orgId  — restrict to one community
 *   dryRun — count what would expire, change nothing
 */

import { readItems, updateItems } from "@directus/sdk";
import { AUTO_EXPIRED_PREFIX } from "#core/shared/ai/actions";

/** How long a proposal may sit unanswered. Override with AI_ACTION_EXPIRY_DAYS. */
export const DEFAULT_EXPIRY_DAYS = 14;

/** Page size for the sweep — bounded so one org's backlog can't blow the request. */
const EXPIRY_BATCH = 500;

export function expiryDays(): number {
  const raw = Number(process.env.AI_ACTION_EXPIRY_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : DEFAULT_EXPIRY_DAYS;
}

export default defineEventHandler(async (event) => {
  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    dryRun?: boolean;
  };
  const orgId = String(body.orgId || "").trim();
  const dryRun = body.dryRun === true;

  const secret = process.env.CRON_SECRET;
  const provided = getHeader(event, "x-cron-secret");
  const viaCron = !!secret && !!provided && provided === secret;

  if (!viaCron) {
    await requireUserSession(event);
    // A session may only sweep a named community it is authorized for. The cron
    // secret is the only thing that unlocks an org-wide sweep.
    if (!orgId) {
      throw createError({
        statusCode: 400,
        message: "orgId is required",
      });
    }
    await requireOrgComposeAccess(event, orgId);
  }

  const days = expiryDays();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const directus = getTypedDirectus();

  const filter: any = {
    _and: [
      { status: { _eq: "pending" } },
      { date_created: { _lte: cutoff } },
      ...(orgId ? [{ organization: { _eq: orgId } }] : []),
    ],
  };

  let expired = 0;
  try {
    for (;;) {
      const rows = (await directus.request(
        readItems("ai_actions", {
          filter,
          fields: ["id"],
          sort: ["date_created"],
          limit: EXPIRY_BATCH,
          // A real sweep shrinks the match set as it goes, so it always reads
          // from 0. A dry run changes nothing, so it must page past what it has
          // already counted or it re-reads the first page forever.
          ...(dryRun ? { offset: expired } : {}),
        })
      )) as { id: string }[];

      const ids = (rows || []).map((r) => r.id).filter((v) => v != null);
      if (ids.length === 0) break;

      if (dryRun) {
        expired += ids.length;
        if (ids.length < EXPIRY_BATCH) break;
        continue;
      }

      await directus.request(
        updateItems("ai_actions", ids, {
          status: "rejected",
          error_message: `${AUTO_EXPIRED_PREFIX} (stale ${days} days)`,
          result: { expired: true },
        } as any)
      );
      expired += ids.length;

      if (ids.length < EXPIRY_BATCH) break;
    }
  } catch (err: any) {
    console.error("[ai/actions/expire-stale] failed:", err?.message);
    throw createError({ statusCode: 500, message: "Failed to expire stale actions" });
  }

  return { expired, windowDays: days, dryRun, scope: orgId || "all" };
});
