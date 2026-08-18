# Notification digest — droplet worker

The daily/weekly digest runs as a **standalone worker on the DigitalOcean droplet**
(where Directus lives), not in the Vercel app. The worker talks directly to
Directus (admin token) and SendGrid, and reuses the app's pure preference logic
plus the exact same org-branded transactional email template, so digests look
identical to every other HOA Connect notification.

Script: `apps/app/scripts/notification-digest-worker.ts` (`pnpm run digest:worker`).

It is idempotent-by-hour: each run emails only the members whose cadence + local
send-hour (interpreted in `DIGEST_TZ`, default `America/New_York`) match the
current hour, so a member receives at most one digest per day even though the
cron fires 24×/day. It also honors the master `email_notifications` switch and
skips demo orgs (unless `DEMO_ALLOW_EMAIL`).

## One-time setup on the droplet

1. The droplet already runs Directus; check the repo out there (or reuse the
   existing checkout used for the Earnest worker) and `pnpm install`.

2. Provide the worker's env (a `.env` next to `apps/app`, or exported in the cron):

   | var | purpose |
   |---|---|
   | `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN` | admin Directus access |
   | `SENDGRID_API_KEY` | send mail (REST) |
   | `FROM_EMAIL`, `FROM_NAME` | platform sender (per-org white-label sender is used automatically when a verified sending domain is configured) |
   | `APP_URL` | dashboard/CTA links, e.g. `https://app.hoaconnect.info` |
   | `DIGEST_TZ` | timezone for the send-hour (default `America/New_York`) |
   | `DEMO_ALLOW_EMAIL` | optional — let demo orgs actually send |

3. Add an hourly crontab entry (`crontab -e`):

   ```bash
   # HOA Connect — hourly notification digest worker (top of every hour)
   0 * * * * cd /path/to/hoaconnect/apps/app && /usr/local/bin/pnpm run digest:worker >> /var/log/hoa-digest.log 2>&1
   ```

   Adjust the repo path and the `pnpm` path (`which pnpm`). Cron has a minimal
   PATH, so use absolute paths (or source a profile that sets up fnm/pnpm).

## Test

```bash
cd apps/app
pnpm run digest:worker -- --dry-run   # reports who WOULD receive, sends nothing
pnpm run digest:worker                 # actually sends (respects the current hour)
```

## Notes

- This is the **transactional/branded** email system (org branding: header line,
  footer building photo, legal copyright) — a digest is a member notification, not
  a marketing send.
- The in-app HTTP trigger (`/api/cron/notification-digest`) was removed when the
  work moved to the droplet — the worker is now the single runner.
- If digest volume ever grows enough that a single hourly run is slow, the worker
  already runs on the droplet with no serverless timeout; add a concurrency pool
  in the send loop if needed.
