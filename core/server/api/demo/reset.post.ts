// POST /api/demo/reset — restore the public demo orgs to a clean baseline.
//
// Purges visitor-added content, then re-runs the idempotent seed (same shared
// code as `pnpm seed:demo`) so landing/hero/amenities/members/AI-wallet return
// to their starting state. Intended for a nightly cron. Authorized via the
// cron secret or a signed-in App Administrator (`requireCronOrAppAdmin`) —
// it wipes and reseeds the demo orgs, so an ordinary session must not reach
// it. No-op (404) when demo creds aren't configured.

import { seedDemos, purgeDemoContent, type DemoUser } from "#core/shared/demo/seed";
import { requireCronOrAppAdmin } from "../../utils/cron-auth";

export default defineEventHandler(async (event) => {
  await requireCronOrAppAdmin(event);

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
