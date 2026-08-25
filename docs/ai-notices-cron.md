# Notices cron — scheduled on Vercel Cron

The notices engine is deterministic and free to run: it reads the community's
own rows and does arithmetic, with **no LLM call anywhere**. A nightly sweep of
every org therefore costs nothing but a few queries, and spends no AI credits.

Endpoint: `POST /api/ai/notices/check`, guarded by `x-cron-secret`.

Unlike the digest — which runs a worker script because it needs SendGrid and the
branded template — this one is an HTTP trigger, because everything it needs (the
generators, `notifyUsers`, the org scoping) already lives in the app: no
checkout, no `node_modules`, nothing to keep in step with the repo layout.

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

2. `CRON_SECRET` must be set in **two** places: the app's env, where the
   endpoint reads it (it already is — the scheduled-email flow and the demo
   reset both use it), and as a **GitHub repository secret**, where the caller
   reads it. No new variable, one new place to paste it.

3. Nothing else to set up. The schedule is [`vercel.json`](../vercel.json),
   **daily at 07:10 UTC**. Nightly and not hourly: the thresholds are measured
   in days, so a second run the same day can only ever find what the first one
   already handled.

   ⚠️ **Vercel Hobby allows 2 cron jobs, at daily granularity only.** This one
   fits either plan; the weekly expiry sweep does not, and degrades to daily.

   > **Why Vercel Cron and not GitHub Actions.** This job is a single HTTP
   > request at an endpoint that already exists. Booting an Ubuntu runner,
   > checking out the repo and installing dependencies in order to send it is
   > pure overhead — Vercel invokes the function directly. The digest and export
   > workers stay on Actions because they genuinely need the repo. The split is
   > "does this need a checkout", not "which system do we like".

   ⚠️ **Vercel Cron issues GET, and only GET, and cannot send a custom header.**
   That is why this route is `check.ts` and not `check.post.ts`, and why it
   accepts `Authorization: Bearer $CRON_SECRET` as well as `x-cron-secret` —
   see `core/server/utils/cron-auth.ts`. A `.post.ts` route on a Vercel cron
   answers **405 and the job silently never runs**. POST still works for every
   existing caller.

   To run it by hand from the browser: Actions → *ai notices sweep* →
   **Run workflow**. That workflow is now the manual runner only — its schedule
   moved here — and its `dry_run` input defaults to **true**.

   To run it from a laptop:

   ```bash
   curl -sS -X POST https://app.hoaconnect.info/api/ai/notices/check \
     -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' \
     -d '{"dryRun": true}'
   ```

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
