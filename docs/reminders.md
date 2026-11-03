# Reminders (Earnest parity round 3, Phases 5a and 5b)

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

Every rule is **off** until a board turns it on, in **Settings → Organization →
Reminders** (an admin, or a property manager with the communications grant — the
people who can send in the community's name). Shape:
`core/shared/reminders/settings.ts`; the card is
`app/components/Settings/RemindersSettingsForm.vue`.

- **Turning a rule on is the board's approval of its wording.** The card saves
  through `PUT /api/org/reminders/settings`, which writes `enabled`,
  `approved_at` and `approved_by` together, from the signed-in admin (never from
  the form). A rule that stays on keeps its approval; changing its wording while
  it is on, or turning it off and on again, asks again; a rule that is off has
  none (`prepareReminderSettings`, `core/shared/reminders/admin.ts`).
- Per rule: the stages (a stage turned off is stored as `stages: { <stage>: false
  }`), the lead time (`days`: dues, violations, vendor coverage; the quiet days
  for requests), tenants (dues), and the board's own subject and first sentence
  (`copy`, with `{{tokens}}`).
- The send hour (6 am–8 pm, default 9) and the community's time zone
  (`hoa_organizations.timezone`, the eight US zones the script lists).
- **See it**: the email preview (`GET /api/email/preview-mjml?template=reminder-*`,
  sandboxed; the Branding card's select offers the same four).
- **Send me a test** (`POST /api/org/reminders/test`): one sample reminder to the
  signed-in admin through `sendReminder` — bell, push, email, marked `[Test]`,
  never logged.
- **The next 24 hours** (`POST /api/org/reminders/dry-run`): the engine's dry run
  at each of the next 24 hours, folded into "14 dues reminders, 1 meeting
  reminder", what rules that are off would add, and who can't be reached ("5 have
  no app account — the billing worker emails them"). It reads the **saved**
  settings and writes and sends nothing.

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

## 5. Events — sent when it happens, under the same keys

Three reminder stages are also things that *happen*: a request changed status, a
poll opened, a poll closed. The route that makes one happen tells people at once
(`announceReminderEvent`, `core/server/utils/reminders.ts`), by running the same
rule as the tick for that one request or poll — same audience, same words, same
log key — minus the quiet hours. The key is claimed first, so the hourly tick
that follows finds it taken: **one path sends**.

| Happens | Where | Stage |
|---|---|---|
| a request changes status | `useRequests().applyTransition` → `POST /api/org/requests/status-event` | `request.status` (resident-facing types only) |
| a poll is created open | `POST /api/org/polls/create` | `poll.opened` |
| a draft poll is opened | `POST /api/org/polls/reopen` (a *closed* poll reopened is a correction, not news) | `poll.opened` |
| a poll is closed by hand | `POST /api/org/polls/close` — sets `closes_at` to the close moment when there is none, it is still ahead, or the engine's 48 h window would be missed | `poll.closed` |

The board's approval still decides the **email**: with the rule and stage on, an
event sends what the tick would (bell, push and the approved email, in the
approved wording); with them off it is a bell and a push in the standard words.
The key is claimed either way, so turning a rule on later does not announce the
same thing twice.

Not reminder stages, so no key: **payment received** (a bell and a push to the
member, from the Stripe webhook and from an admin recording a payment —
`core/server/utils/payment-notify.ts`) and **board decision shared** (the
Board Room's minutes shared with the board notify the seated board and the
admins). **Payment overdue** is the dues rule's `overdue` stage (the status flips
in the GitHub Actions billing worker, which can't notify); **document published**
already notifies every member (`POST /api/org/documents/publish`).
