Continue HOA Connect: finish what stands between band-priced signup and selling it. Start a session with
"Read docs/prompts/launch-followups.md and do Session N." Do that session only, commit locally, report, and stop.

Suggested models are on each session. Session 1 comes first: signup is live and it decides whether a real customer
would be activated.

Token discipline, for every session: no Explore agents; read only the files named here and what grep points to; never
open docs/plan-earnest-parity-round2.md; summaries ≤8 lines; gates in the background, tail only; prove backend work with
tests or Stripe output, not screenshots. Work on main. It auto-deploys, so NOTHING is pushed unless Peter says so in
that session.

## Rules that hold everywhere

- `.env` holds LIVE Stripe keys and points at the production-domain Directus (admin.hoaconnect.info). Never print a value.
- Live Stripe is read-only for the agent. Any live write needs Peter's yes for that action. The agent never makes a live charge.
- Any `.env` Directus write needs a yes first. Print counts and statuses, not names or emails.
- Account details, passwords and card numbers in a flow that reaches the hosted Directus are entered by Peter, not the agent.
  Prepare everything, ask Peter to do that step, then verify from Directus and Stripe.
- Before deleting anything, read it and check it is what you expect. Abort unless the match is exact.
- Run the Stripe prices script only with `STRIPE_EXPECT_ACCOUNT=acct_1Fv2XpA7IKygGtBC`.
- Tick a docs/gtm-checklist.md row only when its "Verified when" column is actually met. If a part wasn't checked, say so on the row.

## Where things stand (2026-11-12)

- **Git:** `origin/main` is at 111e77d (fetched 2026-11-12), so 80184f9 (existing-email signup fix) is pushed, as is everything
  from Sessions 2–4 and the gate on the email detail and list routes. Only f8601c3 (this file) was local when Session 5 began.
  The `.claude/launch.json` dev-port fix is committed (87ca1da). Deployed: production's public config reports the app
  version as `2.1.111e77d` (2026-11-12).
- **Sessions 1–4 are done.**
  - **Session 1** (87ca1da, 70c2e68, 2026-11-09): the live Stripe checks. Prices, webhook endpoint, portal and a live $2 signup
    that was refunded are recorded on the gtm §3 rows.
  - **Session 2:** the "someone subscribed" email, and no old trials without an end date.
  - **Session 3:** automatic re-banding, proven on a Stripe test clock.
  - **Session 4** (2026-11-12): the app's own text dialog in place of the four `prompt()`s, multi-charge refunds, `.prettierrc`,
    "Resend to these N unknown" as a draft, and the member invitation as the app's own MJML email.
  - **Still Peter's from Session 4:** the gtm §3 "Refund round trip" row.
- Node: `eval "$(/opt/homebrew/bin/brew shellenv zsh)"; eval "$(fnm env --shell zsh)"; fnm use 22.22.1`. The pre-commit hook needs this too.
- Gates last recorded at 80184f9: 144 files / 2,510 tests, 16 audits, lint 0 errors and 139 warnings (limit 148), typecheck 0
  (`NODE_OPTIONS=--max-old-space-size=6144`). Not re-recorded since; Session 5 changes docs only and did not re-run them.
- Dev server on this Mac: plain `pnpm dev` answers HTTP 426 because Vite's HMR socket lands on port 3000.
  `NUXT_PORT=3000 PORT=24678 pnpm dev` works.
- Stripe: the app runs on Hue's `acct_1Fv2XpA7IKygGtBC`. On 2026-11-09 the CLI was paired with a different account also named
  "hue" (`acct_1TvM9jPOPxSJoMmo`), so its webhooks didn't reach the app; not re-checked since. `gh` is not installed.
- `declared_units` exists on admin.hoaconnect.info. New signups get a 14-day `trial_ends_at`.
- Test-mode signup passed through `/setup` (Mid monthly, $2,949, `trial → active` by webhook). That org is deleted and its subscription canceled.
- Directus snapshot, 2026-11-12: 7 orgs: 2 demos (`trial`), the transition fixture (`expired`) and 4 free communities (2 `trial`,
  2 with no status). None is `active`. Live Stripe has one HOA Connect subscription, the $2 test, `canceled`. No paying customers yet.

### A test-mode run, when a session needs one

1. Listener on the app's account: `npx dotenv -- sh -c 'STRIPE_API_KEY="$STRIPE_SECRET_KEY_TEST" stripe listen --print-secret'` into a
   private scratchpad file, then the same with `--forward-to http://localhost:3000/api/stripe/webhook --events ...`.
2. Temporarily add `STRIPE_MODE=test STRIPE_WEBHOOK_SECRET_TEST="$(cat <file>)"` to the launch command. Capture the secret BEFORE starting the server.
3. Prove it with a correctly signed no-op POST (200) and a wrongly signed one (400) before asking Peter to do anything.
4. Afterwards remove the env additions and the secret file, ask before deleting the test org, and cancel its test subscription.

## Where each item went

| Item | Session |
|---|---|
| Deploy finished; `/setup` shows the unit-count step | 1 |
| Live prices exist under their lookup keys | 1 |
| Live webhook endpoint receives the right events | 1 |
| Manage billing portal | 1 |
| Stored price ids on `subscription_plans` | 1 |
| `.claude/launch.json`; Stripe CLI account | 1 |
| Notify Peter when a subscription is created | 2 |
| Old trials with no end date | 2 (confirm only: none are paying orgs) |
| Automatic re-banding | 3 |
| Four `prompt()`s, multi-charge refunds, prettier | 4 |
| "Resend unknown", copy overrides | 4 |
| The rest of docs/gtm-checklist.md | 5 |

Order: 1 → 2 → 3 → 4. Sessions 2 and 4 both edit `core/server/api/stripe/webhook.post.ts`, so never run them together.
Session 5 is mostly dashboards and can overlap any of them if it doesn't commit code at the same time.

## Session 1 — is the live site safe to sell on? (Opus 5.5)

Mostly read-only. If step 4 fails, a real customer gets charged and their org stays in `trial`, then loses access after 14 days. Say so plainly.

1. Ask Peter to push 80184f9. Commit `.claude/launch.json` with it if he agrees.
2. Deploy: Peter confirms in Vercel, or `brew install gh` and he runs `gh auth login`. Take the host from `NUXT_PUBLIC_APP_URL`, don't guess it.
   Open `/setup` on production in the built-in browser, go through to the unit-count step and confirm the quote for 45 units.
   Never press "Continue to Payment" on production.
3. Live prices: with the live key, `prices.list` by lookup key for boutique, mid, larger and grand (`hoa_<slug>_monthly|annual|onboarding`).
   Expect 12 active prices whose amounts match `subscription_plans`. Enterprise is contact-only and has none.
4. Live webhook (gtm §3, 🔒): `GET /v1/webhook_endpoints` with the live key. Expect one enabled endpoint at `https://<app host>/api/stripe/webhook`
   subscribing at least to every event in the gtm §3 row. An unsigned POST to production should answer 400, which proves the route is up.
   If it's missing or incomplete, stop and give Peter the exact URL and event list. He creates it and puts the secret in Vercel.
   Verified when a test event shows 200 in the endpoint's log. Check the test-mode endpoint the same way.
5. Vercel (gtm §3): Peter confirms both key pairs are set and `STRIPE_MODE` on Production is absent or `live`. Confirm production pages carry `pk_live_`.
6. Portal: `GET /v1/billing_portal/configurations` in both modes (Stripe refuses to open a portal without a saved one). Then a test-mode run: Peter signs up on
   localhost and clicks Manage billing. Verified when the portal opens. Clean up as above and finish the gtm §3 "real subscription" row.
7. With Peter's yes: `STRIPE_EXPECT_ACCOUNT=acct_1Fv2XpA7IKygGtBC pnpm stripe:subscription-prices --mode=live` to restore the live ids in `subscription_plans`.
   Amounts are unchanged, so no Stripe price should change. Verify that from the script's output.
8. Peter re-runs `stripe login` and picks Hue's account. Check `stripe config --list` shows `acct_1Fv2XpA7IKygGtBC`.
9. Decision for Peter: prove the live path with one real signup on the smallest band ($1,749) that he then refunds, or treat the first customer as the proof and watch
   the endpoint's log. Recommended: the real signup, since nothing else exercises a live charge. Peter does it, never the agent.

Report what passed, what didn't, and anything that must happen before the first customer.

## Session 2 — tell Peter when someone subscribes (Sonnet 5.5) — DONE 2026-11-10

Built as `notifyPlatform()` / `notifySubscriptionActivated()`; the record is in docs/prompts/operator-console.md
("Where things stand"). Old trials: 0, closed. Not checked: the email in the support@ inbox (not set up yet).

Decide first: which inbox and which channel. Recommended: email through SendGrid to a new `BILLING_NOTIFY_EMAIL`, defaulting to support@hoaconnect.info.

1. In `handleSubscriptionEvent` (webhook.post.ts, the `org && orgStatus` branch), send one email when the org moves from not-`active` to `active`: community, band, units, interval.
   The band and units are in `subscription.metadata`. Read the org's previous status first; it needs adding to that query.
2. Send after the Directus update. A send failure is logged and never fails the webhook, or Stripe will retry the event.
3. Tests in tests/server/stripe-webhook.test.ts: first activation sends once; a replay sends nothing; a renewal sends nothing; a send failure still returns 200.
4. Test-mode run, then confirm the email arrives. If it doesn't, check `OUTBOUND_EMAIL_ONLY_TO`.
5. Old trials: re-run the count of `trial` orgs with no `trial_ends_at` that are neither free nor demo. It was 0 on 2026-11-09. If it's still 0, record that and close the item.
   Also read `core/server/api/billing-account/add-property.post.ts` to confirm it can't create a new open-ended trial. If the count isn't 0, ask Peter what date to give them.

Gates green. Commit and stop.

## Session 3 — automatic re-banding (Opus 5.5) — DONE 2026-11-10

Built and proven end to end on a Stripe test clock (operator-console Session E): the renewal billed Mid with no
proration line, and Directus moved to Mid. The record is in docs/prompts/operator-console.md ("Where things stand").

Design first. Write the proposal, get Peter's answers, and only then build, as a separate approval.

Questions for Peter, with the recommendation first:
- When does a higher band take effect? At the next renewal with no proration, or immediately with proration.
- Does a band ever go down automatically? Never, or when the board asks.
- Is the board told first? Email the board and Peter before the change, or change silently.
- Is onboarding charged again on moving up? No, or the difference.
- What about crossing into contact-only (Enterprise)? Notify Peter and leave Stripe alone, or block new units.

Build notes:
- Prefer one scheduled job over active, subscribed orgs to hooks on each write. Units are written from `hoa/units/create.post.ts` and others, and can be edited directly in Directus. Add it where the existing scheduled jobs live (docs/go-live-checklist.md).
- Reuse `resolveBandForOrg` and `resolveBandPrices`. Update only the band's subscription item, because add-ons share the subscription (`reconcileActiveAddons`).
- Keep `subscription.metadata.band_slug` and `units` current. Make it idempotent: a second run changes nothing. Skip free, demo and agency-billed orgs.
- Tests with a fake Stripe and MemoryDirectus, then a test-mode run with a real renewal or a test clock.

Gates green. Commit and stop.

## Session 4 — Round 3 code leftovers (Sonnet 5.5) — DONE 2026-11-12 (items 1–4; item 4 after Peter's decisions)

Done on local `main`, not pushed:
- **1 (`e9e5696`):** `useConfirm().prompt({ … })` is the app's dialog with a text field, and the four callers use it. Cancel now stops the report and the rejection (the native prompt let both go ahead). `audit:native-dialogs` is a gate at 0. Browser: the dialog was driven directly on the dev server as Oscar: focus in the field, Enter or ⌘+Enter to accept, the trimmed text back, Cancel/Esc gives null, a required field stays open when blank. The four buttons themselves weren't clicked: Lenox has no projects, pending requests or channels for Oscar, and `/api/demo/login` would have replaced Peter's sign-in in the pane. Once, typing missed the field right after one dialog followed another; three retries didn't reproduce it.
- **2 (`583920b`):** a refund unwinds across every charge in `charge_ids`, newest due first. Tests cover a partial and a full refund across two charges, replays, and a refund reaching into the older charge. Peter still owes the gtm §3 "Refund round trip".
- **3 (`c38524e`):** `.prettierrc` fitted to the code as written (140 columns, double quotes, semicolons, es5 commas; measured on 174 files), plus `.prettierignore`. Nothing reformatted, and lint-staged still doesn't run Prettier (the comment there says why).
- **4, built after Peter's decisions (same day):**
  - **"Resend to these N unknown" (`76f8a6f`), as a draft:** the detail page lists members still unknown an hour after their attempt, with "Resend to N". After a confirm that warns some may get it twice, it makes a NEW draft of the same email for just those members (no cc/bcc) and opens it in the composer; the admin sends it. Fixed with it: the composer reopened every saved draft as "All Members" because it never read the saved audience back. Not seen in the browser: Lenox has no unknown rows and no drafts, and Oscar's sign-in in the pane had lapsed by then.
  - **Wording overrides:** dues and meeting reminders already had them (Settings → Reminders: subject and first sentence per rule). For the invitation, Peter chose "our own mjml generated email that I can edit in the repo" (`0669446`): `core/server/emails/invitation.mjml` in the shared layout, the community's branding, sent by `sendOrganizationEmail`. It's previewable in Settings → Branding and was checked in the browser through the preview route. The welcome and accepted emails still use the SendGrid-hosted template.

1. Native prompts (gtm §8): give `core/app/composables/useConfirm.ts` a text-input mode. Replace the four in `app/components/projects/ProjectGantt.vue` (2),
   `app/components/channels/ChannelMessage.vue` and `app/pages/[slug]/admin/approvals/index.vue`. Lower the `audit:native-dialogs` ratchet to 0. Check each in the browser with a demo session.
2. Multi-charge refunds (gtm §8): `handleChargeRefunded` reverses against the first linked charge only. Unwind across `metadata.charge_ids`, newest first, the reverse of how payments are credited. Tests for a partial and a full refund across two charges, plus a replay. Then Peter does the gtm §3 "Refund round trip".
3. Prettier: add a `.prettierrc` matching the current style. Do NOT reformat the repo; a repo-wide diff would bury history. It's already a dev dependency.
4. "Resend unknown" (Q4) and per-org copy overrides: read docs/plan-earnest-parity-round3-gtm.md around lines 1391 and 2923. The plan called overrides "only if cheap". If either needs more than this session has, propose it and stop rather than starting.

Gates green, `pnpm build` too. Commit each of 1–4 separately and stop.

## Session 5 — the rest of the GTM checklist (Sonnet 5.5, Peter-led) — agent checks DONE 2026-11-12; Peter's list is open

Blockers first. The agent checks what it can, hands Peter a short list, and ticks only what is verified. docs/plan-marketing-split.md is its own project and isn't part of this.

**Done, read-only (no Directus, Stripe or Vercel write; nothing pushed):** ticked §1 schema scripts and §1 tag `v2.1`; reopened §2 support inbox
(`hoaconnect.info` has no MX); the other rows carry what was and wasn't checked. Scratch scripts were run from the scratchpad with `.env`; no value was printed.

**Peter's list, in order:**
1. SendGrid: turn on Signed Event Webhook, set `SENDGRID_WEBHOOK_PUBLIC_KEY` in Vercel, redeploy. The agent then re-probes for 403. Open and 🔒: production accepts unsigned posts today.
2. Vercel Production env, one pass: `OUTBOUND_EMAIL_ONLY_TO` absent; `STRIPE_MODE` absent or `live`; both Stripe key pairs; `NUXT_VAPID_PRIVATE_KEY`; `VOYAGE_API_KEY`; the same Anthropic key; add the two `STRIPE_PRICE_ADDON_STORAGE_100_*` vars after making the price.
3. Stripe Connect: docs/connect-activation-runbook.md §3–§6, including the second "Connected accounts" endpoint. Nothing exists yet in either mode.
4. An MX record for `hoaconnect.info`, so `support@` receives mail (and the "someone subscribed" email reaches Peter).
5. On production, signed in: "Ask the HOA" on `/transition-test` answers (Anthropic, Voyage `ledgerMode: "vector"`), and Profile → Notifications can subscribe (VAPID).
6. Then yes to delete the fixture, and the choices: which status tool, the privacy-policy link, the refund round trip, the device rows and DM test, Inbound Parse DNS, reminders per pilot.

Needs code, not a dashboard: the demo re-seed (the seed has none of the Round 3 features and the nightly purge deletes demo emails).

| Row | Who | How the agent helps |
|---|---|---|
| 🔒 §1 Schema scripts before their deploy | Agent, with a yes | Read `/fields` to see which already ran; run the rest in the listed order; check `/api/reminders/run?dry=1` |
| 🔒 §3 Connect activated | Peter | Walk docs/connect-activation-runbook.md §3–§6; read back the endpoint's events |
| 🔒 §4 SendGrid signatures | Peter, then agent | Unsigned POST of an empty array expects 403 |
| 🔒 §4 `OUTBOUND_EMAIL_ONLY_TO` unset | Peter | It silently drops mail in production, which would also hide Session 2's email |
| 🔒 §5 VAPID in production | Peter | docs/go-live-checklist.md §5 has the commands |
| 🔒 §6 Anthropic funded | Peter | Confirm "Ask the HOA" answers |
| §1 Tag v2.1 | Peter's yes | Push the tag |
| §2 Status page | Peter picks the tool | Name the two URLs to monitor |
| §3 What payers see; Extra Storage price | Peter | Statement line and onboarding screen; docs/go-live-checklist.md §1 |
| §4 Send queue real send; privacy policy link | Peter | Give the link text; compare counts with SendGrid |
| §5 Device rows; DM between two logins | Peter | docs/push-verification.md |
| §6 Voyage funded | Peter | Check `retrieval.ledgerMode` is `vector` |
| §7 Delete fixture; re-seed demos; reminders per pilot | Agent, with a yes, for the first two | Read before deleting; seed scripts; Peter turns reminders on per community |

Finish with what remains open and whether anything still blocks selling.
