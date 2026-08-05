# Notification digest — droplet cron trigger

The daily/weekly digest is dispatched by the hourly endpoint
`GET /api/cron/notification-digest`. The endpoint runs on the deployed app
(Vercel); it is **triggered from the DigitalOcean droplet's crontab** rather than
Vercel Cron, so no Vercel Pro plan is required.

The endpoint is idempotent-by-hour: on each run it emails only the members whose
configured cadence + local send-hour match the current hour (interpreted in
`DIGEST_TZ`, default `America/New_York`), so a member receives at most one digest
per day even though the cron fires 24×/day.

## One-time setup on the droplet

1. Ensure the same `CRON_SECRET` value is set **both** on the deployed app's env
   (Vercel) and available to the crontab below. Generate a long random value.

2. Add an hourly crontab entry (`crontab -e`). Point it at the app's public URL:

   ```bash
   # HOA Connect — hourly notification digest (top of every hour)
   0 * * * * curl -fsS -m 60 -H "x-cron-secret: YOUR_CRON_SECRET" https://app.hoaconnect.info/api/cron/notification-digest > /dev/null 2>&1
   ```

   - `-m 60` caps the request at 60s.
   - Replace `YOUR_CRON_SECRET` with the real value (or read it from an env file the
     cron sources — keep it out of `crontab -l` output if that matters).
   - Replace the host with the real app URL if different (`APP_URL`).

## Auth accepted by the endpoint

Any one of:
- `x-cron-secret: <CRON_SECRET>` header (used above), or
- `Authorization: Bearer <CRON_SECRET>`, or
- a logged-in admin session (for manual triggering from the app).

## Manual test

```bash
# Dry run — reports who WOULD be sent, sends nothing:
curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" "https://app.hoaconnect.info/api/cron/notification-digest?dryRun=1"
# → { "ok": true, "dryRun": true, "candidates": N, "wouldSend": [ ...userIds ] }
```

## Scaling note

The digest logic executes on the app (Vercel serverless), so a very large single
run is bounded by the function timeout. At current HOA scale each hourly batch is
small (only the members whose local hour matches). If digest volume grows and runs
approach the timeout, move to a standalone worker **on the droplet** that runs the
digest against Directus + SendGrid directly (the Earnest worker pattern) instead of
triggering the Vercel endpoint.
