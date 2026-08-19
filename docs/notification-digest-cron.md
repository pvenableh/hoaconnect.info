# Notification digest — droplet worker

The daily/weekly digest runs as a **standalone worker on the DigitalOcean droplet**
(where Directus lives), not in the Vercel app. The worker talks directly to
Directus (admin token) and SendGrid, and reuses the app's pure preference logic
plus the exact same org-branded transactional email template, so digests look
identical to every other HOA Connect notification.

Script: `scripts/notification-digest-worker.ts` (`pnpm run digest:worker`).

It is idempotent-by-hour: each run emails only the members whose cadence + local
send-hour (interpreted in `DIGEST_TZ`, default `America/New_York`) match the
current hour, so a member receives at most one digest per day even though the
cron fires 24×/day. It also honors the master `email_notifications` switch and
skips demo orgs (unless `DEMO_ALLOW_EMAIL`).

## One-time setup on the droplet

1. The droplet already runs Directus; check the repo out there (or reuse the
   existing checkout used for the Earnest worker) and `pnpm install`.

2. Provide the worker's env (a `.env` at the repo root, or exported in the cron):

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
   0 * * * * cd /path/to/hoaconnect && /usr/local/bin/pnpm run digest:worker >> /var/log/hoa-digest.log 2>&1
   ```

   Adjust the repo path and the `pnpm` path (`which pnpm`). Cron has a minimal
   PATH, so use absolute paths (or source a profile that sets up fnm/pnpm).

   > **The path changed (2026-08-18).** The repo was flattened in `aa064a7` and
   > `apps/app` no longer exists — the app IS the repo root. An existing crontab
   > line still ending in `/apps/app` fails every hour: cron mails the `cd`
   > error and no digest goes out.
   >
   > Fixing the crontab is not enough on its own — the droplet's CHECKOUT also
   > has the old layout, and the workspace is gone, so `node_modules` must be
   > rebuilt from the single root `package.json`. On the droplet, in order:
   >
   > ```bash
   > cd /path/to/hoaconnect
   > git pull                                   # brings in the flatten
   > pnpm install                               # one package.json now, no workspace
   > pnpm run digest:worker -- --dry-run        # must print a candidates= line
   > crontab -e                                 # drop the /apps/app suffix
   > crontab -l | grep digest                   # confirm
   > ```
   >
   > Do NOT regenerate `pnpm-lock.yaml` to resolve an install hiccup — that
   > floats every caret range and has taken production down before (duplicate
   > `vue`, duplicate `unhead`). Restore it from git and let `pnpm install`
   > adapt.

## Test

```bash
cd /path/to/hoaconnect      # the repo ROOT — there is no apps/app any more
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
