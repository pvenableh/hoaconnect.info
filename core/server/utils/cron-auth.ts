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
 * Every cron-shaped route goes through `requireCronOrAppAdmin()` below. The
 * manual fallback is an **App Administrator** session, not any session: these
 * jobs sweep every organization, so an HOA admin of one community — let alone
 * an ordinary member — has no standing to fire them. (Until 2026-10 four of
 * them accepted any logged-in user.)
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

/**
 * Authorize a cron-shaped request: the cron secret, or a signed-in
 * **App Administrator** (`directusRoleAppAdmin`) triggering it by hand.
 *
 * Throws 401 with no session and 403 with a session that is not an app admin,
 * so a refusal names which of the two the caller is missing.
 */
export async function requireCronOrAppAdmin(event: H3Event): Promise<"cron" | "app-admin"> {
  if (cronSecretMatches(event)) return "cron";

  const session = await getUserSession(event).catch(() => null);
  const user = session?.user as { id?: string; role?: string | { id?: string } } | undefined;
  if (!user?.id) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const config = useRuntimeConfig();
  const roleId = typeof user.role === "string" ? user.role : user.role?.id;
  if (!roleId || roleId !== config.public.directusRoleAppAdmin) {
    throw createError({ statusCode: 403, message: "App administrator access required" });
  }
  return "app-admin";
}
