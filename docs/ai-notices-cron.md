# Notices cron — droplet runbook

The notices engine is deterministic and free to run: it reads the community's
own rows and does arithmetic, with **no LLM call anywhere**. A nightly sweep of
every org therefore costs nothing but a few queries, and spends no AI credits.

Endpoint: `POST /api/ai/notices/check`, guarded by `x-cron-secret`.

Unlike the digest — which runs as a standalone worker because it needs SendGrid
and the branded template — this one is an HTTP trigger, because everything it
needs (the generators, `notifyUsers`, the org scoping) already lives in the app.

## What one run does

1. Sweeps every non-archived organisation (or one, with `{"orgId": "..."}`).
2. Regenerates that org's notices from `server/utils/ai-notices.ts`.
3. Keeps only `urgent` and `high`. `medium` and `low` are worth *seeing* when
   you look at the feed; they are not worth interrupting anyone over, and the
   attention curve is what draws that line.
4. Skips anything already escalated this **calendar month**, via an
   `ai_notice_history` row keyed on
   `sha256(noticeType : entityType : entityId : YYYY-MM)`.
5. Sends what remains to the org's admins and seated board members through
   `notifyUsers()` under the `ai_insight` category, so each person's own
   notification preferences govern the bell, the push and the email.

## One-time setup

1. Provision the dedup ledger against prod Directus, from a machine with
   `DIRECTUS_STATIC_TOKEN`:

   ```bash
   pnpm create:ai-notice-history && pnpm generate:types
   ```

   Until this runs the cron still works — it warns, skips dedup and sends —
   so an urgent notice is never silenced by a missing collection. It will,
   however, repeat every run, which is exactly the nag the ledger prevents.

2. `CRON_SECRET` must already be set in the app's env (it is — the
   scheduled-email flow and the demo reset both use it). No new variable.

3. Add a **daily** crontab entry on the droplet. Nightly, not hourly: the
   thresholds are measured in days, so a second run the same day can only ever
   find what the first one already handled.

   ```bash
   # HOA Connect — nightly AI notices sweep (07:10 UTC)
   10 7 * * * /usr/bin/curl -sS -X POST https://app.hoaconnect.info/api/ai/notices/check -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' -d '{}' >> /var/log/hoa-notices.log 2>&1
   ```

   > **The checkout-path hazard, which does not apply here.** The digest worker
   > line still carries the trap documented in `notification-digest-cron.md`:
   > it `cd`s into a repo checkout, and the flatten in `aa064a7` removed
   > `apps/app`, so a stale crontab line fails every hour with a `cd` error and
   > no digest goes out. **This cron deliberately avoids that class of failure
   > entirely** — it is a `curl` at a deployed URL, so it has no checkout, no
   > `node_modules`, and nothing to keep in step with the repo layout. If you
   > are on the droplet fixing the digest line, fix it there; do not model this
   > one on it.

4. Verify with a dry run, which computes and reports but notifies nobody and
   writes no history:

   ```bash
   curl -sS -X POST https://app.hoaconnect.info/api/ai/notices/check -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' -d '{"dryRun":true}' | jq
   ```

   A healthy response looks like:

   ```json
   {
     "ok": true,
     "dryRun": true,
     "period": "2026-08",
     "dedup": "on",
     "organizations": 7,
     "results": [{ "organization": "…", "considered": 12, "escalated": 3, "skipped": 0, "notified": 0 }]
   }
   ```

   `"dedup": "unavailable"` means step 1 has not been run against this Directus.

## Members opting out

`ai_insight` is a normal category in `shared/notifications/preferences.ts`, so
it appears in the account notification sheet like any other and a missing key
means ON. Existing members are therefore opted in without a backfill — which is
only reasonable because the cron escalates `urgent`/`high` only, and dedups to
once per notice per month.

## Reading the ledger

`ai_notice_history` keeps the notice type, entity, priority and title alongside
the hash, so "why did I get this?" is answerable from the Directus admin
without reversing a hash. Rows are additive and small; there is no cleanup job.
