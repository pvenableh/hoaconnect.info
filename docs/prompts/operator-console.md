Build the HOA Connect operator console from docs/plan-operator-console.md. Start a session with
"Read docs/prompts/operator-console.md and do Session N." Do that session only, commit locally, report, and stop.

Session 0 comes first: the plan's decisions (§9) change what A–D build.

## Rules that hold everywhere

- `.env` holds LIVE Stripe keys and points at the production Directus (admin.hoaconnect.info). Never print a value.
- Live Stripe is read-only for the agent. Any live write needs Peter's yes for that action. The agent never makes a live charge.
- Any `.env` Directus write needs a yes first. Print counts and statuses, not names or emails.
- Account details, passwords and card numbers in a flow that reaches the hosted Directus are entered by Peter, not the agent.
- Before deleting anything, read it and check it's what you expect. Abort unless it matches exactly.
- Work on main in this checkout; it auto-deploys, so NOTHING is pushed unless Peter says so in that session.
  `docs/prompts/launch-followups.md` is uncommitted on purpose; leave it.
- Tick a docs/gtm-checklist.md row only when its "Verified when" is met, and say on the row what wasn't checked.

## Token discipline (read this before the first tool call)

This repo is large, and most of the cost of a session is reading. Spend tokens on deciding and testing, not on finding.

**Before reading**
- Read only the files this prompt names for your session, plus what a grep points to. **No Explore agents**, no repo-wide reads.
- Never open `docs/plan-earnest-parity-round2.md`. Never read `core/types/directus.ts` whole (it's huge): grep it for the
  interface you need, e.g. `grep -n "interface HoaMember " -A40 core/types/directus.ts`.
- Grep with `-n` and pipe through `cut -c1-140 | head`. Read files with `offset`/`limit` once you know the lines.
- Don't re-read a file after editing it. Edit fails loudly if it didn't apply.
- Don't re-derive what's written here or in the plan. If something here is wrong, fix this file in your commit.

**Running things**
- Node first, in every shell (the pre-commit hook needs it too):
  `eval "$(/opt/homebrew/bin/brew shellenv zsh)"; eval "$(fnm env --shell zsh)"; fnm use 22.22.1`
- Run the test files you touched first; that takes seconds: `npx vitest run tests/server/<file>.test.ts`.
- Run the full gates once, at the end, in the background, and read only the tail:
  `pnpm test`, `pnpm lint` (≤148 warnings), `pnpm audit:all`, `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`.
  `pnpm build` only before a push.
- This project's TypeScript doesn't narrow unions on a boolean tag (`if (!x.ok)`). Use `"message" in x`.

**Stripe and Directus**
- Prove backend work with tests or Stripe output, never screenshots.
- For Stripe checks, write a small script in the scratchpad that prints counts, statuses and booleans only. Pin
  `Stripe-Version: 2024-11-20.acacia`, filter `metadata.app === "hoaconnect"`, and pipe through
  `sed -E 's/(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9_]+/[REDACTED]/g'`. Test mode for any write.
  Reuse a script across checks rather than writing a new one each time.

**The browser**
- Use the built-in browser with `get_page_text` / `find`; at most one screenshot, at the end, as proof.
- Dev server: `preview_start {name: "hoaconnect"}`. It runs Stripe in test mode.
- An edit hot-reloads the page and resets form state, so navigate again rather than debugging the reset.

**Waiting and talking**
- Never poll. For a deploy, run one background loop on `https://app.hoaconnect.info/_nuxt/builds/latest.json`
  until the `id` changes, and wait for its notification.
- Ask Peter decisions in one `AskUserQuestion` batch (≤4 per call), recommendation first. Don't ask what the
  plan or this file already answers.
- Keep summaries ≤8 lines. If a session grows long, commit, write what's left in this file, and stop. A fresh
  session reading this file is cheaper than a long one carrying everything.

## Where things stand (2026-11-09)

- `docs/plan-operator-console.md` is committed locally and NOT pushed. Its §9 decisions were made 2026-11-09 (Session 0 done):
  `/ops` in the app; **Platform Support role added**; **Phases 1+2 release together**; both support doors; residents report app
  problems directly; all HOA Admins see platform requests; refunds need a reason, plus typed amount above $500; "view as" is a
  later Phase 5.
- **Roles** (plan §2): App Admin (Directus role id `config.public.directusRoleAppAdmin`); per-membership
  `hoa_members.role` (HOA Admin, Property Manager plus `manager_permissions`, Member); board office from current-term
  `hoa_board_members` (not a role); residency `member_type` owner/tenant with a per-unit override (`residencyFor()`);
  agency `billing_account_members.role` (owner, billing_admin, viewer).
- **Billing:** live since 2026-11-09.
  - Discount codes at signup are Stripe promotion codes tagged `app = hoaconnect`.
  - The live webhook endpoint delivers 14 events. The route accepts a second, Connect secret
    (`STRIPE_WEBHOOK_SECRET_CONNECT_LIVE`); that endpoint isn't created yet.
- **Session A done 2026-11-09, committed locally, NOT pushed** (releases with B):
  - Guards `requireAppAdmin`, `requireOpsPermission`, `getPlatformActor` are in `admin-auth.ts`; the matrix is in
    `core/shared/ops/permissions.ts`.
  - **Platform Support role created on the hosted Directus** (Peter's yes). Role `85410c80-…` plus policy `2179dbbd-…`,
    `app_access` true, 0 permissions. The id is the default in `nuxt.config` (`directusRolePlatformSupport`), so no env var is
    needed, and nobody holds the role yet. `pnpm run create:platform-support` re-checks it read-only.
  - Read routes live in `core/server/api/ops/` (overview, communities, `communities/[id]`, billing-accounts, payments). The
    data layer is `core/server/utils/ops-data.ts` (60 s cache, paginated lists); the maths is in
    `core/shared/ops/metrics.ts`. Pages are in `app/pages/ops/`, with `OpsShell` and `OpsStatusPill`, and Nav has an
    "Operations" link for staff. **The payments feed is built** (plan §8 had it in B).
  - Tests: `tests/server/ops-console.test.ts` and `ops-metrics.test.ts`. Session B should extend `ops-console.test.ts`'s
    fake Stripe and `OUTSIDERS` list.
  - Checked against Stripe on 2026-11-09, test mode. App and scratchpad agree: MRR $0, all HOA Connect subscriptions
    canceled, 0 failed payments, 0 undelivered events, 6 codes, 5 redemptions. One difference: the app also counts one
    untagged legacy subscription (`paused`) that `isHoaConnectObject` recognises by its keys, while a
    `metadata.app`-only filter skips it.
- **Session B done 2026-11-09, committed locally, NOT pushed.** A and B release together, on Peter's word.
  - **`ops_audit_log` was created on the hosted Directus** (Peter's yes). It has 0 role permissions, a unique
    `idempotency_key`, and SET NULL links to the community, account and user. `pnpm run create:ops-audit-log`
    re-checks it read-only. The trigger SQL is in go-live-checklist §3c, not installed. It already holds 11 permanent
    test-mode rows from B's localhost run, each with "TEST" in the reason.
  - **The action routes:**
    - `POST /api/ops/charges/:id/refund`.
    - `communities/:id/{cancel,resume,trial,comp,portal}`.
    - `POST /api/ops/codes` and `codes/:id/deactivate`.
  - **The shared path:** every action route goes through `beginOpsAction` then `runOpsAction` in
    `core/server/utils/ops-actions.ts`.
    - `beginOpsAction` checks the guard (`billing.write`), then the rate limit (20 per 10 minutes per user), then the
      body (`confirmed`, reason, `requestId`).
    - `runOpsAction` builds the Stripe key `ops:<action>:<target>:<requestId>`. It joins a submit that's already in
      flight, answers a submit already logged from the log, and writes the row through `writeOpsAuditEntry`
      (`ops-audit.ts`).
    - The rules (reason, typed amount above $500, 90-day trial cap) are in `core/shared/ops/actions.ts`.
    - **Session C:** `beginOpsAction` hard-codes `billing.write`. Give it a permission parameter before using it
      for `support` actions.
  - **What each action is allowed to do:**
    - Cancel, resume and refund touch Stripe only, and the webhook moves the org.
    - Trial and comp write `hoa_organizations` and refuse agency-billed communities.
    - Trial also moves a `trialing` Stripe subscription's `trial_end`, and refuses one that Stripe shows paying.
  - **Fixed from A:** the community page reads each Stripe call on its own. An object from the other mode says so
    (`billing.otherMode`), and the page then turns its actions off.
  - **UI:** `Ops/ActionDialog` (reason, then `useConfirm`) and `Ops/RefundDialog`.
  - **Checked in test mode on localhost, 2026-11-09:** each action was tried once on Testing HOA, pointed for the run
    at a test customer and subscription.
    - Read back from Stripe: two tagged refunds of $100 and $149 on the $249 charge, cancel at period end, resume,
      cancel now, a portal session, and OPSTESTB created and deactivated.
    - Trial, mark free and remove free were also tried. A trial while Stripe showed the subscription paying was
      refused, and no row was written for it.
    - Testing HOA was restored to its saved fields, with its live Stripe ids back. The test subscription is canceled;
      the test customer is left in test mode.
- **A canceled test org remains:** "Testing HOA", Boutique, 28 units, refunded and canceled. Delete it only with
  Peter's yes, after reading it.
- **A and B pushed 2026-11-10** (Peter's yes), live as build `3885984a`. The `/api/ops` routes answer 401 without a session.
- **Peter's calls on 2026-11-10:** finish the whole plan in one session. The order is D, then launch-followups Session 2
  (the notify email: `BILLING_NOTIFY_EMAIL`, default support@hoaconnect.info), then C, then re-banding (ask the five
  Session 3 questions first), then three extras: re-send welcome or receipt, change the billing contact, and Phase 5
  "view as".
- **Session D done 2026-11-10, committed locally, not pushed.**
  - `GET /api/ops/health` and `/ops/health` cover scheduled jobs, email, AI spend, storage, push and Stripe webhooks.
    Each section is read on its own, and counts only where people are involved.
  - **Job heartbeats:** each job upserts one `ops_job_heartbeats` row per real run (dry runs aren't recorded).
    - Vercel crons go through `cronJobHandler` in `core/server/utils/job-heartbeat.ts`. It authenticates first, so a
      stray request writes nothing.
    - `expire-stale` records cron runs only, so its board-member path is unchanged.
    - The GitHub workers use `runWithHeartbeat` from `scripts/lib/job-heartbeat.ts`.
    - The job list is `core/shared/ops/jobs.ts`.
  - **The heartbeat collection isn't created yet.** `pnpm run create:ops-job-heartbeats -- --apply` needs Peter's
    yes. Until it exists, the page shows each job's last sign of work instead, and says so.
- **launch-followups Session 2 done 2026-11-10, committed locally, not pushed.** Its own file is left uncommitted as
  instructed, so it still lists Session 2 as open.
  - `core/server/utils/platform-notify.ts`: `notifyPlatform()` emails `BILLING_NOTIFY_EMAIL`, or
    support@hoaconnect.info when that's unset. It honours `OUTBOUND_EMAIL_ONLY_TO` and never throws.
  - `notifySubscriptionActivated()` is called from both places a community becomes active: the subscription event
    and `invoice.paid`, since the first payment can arrive first. Each call comes after the Directus write and only
    on the move into active, so a replay or a renewal sends nothing. "Was" names a lapsed community's return.
  - Old trials: 0 open-ended trials on 2026-11-10. `add-property` can't create one, because its orgs have a null
    status and take it from their billing account. Closed.
  - **Not done:** a real email checked in an inbox. Only the tests prove the send.
- **Gates after Session E:** 151 files / 2,748 tests, 16 audits, lint 0 errors and 139 warnings, typecheck 0.
- **`ops_job_heartbeats` was created on the hosted Directus 2026-11-10** (Peter's yes), with 0 role permissions. Rows
  appear once a build with D is live.
- **Session C done 2026-11-10, committed locally, not pushed.**
  - **"Ask my community" reuses `hoa_requests`** (Peter's call, 2026-11-10: no second inbox). It's a new
    `question` type, with a workflow of asked, then answered, then closed.
    - `/[slug]/requests?ask=1` opens the form on it. The community inbox, the `inquiries` grant and the reminders
      already cover it.
    - No `handle_requests` grant was added.
  - **"Contact HOA Connect"** uses `support_requests` and `support_messages`, platform requests only.
    - The rules are in `core/shared/support/access.ts`. HOA Admins, board officers, billing account owners and
      billing_admins can raise anything. Property Managers need the new `contact_platform` grant, which is in the
      canonical list. Owners and tenants can only report app problems, and their HOA Admins are copied.
    - Who sees a request: the requester, every HOA Admin of that community, the billing account's admins, and staff
      (in the console only).
    - The asker's roles at that moment are stored on the request.
  - **Notifications:**
    - A new request or a requester's reply emails `notifyPlatform`.
    - A staff reply reaches the requester by bell and email (by email alone when the request has no community), and
      sets the request to "waiting".
    - Internal notes stay in the console.
  - **Automatic entries**, one per cause via a unique `auto_key`: a failed invoice (community or agency), a signup
    that expired as `incomplete_expired`, and a verified webhook event that threw.
  - **Pages:** `/support`, `/support/new`, `/support/[id]` (with `/[slug]/support/...` redirects for notification
    links), `/ops/support` and `/ops/support/[id]`. Nav has "Help & support".
  - **Schema:** `pnpm run create:support-schema -- --apply` was run on the hosted Directus with Peter's yes. It created
    both collections with 0 role permissions, the `question` choice, and "question" in the member policy's create
    rule. Re-running it read-only shows everything present.
  - **Checked on localhost:** one TEST request from Peter's account in 1033 Lenox, then a reply from the console, then
    closed. Its rows stay, marked TEST. "Ask my community" opens on a question.
  - **Not built:** attachments (the field exists, but there's no upload UI) and SendGrid Inbound Parse (optional in
    the plan).
- **Re-banding (launch-followups Session 3) done 2026-11-10, committed locally, not pushed.**
  - **Peter's answers:**
    - A higher band applies at the next renewal, with no proration.
    - A band never goes down automatically; it moves only on request.
    - The board's HOA Admins and HOA Connect are emailed first.
    - No onboarding fee is charged on moving up.
    - Crossing into Enterprise notifies HOA Connect and leaves Stripe alone.
  - **The rules** are `planReband()` in `core/shared/billing/reband.ts`. The work is in `core/server/utils/reband.ts`.
    - `changeBand()` swaps only the band item (identified by lookup key; add-ons are kept) with
      `proration_behavior: "none"`, and keeps the item's interval.
    - It updates `metadata.band_slug` and `metadata.units`, and the org's `subscription_plan`.
    - The idempotency key is `reband:<sub>:<band>`, so a second run changes nothing.
  - **The daily run:** `/api/billing/reband/run`, Vercel Cron at `30 9 * * *`, with a heartbeat (job `rebanding`) and
    `?dry=1`.
    - It covers communities that pay for themselves and are active or past due. Free, demo and agency-billed
      communities are skipped.
    - Automatic moves are logged in `ops_audit_log` with `actor_role` "system".
    - Enterprise opens one support entry (`enterprise:<org>`).
  - **Console:** `POST /api/ops/communities/:id/reband` ("Change band…" on the billing card), up or down, the same
    path.
  - **Stripe checked in test mode, 2026-11-10:** a Boutique subscription moved to Mid with no proration.
    - The period was unchanged, and the only invoice was still the original $249.
    - The upcoming invoice is $449 at renewal, with 0 proration lines.
    - The test subscription was canceled.
  - **Not done:** no run on a real renewal (or a test clock) with the Directus side together.
- **Plan §5 extras done 2026-11-10, committed locally, not pushed.** Each goes through `beginOpsAction` and
  `runOpsAction` and is audited.
  - **Re-send welcome** (`communities/:id/resend-welcome`): to one of the community's HOA Admins. App Admin only.
  - **Email a receipt** (`charges/:id/receipt`): sets the charge's `receipt_email`, so Stripe sends it (live mode only).
    Not for dues.
  - **Change billing contact** (`communities/:id/billing-contact`): the Stripe customer's email and name, with before
    and after recorded. The billing card shows "Invoices go to …".
  - **Phase 5 "view as"** (`communities/:id/view-as`), as a role preview (Peter's call):
    - It answers "what can a tenant, owner, board officer, HOA Admin or Property Manager (with chosen grants) reach",
      using `rolePreview()` in `core/shared/ops/view-as.ts`.
    - That reuses the app's capability matrix, poll access, ledger tiers and support doors, so it can't drift from
      what's enforced.
    - It needs `support`, so Platform Support can use it. Every preview leaves an `ops_audit_log` row.
    - Real people are counted, not named.
  - **Checked on localhost:** the buttons and the View-as dialog render. Nothing was submitted, because a preview
    writes a permanent audit row.
- **launch-followups.md:** Sessions 2 and 3 are marked DONE there (2026-11-10, Peter's yes; the file is still
  uncommitted on purpose). Sessions 4 and 5 are open.
- **Session E done 2026-11-10.** Everything below was checked in production unless it says otherwise.
  - **Bug found and fixed (pushed, build `d110917c`):** job heartbeats never saved. Directus answers an admin
    token's PATCH of a missing item with 204 (the SDK returns null), not an error, so `upsertHeartbeat` never
    reached its create: an "update" was logged every minute, with 0 rows. Both writers now create on an empty
    answer, and `ops-health.test.ts`'s fake answers a missing-row update the way Directus does. After the deploy, the
    `email-continue-sends` row appeared within 30 s and `/ops/health` shows "ran today · ok".
  - **Step 1:** the live build moved past `3885984a`. Peter confirmed that Vercel's Cron Jobs tab lists
    `/api/billing/reband/run` at `30 9 * * *`.
  - **Step 2, live dry run as App Admin:** checked 0, would move 0, 0 units updates, 0 Enterprise, 0 errors. No
    community pays for itself yet.
  - **Step 3, test mode with a test clock (Peter's yes):**
    - Testing HOA was pointed at a test customer and a Boutique subscription, and its declared units set 28 → 45.
    - Through localhost and the cron secret, the dry run said Boutique → Mid. The real run moved the item to
      `hoa_mid_monthly`, with the period unchanged and the only invoice still $249. It wrote `subscription_plan` =
      Mid and one `ops_audit_log` row (actor `system`).
    - The clock was advanced past Dec 10. The `subscription_cycle` invoice billed Mid $449 on one line, with no
      proration, and was paid.
    - Testing HOA was then restored (only `date_updated` differed), and the test subscription, customer and clock
      were deleted.
    - Side effect: the "rebanding" heartbeat row is from this localhost run until the 09:30 cron overwrites it.
  - **Peter's checks:**
    - The support@ inbox isn't set up yet, so neither the Session 2 notice nor the band-change email was checked.
    - The console's reply to the TEST support request reached Peter by email.
    - The bell wasn't checked, and push isn't set up (no VAPID keys).
    - **Nobody holds Platform Support,** by Peter's choice.
  - **Found here, fixed in Session H: every bell notification was also emailed by Directus itself.**
    - Peter got the reply twice: once from the app (notifications@hoaconnect.info) and once from Directus's own
      sender (contact@huestudios.company), with the same subject.
    - `notifyUsers()` writes `directus_notifications`, and Directus core emails each new notification to a user
      whose `email_notifications` is true. The app also uses that field as its own email master switch, so turning
      it off isn't a fix.
    - It applies app-wide, not only to support. It's a launch blocker in all but name; it needs its own session.
  - **Tidy-ups (each Peter's yes):**
    - Test customers `cus_VbHN5TUMyhDk2T` (Session B) and `cus_VbUzdniIccdeeS` (reband check) were deleted.
      `cus_VbAKi9cdOXyoGi` (Nov 9, another org) was left.
    - Testing HOA and its one membership row were deleted from Directus. Its 10 audit rows remain, with the org
      link blanked and the name kept. Its live Stripe objects were left alone.
  - **Types:** `pnpm generate:types` added `OpsAuditLog`, `OpsJobHeartbeat`, `SupportRequest` and `SupportMessage`.
    The `as any` casts on those collections are gone. The ones left in `support.ts` are other collections'
    nested-field reads.
  - **The new types tripped the export guards:** all four collections are now excluded from community exports
    as "The platform's" (Peter's call for the support pair), and `/your-data` lists them.
  - **Peter said yes to building support attachments and Inbound Parse.** They're written up as Sessions F and G
    below rather than built here, per the long-session rule.
- **Session H done 2026-11-10, committed locally, not pushed.** Directus no longer emails bell notifications.
  - Directus 11.13.4 has no setting for this. Its docs and `NotificationsService` source agree that it emails every new
    `directus_notifications` row when `email_notifications === true`. The only other off-switch is an `email.send`
    hook extension.
  - **Peter's choice:** the app's email switch moved to `_email` in `notification_preferences` (missing = on, no
    schema change), and `email_notifications` stays false for everyone. `DIRECTUS_EMAIL_OFF` is in
    `core/shared/notifications/preferences.ts`.
  - **Keeping it false:**
    - The three `createUser` routes spread `DIRECTUS_EMAIL_OFF`.
    - Every preferences PATCH writes it false, and `/api/directus/users/me` drops the field.
    - `notifyUsers` flips any bell recipient still at true, in one write, before writing their row. That covers
      Studio, invites and SSO.
  - **App-side readers moved to `_email`:** `notify.ts`, `transactional-email.ts`, the billing and digest workers.
    The preferences API's wire field is now `email_enabled`, used by the account page and
    `useNotificationPreferences`.
  - **Tests:** `tests/server/notify-directus-email.test.ts`. It includes a source scan that fails if a `createUser`
    lacks `DIRECTUS_EMAIL_OFF` or any server code writes `email_notifications: true`.
  - **Production (counts only):** 7 users, all at `email_notifications` true, none opted out, so there was nothing to
    copy. Per Peter, only his account was flipped this session. The backstop did it during the live check: the user
    update landed 0.2 s before the bell row.
  - **Live check passed:** one console reply to Peter's TEST request, sent from the local dev server, wrote one bell
    row. Peter got exactly one email, from notifications@hoaconnect.info, and nothing from Directus's sender.
  - **Left:**
    - After Peter pushes and the deploy lands, set `email_notifications` false for the other 6 users. Peter said yes on
      2026-11-10; count first and confirm. Until then the deployed old code still uses the field as the app's switch,
      and `notifyUsers` flips each user on their next bell anyway.
    - The data-export "ready" bell (`scripts/data-export-worker.ts`) was only ever emailed by Directus. It's now
      bell-only. Give it an app email if that matters.

## Files worth knowing (read only what your session needs)

| What | Where |
|---|---|
| Admin checks (server) | `core/server/utils/admin-auth.ts` (`checkAdminAccess`, `requireAdminAccess`) |
| Roles (client), gate | `core/app/composables/useRoles.ts`, `app/components/RoleGate.vue` |
| All the hats a user wears in an org | `core/server/utils/board-access.ts` (`resolveActors`, `getBoardPosition`) |
| Property Manager grants | `core/server/utils/manager-access.ts` (canonical grant list lives in the shared transition module it names) |
| Agency billing accounts | `core/server/utils/billing-account.ts` |
| Who is entitled | `core/shared/utils/entitlement.ts` (`isEntitledFrom`) |
| Bands and prices | `core/server/utils/subscription-band.ts`, `core/shared/billing/band-checkout.ts` |
| Stripe client, mode, webhook secrets | `core/server/utils/stripe.ts` (`getStripe`, `isStripeLiveMode`, `AcaciaInvoice`, `getStripeWebhookSecrets`) |
| App tag on Stripe objects | `core/shared/billing/stripe-app.ts` (`appMetadata`, `isHoaConnectObject`) |
| Discount codes | `core/server/utils/promotion-code.ts`, `core/shared/billing/promotion.ts` |
| Append-only audit pattern | `core/server/utils/audit-log.ts` (`writeAuditEntry`, `org_audit_log`) |
| Rate limiting | `core/server/utils/rate-limit.ts` (`rateLimit`, `clientIp`) |
| Webhook handler | `core/server/api/stripe/webhook.post.ts` (long: read by line range) |
| Test pattern: fake Stripe + MemoryDirectus | `tests/server/signup-band.test.ts`, `tests/server/support/memory-directus.ts` |
| Scheduled jobs | `vercel.json` (`crons`) |

## Session 0 — decisions (DONE 2026-11-09; kept for the record)

1. Read plan §2, §3 and §9 only.
2. Ask Peter the 8 decisions in two `AskUserQuestion` calls, recommendation first, each question standing on its own.
3. Write the answers into §9 as "Decided 2026-…: …". Adjust §3–§8 where an answer changes them (e.g. no Platform
   Support role means dropping `requireOpsPermission`).
4. Commit locally (docs only) and stop. Ask whether to push the plan.

## Session A — read-only console (Opus 5.5) — DONE 2026-11-09 (see "Where things stand")

Build Phase 1 exactly as decided. No Stripe writes. The one Directus write, creating the Platform Support role, needs Peter's yes.
Phases 1 and 2 release together: do not push after A.

1. **Guards** in `admin-auth.ts`, with tests:
   - `requireAppAdmin(event)`: an HOA Admin, a Property Manager, a member, a billing_admin and Platform Support each get 403
     before anything else runs.
   - `requireOpsPermission(event, "billing.read" | "billing.write" | "support")`: App Admin passes all three; Platform Support
     passes `billing.read` and `support`; everyone else gets 403.
   - Add `directusRolePlatformSupport` to runtime config, plus a `scripts/` script to create the role with no collection access
     (running it on the hosted Directus needs Peter's yes).
   - Align `useRoles().isAppAdmin` with the server's id-only check, and add `isPlatformSupport`.
2. **`/api/ops/*` read routes**, each behind `requireOpsPermission(event, "billing.read")`
   - Routes: overview, communities (paginated, filterable), community detail (people, billing, activity), billing
     accounts, payments feed.
   - Stripe reads are filtered by `metadata.app`, paginated, and cached for 60 s on the server.
3. **Pages under `app/pages/ops/`:** behind `RoleGate` (App Admin or Platform Support), mobile-first, built from the existing UI kit. Residents appear as
   counts only (plan §3).
4. **Tests:** fake Stripe plus MemoryDirectus, covering MRR maths, status buckets and the people roles shown.
5. **Verify:** in test mode on localhost. Compare the overview numbers with a scratchpad Stripe read, showing both side
   by side, and say where they differ.

Gates green. Commit and stop.

## Session B — actions (Opus 5.5) — DONE 2026-11-09 (see "Where things stand")

Every action route uses `requireOpsPermission(event, "billing.write")`. Refunds need a reason; above $500 the request must also
carry the typed amount, checked on the server. Platform Support is refused every action before Stripe is called (test it).
After B, ask Peter whether to push A+B together.

1. `ops_audit_log`, append-only, written only through `writeOpsAuditEntry()`. The migration script goes in `scripts/` and
   grants no role access; running it on the hosted Directus needs Peter's yes.
2. Each Phase 2 action is a POST route with a reason, a confirmation, a Stripe idempotency key, a rate limit and an
   audit row:
   - refund (full or partial, with the decided guard)
   - cancel now or at period end, and resume
   - extend a trial, or mark a community free
   - create or deactivate a discount code
   - open a portal session
3. Tests per action:
   - A non-admin is refused before Stripe is called.
   - The audit row is written.
   - A double submit refunds once.
4. Run every action in Stripe test mode on localhost. Live use is Peter's.

Gates green. Commit and stop.

**Before starting:** check that launch-followups Sessions 2 and 4 aren't running (`git log`, and ask Peter if unsure). All three
touch Stripe billing paths. Re-banding ("move to another band") is NOT in B: it waits for launch-followups Session 3. Re-sending
email and changing the billing contact (plan §5) aren't in B either.

**What Session A left for B (read these, not the whole tree):**
- **Guard:** `requireOpsPermission(event, "billing.write")` is in `core/server/utils/admin-auth.ts` and returns
  `{ userId, role }` (the audit actor). On the client, hide action buttons with `useRoles().canOps("billing.write")`.
- **Tests:** extend `tests/server/ops-console.test.ts`. It already has a fake Stripe (`h.stripe`), a MemoryDirectus seed, an
  `OUTSIDERS` list and `stripeCalls()`. For actions, add Platform Support to the refused list and assert `stripeCalls() === 0`.
  For the double submit, the fake should key on `idempotencyKey` the way Stripe does.
- **Cache:** `opsCached` in `core/server/utils/ops-data.ts` keeps Stripe reads for 60 s, so an action must drop the keys it
  changes (add an exported invalidator; `_resetOpsCache` is for tests only). Otherwise the page shows the old state after a
  refund.
- **UI:** actions go on the existing pages. Refund goes on a charge in `app/pages/ops/communities/[id].vue` (billing card) and
  on `payments.vue`. Cancel, resume and the portal go on that billing card; trial and comp go on the status line; codes go on
  the overview's Discount codes card. Confirm with `useConfirm()` (the native-dialogs audit refuses `window.confirm`).
- **Patterns:** the audit writer follows `core/server/utils/audit-log.ts` (no update or delete function exists, on purpose).
  The migration follows the `org_audit_log` part of `scripts/create-transition-collections.ts`. Rate limiting is
  `rateLimit(key, max, windowMs)` plus `clientIp(event)` from `rate-limit.ts`. The portal is
  `core/server/api/stripe/portal.post.ts`. Codes are `promotion-code.ts`, and new ones are tagged with `appMetadata()`.
- **Fix from A (verified 2026-11-09):** on localhost (test key, production Directus), 2 of 8 community pages show the generic
  "Stripe couldn't be read" error. Their customer and subscription ids are live-mode objects (`resource_missing`, "a similar
  object exists in live mode"). In `core/server/api/ops/communities/[id].get.ts`, read each Stripe call on its own, so one
  failure doesn't blank the billing card. Say "this is a live-mode object; the server is in test mode" when that's the cause,
  and disable actions on it.

**Testing on localhost, carefully:**
- Directus there is PRODUCTION. Extend-trial and mark-free write `hoa_organizations`, and every action writes an
  `ops_audit_log` row that can never be deleted. Ask Peter before the first action that writes to Directus. Use only the
  "Testing HOA" org, put "TEST" in every reason, and put the org back afterwards.
- Stripe test objects for refund, cancel and resume: create them in test mode (a test customer plus a subscription on a test
  price, tagged `app = hoaconnect`), and delete them or cancel them afterwards.
- The webhook doesn't reach localhost unless you follow launch-followups' "A test-mode run" recipe; the Stripe CLI is paired
  to a different account. Prove the Stripe side by reading the objects back, not by the org's status changing.

## Session C — support (Opus 5.5) — DONE 2026-11-10 (see "Where things stand")

Build Phase 3 as decided: the two doors by role, `support_requests` and `support_messages`, the community inbox, the
platform inbox in `/ops` (gated by `requireOpsPermission(event, "support")`, so Platform Support can work it), replies by email, and the new Property Manager grants (`contact_platform`, `handle_requests`).
Add the grants to the canonical list.

- **Before starting:** needs launch-followups Session 2's notification email. If it isn't done, say so and stop.
- **Tests:** who sees which request (resident, owner versus tenant, board officer, HOA Admin, Property Manager with and
  without grants, App Admin); the role snapshot on each request; email on reply.
- **Browser check:** with a demo session, one request through each door.

Gates green. Commit and stop.

## Session D — system health (Sonnet 5.5) — DONE 2026-11-10 (see "Where things stand")

Build Phase 4 from existing collections and `vercel.json` crons, behind `requireOpsPermission(event, "billing.read")`. The
Platform Support role and guard already exist from Session A.

Gates green. Commit and stop.

## Session E — verify live, prove re-banding end to end, and tidy up (Sonnet 5.5) — DONE 2026-11-10 (see "Where things stand")

Everything in the plan is built and pushed (C, D, the extras, and launch-followups Sessions 2 and 3: see "Where
things stand"). This session proves it in production and tidies up. It builds nothing new unless Peter says so in
step 5. Read only "Where things stand" and this section, plus the files a step names.

1. **The deploy** (skip what "Where things stand" already records as checked).
   - The live build id differs from `3885984a`.
   - `pnpm run create:ops-job-heartbeats` (read-only) lists rows, and `email-continue-sends` is among them.
   - `/ops/health` says "ran …" for the email queue.
   - Peter confirms the Vercel Cron Jobs tab shows `/api/billing/reband/run` at `30 9 * * *`.
2. **Re-banding, read-only on live data.** As App Admin, run `GET /api/billing/reband/run?dry=1` in the browser.
   Report the counts: checked, what would move, units updates and Enterprise. Write nothing.
3. **Re-banding end to end, in test mode** (needs Peter's yes first, because it writes `hoa_organizations` on the
   production Directus).
   - Point "Testing HOA" at a test customer and a Boutique subscription, using launch-followups' "A test-mode run"
     recipe. Use a Stripe test clock so the renewal can be advanced.
   - Give it units past Boutique, then run the reband job with `?dry=1` and then for real.
   - Advance the clock past renewal. Prove from Stripe that the renewal invoice bills Mid with no proration line, and
     from Directus that `subscription_plan` is Mid.
   - Restore Testing HOA's saved fields, then cancel and delete the test objects.
4. **Peter's checks** (ask, don't assume):
   - Did "TEST: platform notice from Session 2" reach support@hoaconnect.info?
   - Did the bell and email for the TEST support request's reply reach him?
   - Who should get the Platform Support role? Nobody holds it yet.
5. **Ask Peter which of these to build.** Each is a separate yes:
   - Support attachments: `support_messages.attachments` exists, but there's no upload UI.
   - SendGrid Inbound Parse, so emailed replies land in a request's thread (optional in the plan).
   - `pnpm generate:types`, then drop the `as any` casts on `ops_audit_log`, `ops_job_heartbeats` and `support_*`.
6. **Tidy-ups that need Peter's yes, one by one:**
   - Delete the test-mode Stripe customers from Session B and the reband check (test mode; read each one first).
   - Delete the canceled "Testing HOA" org (read it first; abort unless it matches).
   - Whether to mark launch-followups Sessions 2 and 3 done in that file, which is uncommitted on purpose.
7. **Not this session's:** the append-only triggers in go-live-checklist §3c (droplet SSH, Peter), and
   launch-followups Sessions 4 and 5.

Gates green if code changed. Commit, record what was checked in "Where things stand", and stop.

## Session F — support attachments (Opus 5.5)

Peter said yes on 2026-11-10. `support_messages.attachments` (JSON) exists and nothing writes it. Read "Where
things stand" (Session C), then `core/server/utils/support.ts` (`addSupportMessage`, `createSupportRequest`,
`supportViewerFor`), `core/shared/support/access.ts` (`supportAccess`), and the routes under
`core/server/api/support/` and `core/server/api/ops/support/`.

1. **Ask Peter first, in one batch:** the size and count limits (recommend 10 MB each and 5 per message), the types
   (recommend images, PDF and plain text), whether residents may attach (recommend yes), and whether internal
   notes may (recommend yes, staff only).
2. **Storage stays private.** Don't reuse `/api/directus/files/upload`: it uses the member's own Directus
   permissions. Upload with the admin token, into a "Support attachments" folder. The folder is made by a script
   that is read-only by default, and `--apply` needs Peter's yes. Record the uploader so a message can only attach
   that person's own fresh, unattached files.
3. **Downloads go through a route** that serves a file only if it sits on a message the viewer may see. Internal
   notes' files are staff only. Never use a public asset URL.
4. **UI:** a file picker on `/support/new` and on both reply boxes (`/support/[id]`, `/ops/support/[id]`), and
   links on each message. Emails say "1 attachment" and link to the request; they don't attach the file.
5. **Tests:** who can download what (requester, HOA Admin, staff, an outsider, an internal note), the limits, and
   reusing someone else's file id.
6. **Browser check on localhost:** one TEST request with an image, and a staff reply with a PDF.

Gates green. Commit and stop.

## Session G — SendGrid Inbound Parse: emailed replies land in the thread (Opus 5.5)

Peter said yes on 2026-11-10 (it was optional in the plan). Do Session F first: both change the same support files.

1. **Ask Peter first:**
   - The reply domain. Recommend `reply.hoaconnect.info`, with its MX at `mx.sendgrid.net`. Peter adds the DNS
     record and the SendGrid Inbound Parse setting; the agent doesn't.
   - Whether a resident's emailed reply is accepted. Recommend: only from the address on their account.
2. **Outbound:** every support email to a person (`notifyRequester`, and the HOA Admin copies) sets `Reply-To` to
   `support+<requestId>.<signature>@<reply domain>`. The signature is an HMAC of the request id and the
   recipient's user id, keyed by a new `SUPPORT_REPLY_SECRET`.
3. **Inbound:** a `POST /api/support/inbound/<token>` route reads SendGrid's multipart post, with the path token
   from env, because Inbound Parse doesn't sign requests.
   - It checks the HMAC and that the sender matches that user, strips the quoted history, and calls
     `addSupportMessage`, so the notifications and status changes are the same as a reply in the app.
   - It answers 200 to anything it rejects, so SendGrid doesn't retry, and logs a count.
   - Session F's limits apply to attachments.
4. **Tests:** a good reply, a bad HMAC, the wrong sender, a closed request reopening (as an in-app reply does),
   quote stripping, and a duplicate post (SendGrid retries).
5. **Live check (Peter):** after DNS, he replies to a TEST request's email and the reply appears in the thread.

Gates green. Commit and stop.

## Session H — stop Directus emailing every bell notification (Opus 5.5) — DONE 2026-11-10 (see "Where things stand")

Found in Session E. `notifyUsers()` (`core/server/utils/notify.ts`) writes `directus_notifications`. Directus core
then emails each one, from its own sender, to any user whose `email_notifications` is true. The app also emails the
user, so people get two emails per notification. The app reuses `email_notifications` as its own master switch
(§ the "Channel independence" note in `notify.ts`).

- **Decide with Peter:** move the app's email master switch to a field of its own (for example in
  `notification_preferences`), then set `email_notifications` false for every user, with Peter's yes. Or find a
  Directus-side switch, if this Directus version has one (check its docs; don't guess).
- **The migration is a production Directus write.** Count first, then apply with Peter's yes. New users must
  default to false: check where users are created.
- **Tests:** the app's email preference still controls the app's email, and no path re-enables Directus's.
- **Live check:** one bell notification to Peter's account, and exactly one email arrives.

Gates green. Commit and stop.
