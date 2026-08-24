# Stale-proposal expiry — droplet runbook

The review queue fills without anyone asking it to. The notices cron proposes,
the assistant proposes during a chat turn, and from Phase 5 the Director layer
proposes from a notice card. Left alone, a proposal from six weeks ago sits next
to one from this morning looking equally live — and a queue where everything
looks live is a queue nobody works.

Endpoint: `POST /api/ai/actions/expire-stale`, guarded by `x-cron-secret`.

Like the notices sweep, and unlike the notification digest, this is a plain HTTP
trigger rather than a standalone worker. Everything it needs is already in the
app, so it has **no checkout to keep in step with the repo layout** — the hazard
documented in `docs/notification-digest-cron.md` does not apply here. Do not
model this line on the digest's.

## What one run does

1. Finds `pending` `ai_actions` rows created more than `AI_ACTION_EXPIRY_DAYS`
   ago (default **14**), across every community — or one, with
   `{"orgId": "..."}`.
2. Flips each to `status: rejected`, tagged

   ```
   error_message: auto-expired (stale 14 days)
   result:        { expired: true }
   ```

3. Returns `{ expired, windowDays, dryRun, scope }`.

**Only `pending` rows are ever touched.** An executed action is a thing that
happened and a failed one is a thing that broke; neither becomes less true with
age, and sweeping them would rewrite history.

**No new status value.** Adding `expired` to the enum would mean a schema change,
a types regeneration, and every existing status switch in the app quietly missing
a case. `rejected` is already true — nobody approved it — and
`app/components/ai/ActionCard.vue` reads the `auto-expired` prefix to render
"Expired" rather than "Rejected", so the human distinction survives without the
machinery.

**Idempotent by construction.** The second run finds nothing pending past the
cutoff, because the first run's rows are no longer pending. It reports
`expired: 0` rather than re-stamping anything.

## Who may run it

| Caller | Scope |
|---|---|
| `x-cron-secret` matching `CRON_SECRET` | every community, or one with `orgId` |
| an authenticated session | `orgId` **required**, and compose-gated |

There is no org-wide sweep for a logged-in user at any role. A person may retire
their own community's stale queue and nobody else's.

## One-time setup

1. `CRON_SECRET` is already set in the app's env. **No new variable**, and no
   schema change — this phase adds no collections and no fields.

2. Optionally set `AI_ACTION_EXPIRY_DAYS` if 14 days is wrong for you. Values
   below 1 are ignored and the default stands.

3. Check what it would do first, from any machine that can reach the app:

   ```bash
   curl -sS -X POST https://app.hoaconnect.info/api/ai/actions/expire-stale \
     -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' \
     -d '{"dryRun": true}'
   ```

4. Add a **weekly** crontab entry on the droplet. Weekly, not nightly: the
   window is a fortnight, so a run every night can only ever find the handful
   of rows that crossed the line in the last 24 hours, and the sweep is
   cheapest when it has something to do.

   ```bash
   # HOA Connect — weekly stale-proposal sweep (Sundays, 07:40 UTC)
   40 7 * * 0 /usr/bin/curl -sS -X POST https://app.hoaconnect.info/api/ai/actions/expire-stale -H "x-cron-secret: $CRON_SECRET" -H 'content-type: application/json' -d '{}' >> /var/log/hoa-action-expiry.log 2>&1
   ```

   Put it *after* the nightly notices sweep in the crontab if you like, but the
   two are independent: the notices cron proposes nothing itself — it only
   notifies — so there is no ordering requirement between them.

## Reading the log

```
{"expired":3,"windowDays":14,"dryRun":false,"scope":"all"}
```

A number that keeps climbing week after week means proposals are being generated
faster than anyone is deciding them. That is a signal about the notices
thresholds or about who is watching the queue — not about this sweep.
