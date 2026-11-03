# Reminders (Earnest parity round 3, Phase 5a)

The engine that tells people about what is coming due: dues, meetings,
requests, violations, polls and vendor coverage. Code: `core/shared/reminders/`
(the rules, pure), `core/server/utils/reminders.ts` (the tick),
`core/server/api/reminders/run.ts` (the route), `core/server/emails/reminder-*.mjml`
(the email bodies).

## 1. What goes out, and when

All times are on the community's clock (`hoa_organizations.timezone`, default
`America/New_York`). Day stages go out from the send hour (default 9:00) until
21:00; nothing goes out after 21:00 except the meeting-in-an-hour push.

| Rule | Stage | When | To | How |
|---|---|---|---|---|
| dues | before | 7 days before `due_date` (catches up until the day before) | billed member, unit owners (tenants if `tenants: true`) | bell · push · email, **essential** |
| dues | due | on the due date | same | same |
| dues | overdue | the day after the grace period (`payment_grace_period_days`), for 30 days | same | same, high urgency |
| meeting | week | 7 calendar days before `meeting_date` | the meeting's `target_audience` | bell · push · email |
| meeting | day | from 24 h before, until 1 h before | same | same |
| meeting | hour | the last hour | same | push only, expires at the start |
| request | status | 48 h after `metadata.status_changed_at` (maintenance, ARC, complaint) | the submitter | bell · push · email |
| request | stale | 7 days after the last update or comment, while open | the assignee | bell |
| violation | before | 3 days before `metadata.cure_by` | the member it is about | bell · push · email, **essential** |
| violation | due | on the cure date | same | same, high urgency |
| poll | opened | 48 h after it opened | audience minus voters | bell · push · email |
| poll | closing | the last 24 h before `closes_at` | audience minus voters | same |
| poll | closed | 48 h after `closes_at` | the whole audience, with the result | same |
| coverage | before / expired | 30 days before `hoa_vendors.active_until`; the week after | admins | bell |

**Essential** email ignores the member's category opt-out; the master email
switch and a bounced address still stop it, and the footer says it can't be
unsubscribed.

## 2. At most once

Each reminder has a key, `<rule>:<entity>:<stage>@<anchor>:<user>`, which is
UNIQUE in `hoa_reminder_log`. The tick inserts the row before it sends: of two
overlapping ticks only one insert lands; the other gets `RECORD_NOT_UNIQUE` and
sends nothing. A tick that dies after the insert leaves a `claimed` row: that
reminder is missed, never doubled. A moved due date or a rescheduled meeting is a
new anchor, so it is reminded again.

## 3. Settings (`organization.settings.reminders`)

Every rule is **off** until a board turns it on (Phase 5b's Settings →
Reminders). Shape: `core/shared/reminders/settings.ts`.

```json
{ "send_hour": 9,
  "rules": { "dues": { "enabled": true, "days": 7, "tenants": false, "stages": { "overdue": true } },
             "meeting": { "enabled": true } } }
```

The engine reaches people through their app account (bell, push, and the email
twin), so while the dues rule is on the billing worker keeps reminding only the
members who have **no** account, by email, and leaves everyone else to the
engine. Both stamp `payment_requests.metadata.reminders` (`due_soon` / `due` /
`past_grace`), so neither repeats a stage the other sent. A dry run counts the
due reminders with nobody to reach as `unreachable`.

## 4. Running it

- Vercel Cron calls `GET /api/reminders/run` at :05 every hour (`CRON_SECRET`).
- By hand (an app admin, or the secret): `?dry=1` lists what would go out and
  what the rules that are off would send, and writes nothing; `?org=<slug>` one
  community; `?asOf=<ISO>` (dry runs only) another moment.

```bash
curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/reminders/run?dry=1&org=demo"
```

- Before `pnpm create:reminder-log` has run, the tick answers
  `{ provisioned: false }`; a dry run still evaluates (New York time, every rule
  off, an empty log).
