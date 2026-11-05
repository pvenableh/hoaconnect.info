# GTM checklist — what stands between HOA Connect and selling it

_Phase 9 of Earnest Parity Round 3 (2026-11-05). Replaces the **finished** sections of
[`go-live-checklist.md`](go-live-checklist.md); that file stays the deep-dive for storage,
scheduled jobs, the append-only ledger and VAPID. Each line here is one decision or one
action, with the place it is done and how to know it worked. Tick it when it is **verified**,
not when it is configured._

Legend: **[ ]** open · **[x]** done and verified · 🔒 launch blocker · 👤 Peter (needs a
dashboard, a password, or a device).

## 1. Ship the code that exists

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 🔒👤 | **Push local `main`** — Rounds 3 Phases 2–9 are local commits. CI runs `pnpm lint` and `pnpm audit:all` for the first time on that push. | `git push` | GitHub Actions green on the push |
| [ ] 🔒👤 | **Schema scripts, in this order, BEFORE the deploy that needs them** (each is idempotent; each route degrades safely until it runs): `pnpm add:email-send-queue` (re-run for Phase 4 fields) → `pnpm create:reminder-log` → `pnpm add:channel-phase7` → `pnpm generate:types` | local, against prod Directus | each script prints "ok"; `/api/reminders/run?dry=1` says `provisioned: true` |
| [ ] 👤 | **Tag the release line** — `package.json` is `2.1.0` and the 2.1 "What's new" note is written; push the tag | `git push origin v2.1` | GitHub Release `v2.1` exists; Account → About shows `2.1.x` |

## 2. Domains and the marketing split

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 👤 | **Marketing split to `app.hoaconnect.info`** — separate work, planned in [`plan-marketing-split.md`](plan-marketing-split.md). Not a launch blocker: custom domains resolve by `Host`, independent of it. | Vercel + DNS | apex serves marketing, `app.` serves the app, a custom-domain org still loads |
| [x] | **One support inbox: `support@hoaconnect.info`** (decided 2026-11-05). Every reference in `app/` and `core/` now uses it. | `grep -rn "support@" app core` | a test mail to it arrives |
| [ ] | **Status page** — none exists. Smallest useful: an uptime monitor on the app's home page and Directus's `/server/health`, with a public page. (The app has no health route of its own.) | e.g. Better Stack / UptimeRobot | page linked from the footer and the support auto-reply |

## 3. Money

| | Item | Where | Verified when |
|---|---|---|---|
| [x] | **The Stripe account is Hue's** (decided 2026-11-05): Hue is the business, HOA Connect a product of it. The live key in `.env` is already Hue's (`acct_1Fv2…`). Because the account is shared, everything HOA Connect creates is tagged `metadata.app = "hoaconnect"`, customers are looked up only among tagged ones, and the webhook ignores PaymentIntents that aren't ours (`core/shared/billing/stripe-app.ts`). | code | `tests/shared/billing-phase9.test.ts`, `stripe-webhook.test.ts` |
| [~] 👤 | **Hue's TEST secret key in `.env`** — done locally (the script ran in test mode 2026-11-05); **still to do: both key pairs in Vercel.** The old `STRIPE_SECRET_KEY_TEST` is expired, which is why `pnpm stripe:subscription-prices` failed. Also `STRIPE_PUBLIC_KEY_TEST`, and both pairs in Vercel. Optional `STRIPE_EXPECT_ACCOUNT=acct_…` makes the script refuse any other account. | Hue's Stripe → Developers → API keys | the script's first line reads `Stripe account: Hue (acct_…) — TEST mode` |
| [ ] 🔒👤 | **A webhook endpoint for HOA Connect on Hue's account** → `https://<app host>/api/stripe/webhook`, its own signing secret in `STRIPE_WEBHOOK_SECRET` (test and live endpoints differ). Subscribe only the events the route handles: `payment_intent.succeeded/payment_failed/canceled`, `charge.succeeded/refunded`, `customer.subscription.created/updated/deleted`, `invoice.paid/payment_failed`, `account.updated`, `payout.paid/failed/canceled`. Hue's other products keep their own endpoints. | Hue's Stripe → Developers → Webhooks | a test event shows 200 in the endpoint's log |
| [ ] 👤 | **What payers see** — subscription charges read `HUE HOA CONNECT` (set on each band product by the script). Connect onboarding and dues charges show the platform's public name, i.e. **Hue**, unless Settings → Connect → Branding says otherwise. Check one statement line and one onboarding screen in test mode and decide if that's what you want. | Hue's Stripe → Settings | you're happy with both |
| [ ] 🔒👤 | **Stripe Connect activated** — every step in [`connect-activation-runbook.md`](connect-activation-runbook.md) §3–§6, including the webhook events list (it must include `charge.refunded` and `customer.subscription.*`). | Stripe Dashboard | the §5 pilot smoke test passes in test mode, then one live $1 payment lands in a pilot org's bank |
| [x] | **Subscription band prices exist in both modes, on Hue's account** — run 2026-11-05 (test and live); all 24 amounts checked against Directus. Checkout finds the price **by lookup key in the mode it's running** (`resolveBandPrices`), so test and live work side by side; the ids stored on `subscription_plans` are only a record of the last run. Re-run the script (per mode) whenever a band's price changes: a changed amount gets a new Stripe price that takes over the lookup key, and the old one is archived (existing subscriptions keep theirs). | `pnpm stripe:subscription-prices [--mode=live]` | Settings → Subscription shows a price and Subscribe for a non-free org, in both modes |
| [ ] 👤 | **A real subscription activates the org** (Phase 9 fix: the band route now saves `stripe_customer_id` first, so the webhook can find the org). Subscribe a test org in test mode with `4242…`. | `/settings/subscription` | the org flips `trial → active` within a minute and Manage billing opens the portal |
| [ ] 👤 | **Refund round trip** — refund $1 of a test payment, then the rest, from the Stripe dashboard. | Stripe Dashboard → Payments | the charge reads partially paid, then owing; the Community Ledger shows two "Payment refunded" rows |
| [ ] | **Extra Storage add-on price** — [`go-live-checklist.md` §1](go-live-checklist.md) | Stripe + Vercel env | the Settings toggle no longer 503s |

## 4. Email

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 🔒👤 | **SendGrid webhook enforcing signatures** — turn on Signed Event Webhook, put the verification key in `SENDGRID_WEBHOOK_PUBLIC_KEY`. Until it is set, `/api/email/activity` accepts unsigned posts (which can mark addresses bounced). | SendGrid → Mail Settings; Vercel env | a `curl` POST with no signature gets **403** |
| [ ] 🔒👤 | **`OUTBOUND_EMAIL_ONLY_TO` unset in production** — it is the dev/staging allow-list; set in prod it silently drops every other recipient while reporting success. | Vercel → Production env | absent from Production; a real send reaches a non-team inbox |
| [ ] 👤 | **The send queue on** — after `pnpm add:email-send-queue`, run one `--real` send to a pilot org. | composer | progress dialog completes; counts match SendGrid's activity feed |
| [ ] 👤 | **Privacy policy links the email-preferences section.** The policy is not in this repo (marketing site). The link to give it: `https://<app host>/<org-slug>/profile#email` per community, or `/account` for the account-wide page. Say what "community mail" vs "essential mail" means (Phase 3a's two classes). | marketing site | the link opens the Email section signed in |

## 5. Push, PWA and devices

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 🔒👤 | **VAPID set in production** — [`go-live-checklist.md` §5](go-live-checklist.md) has the exact commands. Push is inert until it is. | Vercel env | Profile → Notifications can subscribe on prod |
| [ ] 👤 | **Device verification** — every row of [`push-verification.md`](push-verification.md), including the Phase 7 channel rows, on an installed iPhone and an Android. | devices | each row ticked |
| [ ] 👤 | **A DM between two logins** (Phase 7) | two browsers | both see it live, and the bell row collapses |

## 6. AI

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 🔒👤 | **Anthropic account funded** — it had no credit balance ([`go-live-checklist.md` §3e](go-live-checklist.md)); every AI feature is dark until it does. Confirm Vercel holds the same key. | console.anthropic.com | "Ask the HOA" answers on `/transition-test` |
| [ ] 👤 | **Voyage funded and `VOYAGE_API_KEY` in Vercel** — without it retrieval silently drops to lexical. Note: Phase 9 made RAG re-indexing on document saves **awaited**, so a slow Voyage now slows those saves instead of silently skipping the index. | Vercel env | the ask route reports `retrieval.ledgerMode: "vector"` |

## 7. Data and demos

| | Item | Where | Verified when |
|---|---|---|---|
| [ ] 👤 | **Delete the transition fixture** (`/transition-test`, its billing account and members — [`go-live-checklist.md` §3d](go-live-checklist.md)) once no one is building on it. It is in maintenance mode, so it is safe to leave until then. | Directus | slug 404s; the agency fixture is gone |
| [ ] 👤 | **Re-seed the demo orgs on the new shell** — the demos predate the dock, reminders and channels DMs. Seed reminders ON, a recurring email, a channel with a DM, and a Reports tab with a year of entries so the PDF has something to show. | seed scripts | a cold visitor's demo shows each Round 3 feature without setup |
| [ ] 👤 | **Turn reminders on per pilot community** — every rule ships OFF until a board turns it on (Phase 5b). | Settings → Organization → Reminders | the 24-hour dry run lists what would send |

## 8. Known, deliberately open

- **Four native `prompt()`s** (`audit:native-dialogs` ratchet at 4) — `useConfirm` has no text-input mode yet. Report a message, Gantt note/follow-up title, approval reject note.
- **`charge.refunded` on a multi-charge payment** reverses against the first linked charge only (the split across `charge_ids` is not unwound). Rare; the ledger row is still exact.
- **The per-plan `/api/stripe/subscription` route** remains for the signup flow (`Payment/SubscriptionForm.vue`, which persists its own customer through `setup-organization`). It is unauthenticated; retire it when signup moves to bands.
