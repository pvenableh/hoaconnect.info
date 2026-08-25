/**
 * Does this request carry the cron secret?
 *
 * Two accepted forms, because two schedulers send it two different ways:
 *
 *   `x-cron-secret: <secret>`        GitHub Actions, the Directus
 *                                    scheduled-email flow, anything curl-shaped
 *   `Authorization: Bearer <secret>` Vercel Cron, which sends this and ONLY
 *                                    this — it has no way to set a custom header
 *
 * ⚠️ Vercel Cron also issues **GET, and only GET**. A route it drives must be
 * `<name>.ts` rather than `<name>.post.ts`, or the scheduler gets a 405 and the
 * job silently never runs. Read the body defensively in those handlers — there
 * isn't one on a GET.
 *
 * `core/server/api/demo/reset.post.ts`,
 * `core/server/api/internal/recompute-member-counts.post.ts` and
 * `core/server/api/email/process-scheduled.post.ts` still read the header
 * directly. They are not on Vercel Cron, so they don't need this yet — but this
 * is what they should adopt if they ever move.
 */

import type { H3Event } from "h3";

export function cronSecretMatches(event: H3Event): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = getHeader(event, "x-cron-secret");
  if (header && header === secret) return true;

  const auth = getHeader(event, "authorization");
  if (auth && auth === `Bearer ${secret}`) return true;

  return false;
}
