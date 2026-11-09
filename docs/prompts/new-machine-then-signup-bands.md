# Prompt — set up a new machine, then move signup onto band pricing

Paste everything inside the fence into a new Claude Code session in the `hoaconnect` repo on the
new computer. **Model: Opus 5.5, effort high.** Part 1 is cheap setup; Part 2 creates Stripe
subscriptions, which is why the session isn't on Sonnet.

**Before you start, bring these over yourself. They are not in git, and they should not be:**

- `.env` from the old machine (32 keys, including live Stripe and Directus tokens). Move it with a
  password manager or AirDrop, never through the repo or chat.
- `vercel link` once, if you use the Vercel CLI there (`.vercel/` is ignored).
- Claude's memory on the old machine isn't synced. Its one rule (short, deliberate sessions) is
  restated in the prompt below.

```
Continue HOA Connect on a NEW machine. Earnest Parity Round 3 is complete and on origin/main
(through b61c565, plus the commit that added this prompt). Do Part 1, report, and WAIT for a yes
before Part 2.

Token discipline, for the whole session: no Explore agents; read only the files named here and
what grep points to; never open docs/plan-earnest-parity-round2.md; plan in ≤10 lines and wait
for a yes before building; summaries ≤8 lines; gates in the background, tail only; prove backend
work with tests or Stripe test-mode output, not screenshots. One part per approval; stop after
the commit. Work on main (it auto-deploys, so ask before every push).

## Part 1 — make this machine work

1. Confirm `git status` is clean and on main, level with origin/main. Node 22 (the old machine
   ran v22.22.1), pnpm 9.4.0 (`corepack enable` picks it up from package.json). Run `pnpm install`,
   which also writes .nuxt/components.d.ts — audit:unresolved-components needs it.
2. Check .env exists. It is copied by hand, never committed. Compare key NAMES only against
   .env.example and report any missing; never print a value.
3. Prove the machine with the same gates CI runs:
   - `pnpm test | tail -6` (expect 143 files, 2,482 tests, or more)
   - `pnpm audit:all` and `pnpm lint`
   - `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck` into a log, grep "error TS" (expect
     none; it runs out of memory at the default heap)
   - `pnpm build` into a log, grep the exit code
4. Stripe read check: `pnpm stripe:subscription-prices` prints the account first. Expect
   "Hue (acct_1Fv2XpA7IKygGtBC) — TEST mode". It is idempotent, so a re-run should change nothing.
5. Playwright is NOT a dependency: scripts/browser/*.cjs resolve it through NODE_PATH. Never install
   it without asking Peter.

Report in ≤8 lines: what passed, what's missing. Then stop and ask about Part 2.

## Part 2 — signup on band pricing

Read ONLY: the "Round 3 wrap-up" and "Session 14" entries in docs/plan-earnest-parity-round3-gtm.md,
and docs/gtm-checklist.md §3 and §8.

Starting point, verified 2026-11-05:
- Org admins already subscribe on bands: POST /api/stripe/subscribe-band (admin-gated, band resolved
  server-side from the org's unit count, stripe_customer_id saved BEFORE the subscription is
  created) and GET /api/org/billing/band (the quote). Both use planBandCheckout
  (core/shared/billing/band-checkout.ts) and bandWithModePrices (core/server/utils/subscription-band.ts:
  prices by lookup key hoa_<slug>_<kind>, in the running Stripe mode; ids stored in Directus are
  never read to charge).
- Signup is still on the old path: app/components/OrganizationSetupForm.vue lists every plan, the
  user picks one, Payment/SubscriptionForm.vue POSTs planSlug + billingCycle to
  /api/stripe/subscription (UNAUTHENTICATED, takes trialDays from the plan, no onboarding fee), then
  /api/hoa/setup-organization creates the org from the client's subscription result.
- Stripe is Hue's shared account: tag everything with appMetadata()
  (core/shared/billing/stripe-app.ts) and find customers with findOrCreateAppCustomer. The webhook
  ignores PaymentIntents that aren't HOA Connect's.

Open design question, Peter decides before any code: at signup there are no units yet, so how is
the band chosen? (a) the board declares a unit count and the band follows; (b) they pick a band
from the ladder; (c) create the org first on a trial, then subscribe through subscribe-band from
Settings → Subscription. Recommend one, say why in ≤10 lines, and WAIT.

Deliverables:
- Signup charges the band price + the onboarding fee through ONE route sharing planBandCheckout.
- /api/stripe/subscription and /api/stripe/setup-intent either authenticated or deleted (check
  callers with grep first).
- The org has its stripe_customer_id before the first webhook arrives.
- Route tests with a fake Stripe + MemoryDirectus (tests/server/support/memory-directus.ts).
- A test-mode checkout run end to end with card 4242 on a non-free org, the org flipping
  trial → active through the webhook (`stripe listen`, or Hue's test webhook endpoint). The demo
  org is a free account, so it can't show this. If the webhook endpoint or keys aren't set up
  yet, say so and stop at the tests rather than faking it.

`pnpm audit:all` and `pnpm lint` must stay green WITHOUT raising a baseline. When done: tick the
matching lines in docs/gtm-checklist.md, append a short "Post-Round-3 Session 1" entry to the plan's
Session log, commit, and stop. Ask before pushing.
```
