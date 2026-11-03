# Email sending — the send queue (runbook)

How an organization email gets from **Send** to inboxes since Phase 3b. The
design, with its reasons, is `docs/spec-email-send-queue.md`; this page is for
running it.

**The one rule the queue exists for:** no resident ever gets the same email
twice. A function can be killed at any moment; the queue never resends a
message that may already have gone. A message it is unsure about is marked
**unknown**, never retried.

---

## 1. What happens when someone presses Send

1. **Enqueue** (`POST /api/email/send`, or the scheduler for a scheduled email).
   - The class and the postal address are checked (Phase 3a); a refusal is a
     400 before anything is written.
   - The audience is read once. Bounced members, and opted-out members on
     community mail, become **held-back** rows with the reason.
   - Unsubscribe tokens are minted.
   - One `hoa_email_recipients` row is written per person, `queued`, in send
     order, 500 per write.
   - `total_recipients` on the email is set **last**. While it is empty the
     send is "Getting ready" and nothing can claim from it.
2. **Small sends (≤ 50 people)** run one batch inside the same request, so they
   finish before the page responds.
3. **The tick** — `GET /api/email/cron/continue-sends`, every minute (Vercel
   Cron) — does the rest:
   1. enqueues scheduled emails that are due;
   2. runs every email that is sending, oldest first, sharing a 45-second budget;
   3. closes sends stuck "Getting ready" for over 10 minutes (§5);
   4. writes the final status of any send that finished without it.

Each **run** of one email:

- takes the email's **lease** (`hoa_email_send_leases`, one row per email).
  Only one run at a time can hold it;
- marks the rows of a dead run `unknown`;
- loads the org, the attachments and the images once;
- then repeats, 100 rows at a time:
  - **render** the messages;
  - **claim** the rows;
  - **re-read** the members (someone who unsubscribed a minute ago is held back);
  - **deliver**, ten at a time;
  - **settle** each row `sent`, `failed`, `suppressed` or `unknown`;
  - **re-derive** the counts.

The function's hard stop is **60 seconds**. Nitro builds every route into one
Vercel function, so `core/modules/vercel-function-rules.ts` gives this route its
own function with `maxDuration: 60`. A run stops claiming at 45 s, so the last
chunk always finishes inside that stop.

## 2. Row states

| Status | Means |
|---|---|
| `queued` | Waiting to be sent. |
| `claimed` | A run has it and may have handed it to SendGrid. |
| `sent` | SendGrid accepted it (202). "Accepted", not "delivered": delivery is `delivery_status`, from the webhook. |
| `failed` | SendGrid refused it, it could not be rendered, or the member has no address. Never retried. |
| `suppressed` | Held back: bounced, or opted out of community mail. `suppressed_reason` says which, and `*_mid_send` if it happened during the send. |
| `unknown` | **May or may not have gone.** See §3. |

The counts on `hoa_emails` (`total_sent`, `total_failed`, `total_unknown`,
`total_suppressed`) are always **derived from the rows**, never incremented, so
they cannot drift. When a send finishes, the old `recipient_count`,
`delivered_count` and `failed_count` are written too, for older screens.

A send is **sent** if at least one person got it, and **failed** only if nobody
did. "298 accepted, 1 failed, 1 unknown" is a sent newsletter.

## 3. What `unknown` means

A row is `unknown` when:

- its run died after claiming it (the function was killed, or SendGrid hung
  past 8 s) — SendGrid may have accepted it; or
- SendGrid's answer was lost (a network error or timeout).

**It is never resent automatically.** Sending it again could mean "you owe
$450" arriving twice. Dropping it is visible, and recoverable.

**It usually fixes itself within seconds.** Every queued message carries the
row's id (`recipient_id`) in SendGrid's custom args. SendGrid sends any event
(`processed`, `delivered`, `open`…) only for a message it accepted. When such an
event arrives, the webhook (`/api/email/activity`) promotes the row to `sent`
and the email's totals follow. An `unknown` that stays unknown for an hour
almost certainly did not go.

**What an admin sees:** "N unknown" in the send dialog and on the email's
detail page, an **Unknown** chip on each row, and the addresses in the failure
list. To reach those people, send them a new email. A "Resend to these N"
action is planned for Phase 4.

## 4. A parked send (`send_last_error`)

A run can stop **before claiming anything**, leaving every row `queued`. It
writes why to `hoa_emails.send_last_error`, and the dialog and detail page show
it as **"Paused: …"**. The email stays `sending`; nothing is failed.

| Message | Cause | Fix |
|---|---|---|
| `Could not load attachment <name>` | Directus could not serve the file. | Restore the file, or check Directus is up. |
| `<Org> has no mailing address…` | Community mail, and the org's postal address was removed mid-send. | Settings → Organization: add a street plus a city or ZIP. |
| `Service Unavailable` / `fetch failed` | Directus was busy or down. | Nothing: the next tick retries. |

The next tick tries again, every minute. The first chunk that sends clears
`send_last_error`. **No action resends anything:** the rows were never claimed.

## 5. A send stuck "Getting ready"

An enqueue killed between its writes leaves `total_recipients` empty. Nothing
was claimed, so nobody got it.

After 10 minutes the tick marks the send **failed**, with "Stopped while getting
ready — nobody was sent this. Send it again.", and deletes its rows. Send it
again from the composer.

## 6. Setting it up

1. **Schema** (once, admin token in `.env`):

   ```bash
   pnpm add:email-send-queue
   ```

   It is idempotent, and it does four things:
   - extends `hoa_email_recipients` (the queue's fields, a unique `dedupe_key`);
   - extends `hoa_emails` (the totals and the send timeline);
   - creates `hoa_email_send_leases` (with `email` unique);
   - narrows the non-admin read permissions on `hoa_email_recipients`, so no
     resident can read `claim` or `member_fields` (the merge snapshot holds
     balances).

   Then `pnpm generate:types`: expect no diff on these fields, which were
   hand-added.

   **Until the script runs**, nothing changes:
   - `send.post` and the scheduler keep sending synchronously, as before;
   - the tick answers `{ provisioned: false }`;
   - the webhook keeps writing `delivered`/`bounced` to `status`.
2. **Cron**: `vercel.json` schedules `/api/email/cron/continue-sends` every
   minute (Vercel Pro). The route accepts `CRON_SECRET` as a Bearer token,
   which Vercel sends, or an App Administrator session for a manual run:

   ```bash
   curl -H "x-cron-secret: $CRON_SECRET" https://app.hoaconnect.info/api/email/cron/continue-sends
   ```

3. **Confirm the hard stop** after the first deploy: in the Vercel dashboard,
   the deployment's Functions list should show
   `api/email/cron/continue-sends` with a max duration of 60 s.
4. **The Directus Flow "Email Scheduler"** still calls
   `POST /api/email/process-scheduled`, which now only enqueues. Running both
   schedulers is harmless: the lease stops them enqueuing the same email
   twice. Turn the Flow off once the cron has run a scheduled email.

## 7. Testing without mailing anyone

- **Demo orgs never send** (`shouldBlockDemoEmail`). Rows settle `sent` with no
  message id.
- **`OUTBOUND_EMAIL_ONLY_TO`** (dev/staging only): a comma- or space-separated
  list of addresses and `@domain`s. Every org email to anyone else is logged
  and skipped, for every path through `sendOrganizationEmail`.
- `scripts/browser/verify-p3b-queue.cjs` drives the send dialog. The default
  mode answers the API itself and writes nothing. `--real` runs a real 60-person
  send on the demo org, after the schema script.

## 8. Who uses the queue

**Queued:** one body fanned out to an org audience, with an `hoa_emails` row:

- the composer's send (`send.post.ts`);
- scheduled emails (`sendEmailJob`, the tick).

**Direct:** one event causes one message:

- test sends;
- project notifications (`transactional-email.ts`);
- the digest worker;
- billing reminders (`scripts/billing-worker.ts`).

Test sends, transactional notifications and billing reminders take the org's white-label sender from `resolveSender()` (the digest worker is unchanged).
Transactional notifications and billing reminders also skip bounced members.
