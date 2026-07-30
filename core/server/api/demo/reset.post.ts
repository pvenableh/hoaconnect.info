// POST /api/demo/reset — restore the public demo orgs to a clean baseline.
//
// Purges visitor-added content, then re-runs the idempotent seed (same shared
// code as `pnpm seed:demo`) so landing/hero/amenities/members/AI-wallet return
// to their starting state. Intended for a nightly cron. Authorized via the
// `x-cron-secret` header (matching the other internal cron routes) or an
// authenticated session. No-op (404) when demo creds aren't configured.

import { seedDemos, purgeDemoContent, type DemoUser } from "#core/shared/demo/seed";

export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET;
  const provided = getHeader(event, "x-cron-secret");
  let authorized = !!secret && !!provided && provided === secret;
  if (!authorized) {
    try {
      await requireUserSession(event);
      authorized = true;
    } catch {
      /* no session */
    }
  }
  if (!authorized) throw createError({ statusCode: 401, message: "Unauthorized" });

  const config = useRuntimeConfig();
  const email = config.demoUserEmail as string | undefined;
  const password = config.demoUserPassword as string | undefined;
  const baseUrl = config.directus.url as string | undefined;
  const token = config.directus.staticToken as string | undefined;
  if (!email || !password || !baseUrl || !token) {
    throw createError({ statusCode: 404, statusMessage: "Demo is not configured" });
  }

  const user: DemoUser = { email, password, first_name: "Demo", last_name: "Admin" };
  const io = { baseUrl, token, log: (m: string) => console.log(`[demo:reset] ${m}`) };

  const purged = await purgeDemoContent(io);
  await seedDemos(io, user);

  return { success: true, purged };
});
