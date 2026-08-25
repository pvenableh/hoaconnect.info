# Notification digest — scheduled on GitHub Actions

The daily/weekly digest runs as a **scheduled GitHub Actions workflow**:
[`.github/workflows/notification-digest.yml`](../.github/workflows/notification-digest.yml),
hourly at **:07**. The worker talks directly to Directus (admin token) and
SendGrid, and reuses the app's pure preference logic plus the exact same
org-branded transactional email template, so digests look identical to every
other HOA Connect notification.

Script: `scripts/notification-digest-worker.ts` (`pnpm run digest:worker`).

It is idempotent-by-hour: each run emails only the members whose cadence + local
send-hour (interpreted in `DIGEST_TZ`, default `America/New_York`) match the
current hour, so a member receives at most one digest per day even though the
schedule fires 24×/day. It also honors the master `email_notifications` switch
and skips demo orgs (unless `DEMO_ALLOW_EMAIL`).

> **This used to say "droplet worker". That machine does not exist.**
> Checked 2026-08-25: the droplet runs three containers — `database` (postgis),
> `cache` (redis), `directus` — and nothing else. No node service, no repo
> checkout, and `crontab -l` returns "no crontab for root". The digest had
> never had anywhere to run, and the fix was never the stale `/apps/app` path
> this file used to describe: the crontab was never set up at all.
>
> It does not need a droplet. The worker is a pure HTTP client — Directus over
> REST via `@directus/sdk`, SendGrid over REST — so any runner with the repo and
> node can do the job. Running it on Actions also means the code that runs is
> the commit on `main`, with no checkout to keep in step by hand: the exact
> class of failure this file spent two revisions documenting.

## Setup

Three repository secrets, set once at
**Settings → Secrets and variables → Actions**. Everything else is a non-secret
literal in the workflow file, where you can read it:

| secret | used by |
|---|---|
| `DIRECTUS_STATIC_TOKEN` | digest + export workers |
| `SENDGRID_API_KEY` | digest worker |
| `CRON_SECRET` | the two AI cron workflows |

The workflow pins the rest inline: `DIRECTUS_URL=https://admin.hoaconnect.info`,
`APP_URL=https://app.hoaconnect.info`,
`FROM_EMAIL=notifications@hoaconnect.info`, `FROM_NAME=HOA Connect`,
`DIGEST_TZ=America/New_York`. `DEMO_ALLOW_EMAIL` is deliberately unset — demo
orgs do not send.

That is the whole setup. There is nothing to install, nothing to `git pull`, and
no `pnpm-lock.yaml` hazard, because the runner installs `--frozen-lockfile` from
the commit it checked out.

## What drift costs — read this before changing the schedule

GitHub delays scheduled workflows when its scheduler is busy, and under heavy
load it **drops** them. That is not a hypothetical caveat here, because of how
the worker decides who to email:

- A run that lands **inside the right clock hour** is correct.
- A run **delayed past the hour boundary** matches the *next* hour's members.
  The members whose send-hour was skipped get nothing that day — a **missed**
  digest, not a late one.
- A **duplicate** is not a risk from drift. It is a risk from running the
  schedule more than once an hour, because the only thing making the worker
  idempotent is the hour match — there is no per-member "already sent" ledger.

Hence `7 * * * *` and not `0 * * * *`: the top of the hour is the most contended
slot on GitHub's scheduler, and `:07` buys margin cheaply.

**If missed hours ever show up in practice**, the durable fix is a per-member
`last_digest_at` guard, which would make the send idempotent by member-and-day
and let the schedule run every 15 minutes without any chance of a double. That
is a change to the worker, not to the schedule — do not simply raise the
frequency, or members will get several digests a day.

## Running it by hand

**From GitHub** — Actions → *notification digest* → **Run workflow**. The
`dry_run` input defaults to **true**, so the obvious button is the safe one; it
reports who *would* receive and sends nothing. Untick it to send for the current
hour.

**From a laptop**, against prod, with a `.env` at the repo root:

```bash
pnpm run digest:worker -- --dry-run   # reports who WOULD receive, sends nothing
pnpm run digest:worker                # actually sends (respects the current hour)
```

A healthy dry run prints a `candidates=` line:

```
🔔 Digest worker — DRY RUN · America/New_York 11:00 (Tue)
   candidates=1 eligible=0
ℹ️  Dry run — nothing sent.
```

`candidates` is how many people the cadence query returned; `eligible` is how
many of those match *this* hour. `eligible=0` is the normal state 23 hours out
of 24 — it is not a fault.

> ⚠️ **`candidates=1` platform-wide, as of 2026-08-25.** That number is every
> user with a non-null `notification_preferences`, across every org — not every
> user in one org, and not a per-hour figure. So when this workflow goes live it
> will correctly send almost nothing, and a run of green ticks with no mail is
> the *expected* result, not a broken schedule. Before concluding the digest is
> failing, check that number first: the digest has no audience yet because
> preferences have barely been set, which is a product question rather than an
> ops one.

> ⚠️ The local `.env` sets `APP_URL=http://www.hoaconnect.info`, which is the
> **marketing** site. A digest sent from a laptop with that value carries CTA
> links to the wrong host. The workflow pins `https://app.hoaconnect.info`; pass
> `APP_URL` explicitly if you ever send by hand.

## Notes

- This is the **transactional/branded** email system (org branding: header line,
  footer building photo, legal copyright) — a digest is a member notification,
  not a marketing send.
- The in-app HTTP trigger (`/api/cron/notification-digest`) was removed when the
  work moved out of the app — the worker is the single runner.
- A per-recipient SendGrid failure is caught and logged as `send FAILED → …`,
  and the run still **exits 0**. A hard failure — missing env, Directus
  unreachable — exits 1 and GitHub emails you a failed run. So a red run means
  the worker broke; a green run with `send FAILED` lines in it means SendGrid
  refused someone. Read the log, not just the tick.
- `pnpm install` on the runner is deliberately **not** `--prod`: the worker runs
  through `tsx`, a devDependency.
