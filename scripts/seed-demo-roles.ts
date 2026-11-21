/**
 * Provision the demo community's six logins and everything they look at
 * (docs/plan-unified-experience.md §5). The content lives in
 * core/shared/demo/scenario.ts and runs as part of the shared demo seed, so the
 * nightly reset restores it; this script is just the same seed under the name
 * the plan uses.
 *
 * Logins on Harborview Lofts (slug `demo`): demo@hoaconnect.info (admin) and
 * demo-{tenant,owner,board,team,manager}@hoaconnect.info; passwords are in
 * core/shared/demo/scenario.ts. DEMO DATA ONLY.
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN. Run: pnpm tsx scripts/seed-demo-roles.ts [--dry]
 */
import { seedDemos } from "../core/shared/demo/seed";

const baseUrl = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;
const dry = process.argv.includes("--dry");
if (!baseUrl || !token) {
  console.error("Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
seedDemos(
  { baseUrl, token, dry, log: (m) => console.log(m) },
  {
    email: (process.env.DEMO_USER_EMAIL || "demo@hoaconnect.info").toLowerCase(),
    password: process.env.DEMO_USER_PASSWORD || "DemoTryItOut2026!",
    first_name: "Demo",
    last_name: "Admin",
  },
).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
