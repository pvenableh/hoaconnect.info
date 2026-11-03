# Spec — the email send queue (Phase 3b)

_Written 2026-11-03 in Session 6 (Fable 5.1, design only). Builds in Phase 3b-build
(Opus 5.5). The plan is `docs/plan-earnest-parity-round3-gtm.md` §3b; the port target is
Earnest's `server/utils/newsletter-batch.ts` and `newsletter-prepare.ts`. This document
decides; the build implements it and the test list at the end pins it._

The one property this design exists for: **no resident is ever sent the same organization
email twice, whatever kills the function and whenever.** Everything else (progress,
resumability, speed) is secondary and must not weaken it.

---

## 0. What changes, in one paragraph

Today `send.post.ts` mails every recipient inside the HTTP request, one `await` at a time,
and writes a `hoa_email_recipients` row after each message. `sendEmailJob` does the same
inside the scheduled-email cron. Nothing is claimed, nothing resumes, and a function killed
at recipient 212 of 300 leaves 88 people unmailed with no record of which. After 3b, a send
is two steps: **enqueue** (the request resolves the audience, applies 3a's rules, mints
tokens, and writes one `hoa_email_recipients` row per person as `queued`, in send order,
then sets `total_recipients`) and **ticks** (a cron, or one inline tick for small sends,
takes a per-email lease, claims rows in chunks of 100, renders and delivers them ten at a
time, and settles each row `sent`, `failed`, `suppressed` or `unknown`). Counts on
`hoa_emails` are derived from the rows, never incremented. The compliance rules from 3a run
at the same two points they run today: once per send at enqueue and once per run, once per
recipient at render.

---

## 1. Vocabulary

| Word | Means |
|---|---|
| **send** | One `hoa_emails` row going out once. A recurring email has one send per occurrence. |
| **occurrence** / `run_key` | Which send of a recurring email a row belongs to. For a manual send it is the enqueue time; for a scheduled one the occurrence's `scheduled_at`. |
| **row** | One `hoa_email_recipients` record: one message to one address. |
| **run** | One execution of the batch loop inside one function invocation, holding the lease. |
| **tick** | One invocation of the cron route; it may run several sends. |
| **lease** | The per-email mutex: a `hoa_email_send_leases` row, unique per email. |
| **claim** | The run's token written on a chunk of rows it is about to deliver. |
| **settle** | Writing a row's terminal state after delivery was attempted. |
| **accepted** | SendGrid answered 202 to `mail/send`. This is what `sent` means. "Delivered" is SendGrid's later webhook event and lives in a different column. |

---

## 2. Decision 1 — recipients are the queue

### 2.1 Row states

`hoa_email_recipients.status` becomes the queue's state column. Values:

| `status` | Meaning | Terminal |
|---|---|---|
| `queued` | Written at enqueue; nobody owns it. | no |
| `claimed` | A run owns it (`claim` = that run's token, `claimed_at` set). It may have been handed to SendGrid. | no |
| `sent` | SendGrid accepted the message (202), or the webhook later proved it did. `sent_at`, `sg_message_id` set. | yes |
| `failed` | SendGrid refused it (4xx other than 429, or a 5xx three times), or it could not be rendered, or the member has no address. `error_message` set. **Never retried by the queue.** | yes |
| `suppressed` | Held back by 3a's rules: bounced, or opted out of community mail. `suppressed_reason` set. Written at enqueue, or at render when the member's state changed mid-send. | yes |
| `unknown` | Its run died while it was `claimed`, or SendGrid's answer was lost (network error, timeout). **May or may not have gone. Never resent by the queue.** | yes, until the webhook promotes it to `sent` |

The legacy values `pending`, `delivered` and `bounced` stay in the enum so old rows still
type-check and render, but nothing writes them after 3b. The webhook's delivery events move
to a new column, `delivery_status` (`delivered` \| `bounced`, null until an event arrives),
so delivery outcome and queue state never fight over one field. Today
`activity.post.ts:323` overwrites `status` with `delivered`/`bounced`; nothing in the app
reads those values (`useEmailSystem.formatStats` reads the `hoa_emails` counts only), so the
move costs nothing.

Why five-plus-one and not Earnest's six: Earnest's `sending` is renamed `claimed` because
the row is claimed before anything is sent and the name should say what is known, not what
is hoped; Earnest's `skipped` becomes `suppressed` because in HOA Connect the only reason a
queued row is not attempted is a 3a rule, and the UI must say "held back" with the reason,
not "skipped".

### 2.2 Row fields (additive; `scripts/add-email-send-queue.ts`, `pnpm add:email-send-queue`)

On `hoa_email_recipients`:

| Field | Type | Written at | Why |
|---|---|---|---|
| `status` | enum, extended as above | every step | the queue |
| `kind` | `member` \| `copy` | enqueue | a `copy` row is a standalone CC/BCC copy (§8) with no member |
| `run_key` | string(32) | enqueue | the occurrence (§1); every queue query filters on it |
| `position` | integer | enqueue | send order; the claim reads `sort: ["position", "id"]` |
| `dedupe_key` | string(160), **unique** | enqueue | `${emailId}:${run_key}:m:${memberId}` for member rows, `${emailId}:${run_key}:a:${address lower-cased}` for copies. Makes the snapshot idempotent (§2.4) |
| `claim` | string(36), null | claim / release | the run's UUID |
| `claimed_at` | datetime, null | claim / release | stale detection (§4) |
| `member_fields` | json, null | enqueue | the **output** of `resolveMergeFields(member, org)`: a flat token → value map, plus `first_name` and the primary unit number. Not the member record |
| `copies` | json, null | enqueue | `{ cc: string[], bcc: string[] }` on member rows of a small send (§8); null otherwise |
| `suppressed_reason` | `bounced` \| `opted_out` \| `bounced_mid_send` \| `opted_out_mid_send` | enqueue / render | the chip on the detail page |
| `delivery_status` | `delivered` \| `bounced`, null | webhook | §2.1 |
| existing: `recipient_email`, `recipient_name`, `member`, `email`, `sent_at`, `error_message`, `sg_message_id` | | | unchanged |

On `hoa_emails`:

| Field | Type | Why |
|---|---|---|
| `total_recipients` | integer, null | null while preparing; set **last** at enqueue, so no run claims from a half-written snapshot. Counts member rows and copy rows, excluding suppressed rows |
| `total_sent`, `total_failed`, `total_suppressed`, `total_unknown` | integer | derived from rows at every settle and at completion (§5); never incremented |
| `send_run_key` | string(32) | the occurrence in flight; queue queries use `{ email, run_key: send_run_key }` |
| `send_started_at`, `send_finished_at` | datetime | the detail page's timeline |
| `send_errors` | json | the first 20 `address: reason` failures of the occurrence, written at completion |
| `send_last_error` | text, null | what stopped the last run before it claimed (a Directus 503, an attachment that would not load); cleared by the next chunk that settles. The progress route shows it as "Paused: …" without changing status |
| existing `recipient_count`, `delivered_count`, `failed_count` | | kept and written at completion as `total_recipients`, `total_sent`, `total_failed`, so `useEmailSystem.formatStats` and every older reader keep working until the progress UI replaces them |

`hoa_emails.status` keeps its five values. For a send: `draft`/`scheduled` → `sending`
(preparing, `total_recipients` null) → `sending` (`total_recipients` set) → `sent` or
`failed`. `paused` is **not** added in 3b; Phase 4's auto-pause adds it.

New collection `hoa_email_send_leases` (§3.1): `id`, `email` (M2O `hoa_emails`, **unique**),
`token` (uuid), `purpose` (`prepare` \| `send`), `worker` (`inline` \| `cron` \| `manual`),
`started_at`.

The script is idempotent like `add-email-compliance-fields.ts`, uses `is_unique: true` on
`dedupe_key` and `hoa_email_send_leases.email`, and narrows the non-admin read
permissions on `hoa_email_recipients` to exclude `claim` and `member_fields` (the merge
snapshot holds balances). Before the script runs, `send.post.ts` and `sendEmailJob` keep
today's synchronous path behind a schema probe (`emailQueueSchema()`, the same shape as
`emailComplianceSchema()`), so a deploy ahead of the script changes nothing.

### 2.3 What is written at each step

```
enqueue   hoa_emails: status=sending, send_run_key, send_started_at, total_recipients=null
          lease(prepare) insert
          rows: queued | suppressed | failed(no address)  — 500 per createItems, position ascending
          hoa_emails: total_recipients, total_suppressed    ← last
          lease delete
tick      lease(send) insert  (or break a stale one, §4)
          expire: claimed rows of dead runs → unknown
          loop: read queued → render → claim → recheck → deliver → settle → derive counts
          completion (when no queued/claimed remain): status, totals, sent_at, send_errors, legacy counts
          lease delete
webhook   delivery_status; and claimed|unknown → sent (evidence, §4)
```

### 2.4 Enqueue idempotency

The snapshot is written in `createItems` batches of 500 in position order. A batch is one
Directus transaction, so a function killed mid-batch leaves no partial batch. A resumed
enqueue (not implemented in 3b — see below) would start at `max(position) + 1`, Earnest's
rule. The `dedupe_key` unique index is the guard behind that rule: if any path ever tries
to write the same person into the same occurrence twice, Directus answers
`RECORD_NOT_UNIQUE` and the batch is refused, instead of one resident getting two rows and
two messages.

3b does **not** resume a half-written snapshot. HOA audiences are tens to low hundreds, so
the snapshot is one or two batches and takes well under a second; the cost of a resume path
is not worth it. Instead, a send still `sending` with `total_recipients` null and
`send_started_at` older than `PREPARE_STALE_MS` (10 min) is closed by the tick: status
`failed`, `send_errors = ["Stopped while getting ready — nobody was sent this. Send it
again."]`, and its rows deleted (Earnest's `closePreparingSend`). Nothing was claimed while
`total_recipients` was null, so nobody got it.

A second enqueue of the same occurrence (two schedulers firing, an admin double-clicking
Send on a draft being resent) is refused by the lease (§3.1) before any row is written, and
answers `409 send_in_progress`.

---

## 3. Decision 2 — lease, claim and settle; what "at most once" means

### 3.1 The lease: why Earnest's conditional update is not enough here

Earnest claims with `updateItems(filter: { id in ids, status = 'queued' })` and reads back
by token. That is safe only if the filter-update is one atomic SQL `UPDATE … WHERE`. In
Directus it is not: `ItemsService.updateByQuery` first **selects** the keys matching the
filter, then **updates by primary key** without the status condition. Two overlapping runs
can both select the same queued rows, both update them (the second overwrites the first's
token), and — if the first run read its rows back before the second's update — both deliver
them. Earnest narrows the window with `busySince` (a check-then-act), and in Earnest the
only runner is the cron, so overlap is rare. In HOA Connect overlap is routine: the admin
clicks Send at :59, the inline tick starts, and the cron fires at :00.

The one atomic primitive Directus exposes is a **unique index on insert**. So the mutex is a
row: `hoa_email_send_leases` with `email` unique. A run that wants to touch a send's rows
inserts `{ email, token, purpose, worker, started_at }`. Exactly one insert succeeds; the
other gets `RECORD_NOT_UNIQUE` and stops (`stopped: 'busy'`). From then on, every write
to that send's rows is by a single live writer, and Earnest's claim and settle writes are
safe as written. The lease is deleted by its holder at the end of the run (by id; a delete of
a row already gone is a no-op).

Prepare takes the same lease with `purpose: 'prepare'`, so two schedulers cannot both
snapshot an occurrence, and no tick can start sending while the snapshot is half-written
(it would find the lease held, and in any case `total_recipients` null).

### 3.2 Claim

With the lease held, a run:

1. **reads** the next `CHUNK` (100) rows `{ email, run_key, status: queued }` sorted by
   `position, id`;
2. **renders** them (§6, §8) into messages, before claiming, so a run killed while
   rendering leaves them `queued`, not `unknown`;
3. **claims** them: `updateItems(filter: { id in ids, status: queued }, { status: claimed,
   claim: token, claimed_at: now })`, then reads back `{ email, run_key, claim: token,
   status: claimed }`. Under the lease the read-back equals the claim; the read-back stays as
   the belt to the lease's suspenders, and because it is what the run delivers from, a run
   can never deliver a row whose stored `claim` is not its own token;
4. **rechecks** the claimed members' live state (§6.2) in one read;
5. **delivers** with `CONCURRENCY` (10) workers, each row through `deliverOnce` (retry
   ×3 on 429 and 5xx with 1 s / 2 s backoff; no retry on 4xx; **no retry on a network error
   or timeout**, because the message may have gone);
6. **settles** (§3.3);
7. **derives counts** onto `hoa_emails` (§5) and loops while budget remains (§7).

If anything throws between the claim and the first `deliver` call, the run **releases**
its chunk: `updateItems(filter: { email, run_key, claim: token, status: claimed },
{ status: queued, claim: null, claimed_at: null })`. Once the first `deliver` has started,
nothing in the chunk ever goes back to `queued`.

### 3.3 Settle

One write per outcome group, grouped to keep the number of requests small:

| Outcome of `deliverOnce` | Row becomes | Fields |
|---|---|---|
| 202 | `sent` | `sent_at`, `sg_message_id` (from `x-message-id`) |
| 429 after three tries | `queued` (requeued; the run stops with `rate_limited`) | `claim`, `claimed_at` cleared |
| 4xx (not 429), or 5xx ×3 | `failed` | `error_message` = `status: detail` |
| network error / timeout | `unknown` | `error_message` = the error; `sg_message_id` null |
| render failure (`fail`) | `failed` | `error_message` |
| recheck says suppressed | `suppressed` | `suppressed_reason` = `*_mid_send` |

`unknown` and `failed` rows are written with the filter `{ id in ids, status: claimed }`
rather than by bare id, so a webhook event that arrived first and already promoted the row
to `sent` (§4.3) is not overwritten. (The filter-update is read-then-write, so a window of
milliseconds remains; the next webhook event for that message, `delivered` after
`processed`, promotes it again. The count self-heals.)

Settle is retried through a busy Directus (Earnest's `retryBusy`, two more tries at 1 s and
2 s): it writes what already happened, so repeating it is safe, and a settle that lands on
the second try turns would-be `unknown` rows into the `sent` they really are.

### 3.4 The window, and which side of it we choose

The window: SendGrid returned 202 for row _r_ and Vercel killed the function before _r_'s
settle write landed. _r_ is still `claimed` with a dead run's token. The next run must do
one of two things with it:

- **resend it** — the resident gets the dues notice twice; or
- **not resend it** — if the 202 was real, they got it once; if the settle was lost for some
  other reason (it was not: a 202 is a 202), they get nothing.

**We choose not to resend. A row of a dead run becomes `unknown` and the queue never
touches it again.** A dues notice sent twice is "you owe $450" arriving twice, which
residents read as a billing error and boards read as a system they cannot trust; it cannot
be recalled. A dues notice dropped is recoverable: the admin sees "2 unknown" on the detail
page with the two addresses, and the reminder engine (Phase 5) will send the next dues
reminder on schedule anyway.

What makes the choice safe in practice rather than merely principled:

1. **The window is tiny and the evidence arrives on its own.** SendGrid posts a `processed`
   event within seconds of a 202 and `delivered` shortly after. The webhook promotes a
   `claimed` or `unknown` row to `sent` on any event for that message (§4.3). So in the
   normal case an `unknown` row is `unknown` for seconds, not forever, and the admin never
   sees it.
2. **The queue is single-writer** (§3.1), so "a dead run's row" is well-defined: any
   `claimed` row seen by a run holding the lease belongs to a run that cannot still be
   alive (§4.1).
3. **`unknown` is loud.** It is a count on the progress route, a chip on the detail page,
   and a line in `send_errors`. It is not silently folded into `failed`.
4. **Nothing resends `unknown` automatically.** A "Resend to these N" action is a new
   enqueue of a new send targeting those members, after the admin has looked; that UI is
   Phase 4 (open question 4).

So "at most once" means precisely: **for every row, `deliver()` is called at most once
across all runs, ever.** The proof sketch: a row is handed to `deliver` only from a run's
read-back of its own claim; a row enters `claimed` only from `queued`; it leaves
`claimed` only to a terminal state, or back to `queued` by `release`, and `release` is
called only by the claiming run itself and only before its first `deliver`. Therefore no
row that has been handed to `deliver` is ever `queued` again, and no two runs can hold
the same claim because only one run holds the lease. The kill-matrix test (§10, group I)
exercises every step of this.

What the choice does **not** cover, stated so nobody is surprised: a 5xx from SendGrid is
retried, as in Earnest, on SendGrid's documented promise that a 5xx means the message was
not processed. If SendGrid ever 500s after accepting, that message is doubled. This is
SendGrid's contract, not ours, and the alternative (treat 5xx like a network error → every
SendGrid blip becomes an `unknown`) is worse for the admin.

---

## 4. Decision 3 — stale claims: timeout, reclaimer, evidence

### 4.1 Timeout

The function has a hard stop. 3b **sets it explicitly** rather than inheriting a plan
default nobody has looked at: `maxDuration: 60` on the tick route in `vercel.json`
(`functions` config) — open question 1 asks Peter to confirm the plan allows it. Then:

- `TICK_BUDGET_MS = 45_000`: stop claiming once this much of the tick has gone. A claimed
  chunk always finishes.
- `CHUNK_RESERVE_MS = 15_000`: do not claim a new chunk with less than this left.
- `SENDGRID_TIMEOUT_MS = 8_000` on the client.
- `STALE_MS = 180_000` (3 min): a `claimed` row older than this, and a lease older than
  this, belong to a run that is dead. A test pins `STALE_MS >= 3 * maxDuration`.
- `PREPARE_STALE_MS = 600_000` (10 min) for the preparing phase (§2.4).

### 4.2 Who reclaims

Nobody "reclaims" rows; rows of a dead run are never sent again. What is reclaimed is the
**lease**. The next tick that finds a lease with `started_at < now − STALE_MS` deletes it
by id and inserts its own. Two ticks racing to break the same stale lease both delete (the
second is a no-op) and both insert; the unique index lets one through. Its first act is
`expire`: `updateItems(filter: { email, run_key, status: claimed, claimed_at < now −
STALE_MS }, { status: unknown, error_message: "Its run stopped mid-send; not retried, so
nobody gets it twice." })`. Under the lease every `claimed` row is an orphan, so the
`claimed_at` guard is redundant; it stays because it costs nothing and protects the day
someone raises `maxDuration` without reading this.

Vercel clocks are NTP-synced; 3 min against a 60 s hard stop is a 3× margin.

### 4.3 Evidence

Three pieces of evidence, in the order they are used:

1. **The row's own state** — `claimed` with a dead token means "may have gone". That alone
   decides the queue's behaviour: never resend.
2. **`custom_args`** on every queued message gain `recipient_id` (the row id) and
   `run_key`, beside today's `email_id`, `recipient_email`, `organization_id`. The webhook
   (`activity.post.ts`) looks the row up by `recipient_id` first — exact, and immune to the
   household case where two members share one address and the current
   `(email_id, recipient_email) limit 1` lookup picks the wrong row — then falls back to
   today's two lookups for mail sent before 3b.
3. **Any webhook event for a row in `claimed` or `unknown` promotes it to `sent`**
   (`sent_at` = the event's timestamp, `sg_message_id` = the event's, cleaned as today).
   An event exists only for a message SendGrid accepted, so this is proof, not inference.
   `delivered` / `bounce` / `dropped` additionally write `delivery_status`. The webhook
   never writes `status` for any other reason.

`x-message-id` from the 202 is stored at settle as today (`sg_message_id`) and is the
fallback join key for events, as today. It is **not** used to decide resends: by the time
a run could consult it, the decision (never) is already made.

---

## 5. Decision 4 — progress arithmetic

### 5.1 Counts are derived

One query per derivation: `aggregate("hoa_email_recipients", { aggregate: { count: "id" },
groupBy: ["status"], query: { filter: { email, run_key } } })`. The Directus SDK 20 supports
it; `tests/server/email-send-queue-store.test.ts` pins the exact request. From the result:

```
queued, claimed, sent, failed, suppressed, unknown  (missing groups = 0)
attempted = sent + failed + unknown
remaining = queued + claimed
deliverable = total_recipients            (null while preparing)
```

The run writes `total_sent`, `total_failed`, `total_unknown` to `hoa_emails` after every
settle (one update per chunk, so the progress route reads one row, not the aggregate, when
polled; the aggregate is for the run and for completion). `total_suppressed` is written at
enqueue and again at completion (mid-send suppressions add to it).

### 5.2 The done condition

A send is **done** when `total_recipients` is not null **and** `remaining = 0`. The run
that observes this after its settle performs completion; so does any tick that finds a
`sending` email with no live lease in that state (a run that died between its last settle
and its completion write). Completion is idempotent: every value is derived.

```
status            = sent   if sent >= 1
                  = failed if sent = 0            (everyone failed/unknown/suppressed)
sent_at           = now (first completion only)
send_finished_at  = now
total_*           = the aggregate
send_errors       = first 20 of failed|unknown rows as "address: reason", by position
recipient_count   = total_recipients        ┐
delivered_count   = total_sent              │ legacy, for today's readers
failed_count      = total_failed            ┘
```

For a recurring email, completion instead returns the row to `scheduled` with
`scheduled_at`/`next_run_at` rolled forward exactly as `process-scheduled.post.ts:57–66`
does today, `last_run_at = now`, and leaves `send_run_key` pointing at the finished
occurrence so the detail page can show its counts until the next one starts.

### 5.3 Partial failure

`failed` and `unknown` do not fail the send. Only "nobody got it" does. A send with 298
sent, 1 failed and 1 unknown is `sent`; the progress route and the detail page say so with
the numbers and the two addresses. This is Earnest's rule and the one admins expect: the
newsletter went out.

An "everyone suppressed" send never reaches the queue: enqueue refuses with
`400 all_recipients_suppressed` before writing any row, as 3a does today.

### 5.4 The progress route

`GET /api/email/[id]/progress` — same gate as send (`requireAdminOrManagerGrant(event,
org, "communications")`), 404 for an email outside the caller's org. Returns:

```json
{
  "status": "sending",
  "phase": "preparing" | "sending" | "done",
  "total": 300, "sent": 212, "failed": 1, "unknown": 0, "suppressed": 12,
  "queued": 87, "claimed": 0,
  "stalled": null | "Could not load attachment …",
  "updatedAt": "…",
  "errors": [ { "address": "…", "reason": "…" } ]
}
```

`phase` is derived: `preparing` while `total_recipients` is null; `done` when `status` is
`sent`/`failed` or (`scheduled` with `send_finished_at` for this `send_run_key`); otherwise
`sending`. The compose page's send dialog and the detail page poll it every 5 s while
`phase !== "done"` and render:

- `preparing` → "Getting ready · {rows so far} people"
- `sending` → "Sending · {attempted} of {total}" (+ " · {suppressed} held back" when > 0)
- `done` → "Sent · {sent} accepted" + ", {failed} failed" + ", {unknown} unknown" as
  applicable; `failed` status → "Not sent · nobody could be reached".

"Accepted", not "delivered": `delivered` is the webhook's word and the detail page shows it
per row from `delivery_status`. The comms dock badge shows a count of the org's emails in
`phase: sending`.

---

## 6. Decision 5 — where 3a's rules run

The rule from the kickoff: the queue keeps calling `checkSendCompliance` once per send and
`recipientCompliance` once per recipient, at the same two points. Here are the points.

### 6.1 At enqueue (once per send)

1. `checkSendCompliance({ emailType, requestedClass, org })` — the class, and the postal
   address for community mail. A refusal is `400` from `send.post` and
   `EmailComplianceRefusal` from the scheduled path, before any row or lease is written.
2. The audience is read with `MEMBER_SUPPRESSION_FIELDS`; `partitionAudience(audience,
   emailClass)` splits it. **Suppressed members are written as rows**, `status: suppressed`
   with `suppressed_reason`, position after every deliverable row, so the detail page lists
   who was held back and why without a second audience read. They are excluded from
   `total_recipients`.
3. `ensureUnsubscribeTokens(directus, recipients)` for community mail, one batch write and
   one read-back, exactly as today. The token is **not** copied into the row: the row is a
   plan, the token is a credential, and the read at render (§6.2) fetches the stored one,
   which is the only one that resolves a click.
4. A member with no address is written `failed`, `error_message: "No email address"`, as
   today's counts do; they are not deliverable and not in `total_recipients`.

### 6.2 At render (once per run, once per recipient)

Once per run, before the first claim: `checkSendCompliance` again on a fresh org read. The
class cannot change (it is on the row), but the postal address can be deleted mid-send. If
it now fails, the run stops before claiming, writes `send_last_error` with the message, and
the send waits (its rows stay `queued`) until the address is back. It does not fail the
send: half the community already has the footer with the address they were promised, and
the fix is one Settings field.

Once per claimed chunk, **after the claim and before the first deliver**: one
`readItems("hoa_members", { id in memberIds, fields: ["id", "email", ...MEMBER_SUPPRESSION_FIELDS] })`.
For each row, `suppressionReason(liveMember, emailClass)`:

- a reason → settle the row `suppressed`, `suppressed_reason: bounced_mid_send |
  opted_out_mid_send`, never delivered. **A member who unsubscribes or bounces at 11:04
  does not get the 11:05 chunk.**
- no reason → `recipientCompliance({ emailClass, org, mailingAddress, appUrl, emailId,
  token: liveMember.unsubscribe_token })` gives the headers and footer for this one
  message, as today.

Why after the claim and not before: the recheck is the last read before delivery; doing it
before the claim would leave a window the size of the claim write. Why one read per chunk
and not per row: 100 ids in one `_in` is one request; the chunk takes two to three seconds
to deliver, which is the staleness bound.

Why the live member's token and not a snapshot: §6.1 item 3.

The recheck read failing (a busy Directus) stops the run **before** delivery with the chunk
released — the same rule as any pre-delivery failure — because sending without the recheck
would mean sending to someone who may have unsubscribed.

---

## 7. Decision 6 — the cron, its budget, and who becomes a queue client

### 7.1 `GET /api/email/cron/continue-sends`

- File `continue-sends.ts`, **not** `.post.ts`: Vercel Cron issues GET only
  (`cron-auth.ts` header comment). The body is read defensively.
- Auth: `requireCronOrAppAdmin(event)`. The cron secret, or an App Administrator by hand.
- Schedule `* * * * *` in `vercel.json`; `maxDuration: 60` (§4.1; open question 1).
- Two phases in one tick, in this order:
  1. **Enqueue due scheduled emails** — the body of today's `process-scheduled.post.ts`,
     minus the inline send: `scheduled` with `scheduled_at <= now`, 25 at a time, each
     through the enqueue path under a `prepare` lease. `process-scheduled.post.ts` stays
     and calls the same function, so the Directus Flow "Email Scheduler" keeps working
     until Peter retires it; two schedulers cannot double-enqueue (§3.1).
  2. **Run batches** — `sending` emails with `total_recipients` not null, oldest
     `send_started_at` first, each `runBatch` with the budget that remains; then close
     stale preparing sends (§2.4); then complete any done-but-unwritten sends (§5.2).
- Returns `{ enqueued, runs: [{ emailId, stopped, sent, failed, unknown, requeued,
  expired }], closed, completed }` for the cron log.

### 7.2 Batch size and time budget

`CHUNK = 100`, `CONCURRENCY = 10`. At a realistic 250 ms per `mail/send`, a chunk takes
about 2.5 s plus render; a 45 s budget is roughly 15 chunks, 1,500 recipients per tick per
email. HOA audiences are tens to low hundreds, so a send finishes in one tick. Several
sends in flight share the tick's budget in order; a send that does not finish continues
next minute. There is no daily cap (ramp-up is deliberately not ported).

A chunk is never abandoned for budget: `CHUNK_RESERVE_MS` keeps the last chunk inside the
hard stop in the normal case, and if SendGrid stalls across a whole chunk the rows go
`unknown`, which is what `unknown` is for.

### 7.3 The inline tick

`send.post.ts` after enqueue: if `total_recipients <= INLINE_MAX (50)`, run one tick for
this email inline, under a `send` lease with `worker: inline` and `INLINE_BUDGET_MS =
20_000`, **awaited before the response** (Vercel freezes a function after it responds). The
response carries the progress object. Over 50, the response is `{ id, total, phase:
"sending" }` immediately and the cron picks it up within a minute; the dialog shows
"Sending · 0 of 300" at once. If the inline tick loses the lease to a cron tick that got
there first, it returns `busy` and the response is the same: the UI polls either way.

### 7.4 Sender unification — who queues, who stays direct

The rule: **a send is queued when one body fans out to an org audience and has a
`hoa_emails` row. A send stays direct when it is one message to one person caused by one
event.** The queue's at-most-once needs a persisted plan row per person; a direct send's
"plan" is the event that caused it, and a retry is a new event. Every direct sender adopts
`resolveSender()` and the bounced guard; none adopts the opt-out (they are essential or
have no class).

| Path | Today | After 3b | Why |
|---|---|---|---|
| `email/send.post.ts` | synchronous loop | **queue client**: enqueue + inline tick ≤ 50 | the bulk path |
| `sendEmailJob.ts` via `process-scheduled` and the tick | synchronous loop in the cron | **queue client**: enqueue only; the tick sends | same body, same audience, same need to resume |
| `email/test.post.ts` | ≤ 5 typed addresses, synchronous | **direct**; `resolveSender()` | the admin is waiting; there is no `hoa_emails` row and the addresses are not an audience |
| `transactional-email.ts` (`sendBrandedTransactionalEmail`) | direct per user | **direct**; `resolveSender()`; **skip members with `email_bounced`** and log | one notice per event; essential, so no opt-out |
| `scripts/notification-digest-worker.ts` | direct HTTP from the droplet | **direct**, unchanged beyond 3a (it already partitions as community) | a per-user digest with its own loop and runbook (`docs/notification-digest-cron.md`) |
| `scripts/billing-worker.ts` | direct HTTP from the droplet | **direct**; **skip `email_bounced` members**; `resolveSender()` for the org's name/from | one reminder per charge; essential |
| `sendEmail`, invites, welcome, accept, inquiries | direct | untouched | Session 5's side findings (no demo guard, no rate-limit on `public-inquiry`) stay listed for Phase 9 |

`resolveSender(org, stream)` lives in `sendgrid.ts` as §3b item 11 says: `from_name` from
`settings.from_name`, else `org.name`; `from_email` only when
`settings.email_domain_verified`; `reply_to` from `settings.reply_to`, else `org.email`;
platform fallback otherwise. Today `sendEmailJob` passes `fromName: organization.name` and
no `fromAddress` — scheduled mail silently drops the white-label sender; the queue's
single render path fixes it for both bulk routes at once.

`OUTBOUND_EMAIL_ONLY_TO` (the plan's allow-list) is implemented inside
`sendOrganizationEmail`, not the queue, so every path is covered by one check; a blocked
address is a `sent` row with `sg_message_id: null` and a log line, like the demo guard.

### 7.5 Deleting or editing a send in flight

`email/[id].delete.ts` answers `409 send_in_progress` for an email in `sending`. Editing a
`sending` email's content is refused the same way by `save.post.ts`. (Both routes also still
need the org gate from Session 5's deviation 2; the build fixes it in passing since it is
touching them.)

---

## 8. Decision 7 — CC/BCC copies, attachments and CID images

### 8.1 CC/BCC

Today's rule (`send.post.ts:452–462`) is kept exactly, decided once at enqueue and written
onto the rows so every run renders the same thing:

- `@board` / `@property_manager` tokens and free-form addresses are resolved once, at
  enqueue (`resolveCcBccEmails`), not per chunk — the board at the moment of Send is the
  board that is copied.
- **Small send** (`deliverable member rows <= settings.cc_bcc_threshold`, default
  `DEFAULT_CC_BCC_THRESHOLD`): each member row gets `copies: { cc, bcc }` and the message
  carries them as real CC/BCC, as today.
- **Large send**: no `copies`; one `kind: copy` row per distinct CC/BCC address, positioned
  **after** every member row, excluding any address that is already a member row of this
  occurrence (they get their personalized one). Copy rows have no member, so: no token, the
  generic unsubscribe page in the footer, no `List-Unsubscribe` header (today's behaviour),
  no mid-send recheck, and `dedupe_key = …:a:<address>`.
- The webhook's `recipient_id` custom arg means a copy row's events land on the copy row,
  not on a member row that happens to share the address.

### 8.2 Attachments

The row stores nothing. **Once per run**, before the first claim, the run loads
`hoa_emails.attachments` (the M2M written at enqueue, as today) from Directus as base64 and
reuses the array for every chunk of the run. An attachment that fails to load **stops the
run before any claim** with `send_last_error = "Could not load attachment <name>"`; the next
tick tries again. Today's code skips a failed attachment and sends without it; in a queued
world that would mean some chunks with the file and some without, which is worse than a
one-minute delay. The total attachment size is not checked in 3b (SendGrid's 30 MB limit
fails the message as `failed` with SendGrid's reason, which is honest); Phase 4 can add a
pre-check at compose.

### 8.3 CID images

`extractImagesAsCid(content)` runs **once per run** on the email's stored content, as it
runs once per request today, and its inline attachments join the chunk's messages. The
`cid:` substitution is in the shared `processedContent`, so per-recipient merge happens on
top of it, as today.

### 8.4 The three body branches

`prepare(rows)` is `deliverTo`'s body lifted out of `send.post.ts` into
`core/server/utils/email-send-render.ts` and shared with the scheduled path: raw MJML/HTML
mode, the SendGrid dynamic template when `SENDGRID_EMAIL_TEMPLATE_ID` is set, and
`buildEmailHtml`. Each returns `{ msg, to }` or `{ fail: reason }`; nothing in it writes.
Per-recipient MJML compilation stays as it is today (Phase 4 owns compiling once and
merging per recipient); at 100 rows per chunk it is inside the budget.

---

## 9. Open questions for Peter

1. **Vercel plan.** Per-minute crons and `maxDuration: 60` need Pro. The two existing crons
   are daily and weekly, which fits either plan. If the project is on Hobby, the tick runs
   daily at best; the fallback is a **chained kick**: the inline tick and each cron tick, on
   finishing with rows left, re-invoke the route through `event.waitUntil(fetch(...))` with
   the secret, bounded to 10 chains. The design above does not change; only §7.1's schedule
   and §7.3's "within a minute" do. The build needs the answer before `vercel.json`.
2. **The Directus Flow scheduler.** Phase 3 decision 3 retires it for a Vercel cron. With
   §7.1 both can run for a while without harm. When should it be switched off?
3. **Recurring emails.** 3b keeps one `hoa_emails` row per recurring email and separates
   occurrences by `run_key` on the rows (§1, §5.2). Phase 4 may prefer one `hoa_emails`
   row per occurrence (a real "sent" record each month). `run_key` is compatible with both;
   flagging so Phase 4 decides knowingly.
4. **Resending `unknown` rows.** Not automatic (§3.4). A "Resend to these N" action on the
   detail page, enabled only after an hour with no webhook event, is proposed for Phase 4.
   OK to leave out of 3b-build?
5. **`member_fields` privacy.** The snapshot holds balances. The schema script narrows the
   non-admin read permissions (§2.2) the way 3a's did. Confirm that is the right shape, or
   whether the snapshot should drop the money fields and re-read them at render.

---

## 10. The test list (named; the build writes them)

One line each: `name: the property it pins`. About 50. Files are under `tests/server/`
unless noted; the state machine tests use an in-memory `RecipientStore` and a fake
`deliver`, as Earnest's do, so they run in milliseconds.

### A. State machine — `email-send-queue.test.ts`

1. `claims in position order, CHUNK at a time`: a 250-row queue is claimed 100, 100, 50 in
   `position, id` order.
2. `renders before claiming`: a `prepare` that throws leaves every row `queued` and no row
   carries a token.
3. `claim writes token and claimed_at only on queued rows`: rows already `claimed` by
   another token, or terminal, are untouched by a claim.
4. `delivers only rows read back under its own token`: a row whose stored `claim` differs
   from the run's token is never handed to `deliver`.
5. `settles 202 as sent with sg_message_id`: `sent_at` and `sg_message_id` come from the
   response.
6. `settles 4xx as failed without retry`: one `deliver` call, `error_message = "400: …"`.
7. `retries 5xx three times then fails`: three calls with 1 s and 2 s sleeps, then `failed`.
8. `retries 429 then requeues and stops rate_limited`: the row is `queued` again with a
   cleared claim; later rows in the chunk are requeued without being delivered;
   `stopped: rate_limited`.
9. `settles a network error as unknown, never retried`: one call, `status: unknown`, the
   error kept.
10. `releases the chunk when something throws before the first deliver`: every claimed row
    is `queued` with claim cleared; `stopped: stalled` on a busy Directus, rethrow otherwise.
11. `never releases once delivery began`: a throw after the first `deliver` leaves the
    chunk `claimed`; nothing goes back to `queued`.
12. `stops at the budget but finishes the claimed chunk`: with `budgetMs` exceeded mid-chunk,
    every row of that chunk is settled and no new chunk is claimed.
13. `does not claim with less than CHUNK_RESERVE_MS left`.
14. `stops done when the queue drains`.
15. `expires claimed rows older than STALE_MS to unknown at run start`: their error text is
    the fixed sentence; younger `claimed` rows (impossible under the lease, but pinned) are
    not touched.
16. `STALE_MS is at least three times the route's maxDuration`.
17. `settle through a busy Directus lands on the second try`: `retryBusy` on settle turns
    would-be unknown rows `sent`.
18. `settle writes unknown and failed only where still claimed`: a row already `sent` by the
    webhook is not overwritten by a late settle.

### B. Directus store — `email-send-queue-store.test.ts` (asserts the exact SDK requests)

19. `queued() filters on email, run_key and status, sorted position then id`.
20. `claim() is a filter-update on queued ids followed by a read-back by token`.
21. `release() is conditional on token and claimed`.
22. `expire() targets claimed rows older than the cutoff of this run_key only`.
23. `counts() is one aggregate grouped by status`: missing groups read as 0.
24. `settle() groups failures by reason and sends one update per group`.

### C. Lease — `email-send-lease.test.ts`

25. `acquire inserts a lease row and returns a token`.
26. `a second acquire gets RECORD_NOT_UNIQUE and reports busy`: no rows claimed, no
    delivery.
27. `a stale lease is deleted by id and replaced`: `started_at` older than `STALE_MS`.
28. `two breakers of one stale lease: exactly one wins`: the loser sees `RECORD_NOT_UNIQUE`
    and stops; both deletes target the stale id only.
29. `release deletes only its own lease by id`: a lease the run no longer holds is not
    deleted.
30. `prepare and send leases are the same mutex`: a tick cannot start sending while a
    prepare lease is held, and a second enqueue answers 409.

### D. Enqueue — `email-send-enqueue.test.ts` (through `send.post.ts` and `sendEmailJob`)

31. `refuses before any write on checkSendCompliance`: a community send from an org with
    no address → 400 `sender_address_missing`; no lease, no row, no `hoa_emails` update.
32. `writes suppressed rows with reasons and excludes them from total_recipients`:
    bounced from both classes, opted-out from community only; positions after deliverable
    rows.
33. `refuses when everyone is suppressed`: 400 `all_recipients_suppressed`, no rows.
34. `mints tokens once for community mail and reads them back`: one batch write; an
    essential send mints nothing.
35. `writes rows in position order, 500 per batch, and sets total_recipients last`.
36. `dedupe_key is unique per occurrence and the batch is refused on a collision`:
    `RECORD_NOT_UNIQUE` surfaces as an error and `total_recipients` stays null.
37. `a member with no address is a failed row, not in total_recipients`.
38. `the scheduled path enqueues and never sends inline`: `sendEmailJob` returns after
    `total_recipients` is set; `deliver` is not called; an `EmailComplianceRefusal` still
    marks the email failed.
39. `member_fields is the merge output, not the member`: the snapshot holds the flat map
    and nothing else.
40. `small send writes copies on member rows; large send writes copy rows last`: the
    threshold rule, resolved group tokens, member addresses excluded from copy rows.
41. `inline tick runs for <= INLINE_MAX and is awaited`: the response carries progress; over
    the limit the response is immediate with phase sending.

### E. The tick — `email-continue-sends.test.ts`

42. `401 without the secret or a session, 403 for a non-app-admin session, 200 for the
    secret`: the `cron-auth` matrix on this route.
43. `enqueues due scheduled emails before running batches`: a due `scheduled` email is
    enqueued under a prepare lease and then run in the same tick.
44. `runs sending emails oldest first and shares the budget`.
45. `closes a send stuck preparing past PREPARE_STALE_MS`: status failed, the fixed
    message, its rows deleted, nothing was ever claimed.
46. `completes a done-but-unwritten send`: a `sending` email with no remaining rows and no
    live lease gets the completion write.
47. `a failing attachment load stops the run before any claim`: `send_last_error` set, rows
    still queued; the next tick clears it after a settled chunk.
48. `checkSendCompliance failing mid-send parks the send`: rows queued, `send_last_error`
    set, status unchanged.

### F. Progress and completion — `email-progress.test.ts`

49. `counts are derived from rows and never incremented`: a settle that lands twice yields
    the same totals.
50. `done means total_recipients set and no queued or claimed rows`: one `claimed` row keeps
    it sending.
51. `status is sent with one acceptance and failed with none`: the three legacy counts and
    `send_errors` (first 20, by position) are written.
52. `recurring completion rolls scheduled_at forward and keeps send_run_key`.
53. `the progress route is org-gated and derives phase`: preparing / sending / done, and the
    three labels' numbers.

### G. The webhook — extend `sendgrid-webhook.test.ts`

54. `looks the row up by recipient_id first, then by email_id + address, then by message id`.
55. `promotes claimed and unknown rows to sent on any event`: `sent_at` from the event,
    `sg_message_id` cleaned; a `sent` row is left alone.
56. `writes delivery_status, never status, for delivered, bounce and dropped`.

### H. Sender unification — `email-sender-unification.test.ts`

57. `resolveSender: name always, address only when verified, reply_to precedence,
    platform fallback`.
58. `transactional and billing senders skip bounced members and log`: opt-out is ignored
    there.
59. `the scheduled path now carries the white-label sender`: through the shared render.

### I. Kill at every step — `email-send-queue-kill-matrix.test.ts`

60. `kill-at-every-step: no address is accepted twice and every row ends terminal`: a
    table-driven test over the steps `lease-acquired`, `snapshot-batch-written`,
    `total-set`, `expire-done`, `queued-read`, `rendered`, `claim-written`,
    `claim-read-back`, `recheck-done`, `first-deliver-accepted`, `mid-chunk (k of n)`,
    `settle-written`, `counts-written`, `lease-released`, `completion-written`. For each,
    the fake throws at that step; the harness then runs ticks (breaking the stale lease by
    advancing the clock) until done. Assert: every address in the fake SendGrid's accept
    log appears at most once; no row is `queued` or `claimed`; rows accepted before the
    kill are `sent` or `unknown`, never `failed`; the final `hoa_emails` totals equal the
    aggregate.
61. `kill mid-chunk then webhook events: unknown rows become sent and the totals follow`.

### J. 3a rules, re-pinned at both points (62–63 point at tests above; 64–66 are tests of their own)

62. `enqueue: partitionAudience and checkSendCompliance run once per send` (tests 31–33).
63. `render: recipientCompliance runs once per recipient with the live token` (A: the
    headers and footer of each message come from the recheck read's token; a copy row has
    no header).
64. `render: a member who opted out between enqueue and claim is suppressed, not sent`:
    `opted_out_mid_send` on a community send; still sent on an essential one.
65. `render: a member who bounced between enqueue and claim is suppressed on both classes`.
66. `render: a failed recheck read releases the chunk and sends nothing`.
