/**
 * Seed the public "try the app" demo orgs (Harborview Lofts / The Beaumont
 * Residences) + the shared demo-admin user. Thin CLI wrapper over the shared,
 * framework-free provisioner in core/shared/demo/seed.ts — the SAME code the
 * nightly reset route calls, so the two can never drift.
 *
 * Also writes what the demo shows of Earnest parity round 3 — reminders ON, a
 * recurring email, a channel with a DM, a year of paid dues and expenses for
 * Reports (see core/shared/demo/round3.ts). `--dry` reads and lists all of it
 * ("(dry) + …") and sends no write.
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Creds:  DEMO_USER_EMAIL / DEMO_USER_PASSWORD (optional; sensible defaults).
 * Run:    pnpm run seed:demo            (writes)
 *         pnpm run seed:demo -- --dry   (no writes; reports)
 */

import { seedDemos, type DemoUser } from "../core/shared/demo/seed";

const baseUrl = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;
const dry = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!baseUrl || !token) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const user: DemoUser = {
  email: (process.env.DEMO_USER_EMAIL || "demo@hoaconnect.info").toLowerCase(),
  password: process.env.DEMO_USER_PASSWORD || "DemoTryItOut2026!",
  first_name: "Demo",
  last_name: "Admin",
};

console.log(`\nSeed demo orgs ${dry ? "(DRY RUN)" : ""}\n`);
seedDemos({ baseUrl, token, dry, log: (m) => console.log(m) }, user)
  .then(() => {
    console.log(`\n${dry ? "Dry run complete — no writes." : "✓ Demo seed complete."}`);
    if (!dry) console.log(`Demo login: ${user.email}\nLandings:  /demo · /demo-classic\n`);
  })
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
