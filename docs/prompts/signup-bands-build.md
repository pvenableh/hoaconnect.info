Continue HOA Connect: move signup onto band pricing. The machine is set up and the design is decided, so this
is the build. Do Phase 1, commit locally, report, and WAIT for a yes before Phase 2.

Suggested models: Phase 1 on Opus 5.5; Phases 2 and 3 on Sonnet 5.5 (back to Opus if the webhook misbehaves).

Token discipline, for the whole session: no Explore agents; read only the files named here and what grep points
to; never open docs/plan-earnest-parity-round2.md; summaries ≤8 lines; gates in the background, tail only; prove
backend work with tests or Stripe test-mode output, not screenshots. One phase per approval; stop after its commit.
Work on main. It auto-deploys, so NOTHING is pushed until all three phases are done, and then only when Peter says.

## Where things stand (2026-11-09)

- Mac Mini M4: Homebrew, fnm (in ~/.zshrc), Node 22.22.1 arm64, pnpm 9.4.0, deps installed. If `node` isn't on the
  PATH in your shell: `eval "$(/opt/homebrew/bin/brew shellenv zsh)"; eval "$(fnm env --shell zsh)"; fnm use 22.22.1`.
- All gates green at eca6dfd: 143 files / 2,482 tests, 16 audits, lint 0 errors and 148 warnings (the limit),
  typecheck 0 errors (`NODE_OPTIONS=--max-old-space-size=6144`), build exit 0.
- Not installed: Stripe CLI (Phase 3 needs it) and Playwright (never install it without asking Peter).
- `.env` lacks 12 keys that .env.example lists, including STRIPE_MODE; none blocked a gate. Never print a value.
- `pnpm stripe:subscription-prices` ran in TEST mode on Hue's account. No price changed, but it overwrote the stored
  price ids on all 4 `subscription_plans` rows, which were probably the live ones. Charges are unaffected (they go by
  lookup key). `--mode=live` would restore the record; it has not been run and is Peter's call. Always pass
  `STRIPE_EXPECT_ACCOUNT=acct_1Fv2XpA7IKygGtBC` when running that script.

## Decided by Peter — do not reopen

Signup uses option (a): the board declares a unit count and the server picks the band, with the org created BEFORE
the charge. Rejected: (b) picking a band (Session 14 deliberately removed client-chosen bands) and (c) subscribing
later from Settings (a new org has 0 units, so it would quote the smallest band; and no card at signup).

Consequences Peter has accepted: signup charges immediately, so the plan's N-day free trial no longer applies; an
abandoned card leaves a `trial` org with no subscription; a count declared too high stays in force until someone
edits it in Directus; automatic re-banding when real units outgrow the band is out of scope.

## What the code does today (verified 2026-11-09)

- `resolveBandForOrg` (core/server/utils/subscription-band.ts) counts `hoa_units`. It feeds both
  `GET /api/org/billing/band` and `POST /api/stripe/subscribe-band`.
- core/server/api/hoa/setup-organization.post.ts:109 sets the org `active` from `subscriptionStatus` in the request
  body, and takes Stripe ids and `subscriptionPlanId` from the client too. It already signs a new admin in
  (`setUserSession`); confirm `requireAdminAccess` accepts them straight afterwards.
- `/api/stripe/setup-intent` has no callers. `/api/stripe/subscription` is called only by
  app/components/Payment/SubscriptionForm.vue, used only at OrganizationSetupForm.vue:1004.
  billing-account/subscribe.post.ts:6 mentions the route in a comment; update it when the route goes.
- OrganizationSetupForm.vue is used by app/pages/setup.vue and app/pages/organizations/new.vue, both `:beta-mode="false"`.
  `saveSetupDataForPayment` POSTs the setup data, including the admin password, to `/api/hoa/pending-setup`.
  Callers of pending-setup: that form, app/pages/setup/complete.vue, core/app/middleware/auth.ts (grep before deleting).
- app/pages/settings/subscription.vue shows the pattern to copy: POST subscribe-band, then `<PaymentStripeCard>` with the
  `clientSecret`. PaymentStripeCard's `returnUrl` defaults to /payment/confirmation; signup must pass `redirectTo`.
- `selectBand` (core/shared/billing/bands.ts) is pure, so the form can quote from the plans it already lists.
- No test references subscribe-band, setup-organization or the subscription route yet. Patterns to follow:
  tests/server/stripe-webhook.test.ts, tests/server/band-prices.test.ts, tests/server/support/memory-directus.ts.
- Stripe is Hue's shared account: tag with `appMetadata()`; the webhook finds the org by `stripe_customer_id`.

## Phase 1 — backend and tests

1. Schema: a new idempotent `scripts/add-declared-units-field.ts` plus a package script, adding integer `declared_units`
   to `hoa_organizations`. Write it, but ASK Peter before running it against the Directus in .env.
2. `resolveBandForOrg` uses the larger of real and declared units, so the Settings quote and the charge both follow.
3. `setup-organization` takes `declaredUnits`, resolves the band server-side, always starts the org in `trial`, stops
   accepting the client's status, Stripe ids and plan id, and refuses contact-only bands. It must not break if the
   new field hasn't been added yet in a given environment, or say clearly why it can't avoid that.
4. Delete `/api/stripe/subscription` and `/api/stripe/setup-intent`.
5. Route tests with a fake Stripe + MemoryDirectus: client status ignored; band chosen server-side; declared beats a
   lower real count; customer saved BEFORE the subscription is created; onboarding on the first invoice; non-admin refused.

Tests, `pnpm audit:all` and `pnpm lint` green WITHOUT raising a baseline. Commit locally and stop.

## Phase 2 — signup form and cleanup

1. The plan-picker step becomes unit count, billing interval and a quote from `selectBand` (band, price, onboarding, first
   invoice total). A contact-only band shows "Talk to us" and goes no further.
2. Payment step: create the org, POST subscribe-band, show `PaymentStripeCard`. A retry or Back press re-subscribes
   and never creates a second org. Remove the free-trial copy.
3. Delete once nothing calls them: Payment/SubscriptionForm.vue, the three `/api/hoa/pending-setup` routes, and
   app/pages/setup/complete.vue.

Gates green as above, plus typecheck. Commit locally and stop.

## Phase 3 — end to end, docs, commit

1. A test-mode run on a new non-free org with card 4242, on localhost, with the org flipping `trial → active` through the
   webhook. `brew install stripe/stripe-cli/stripe`; Peter runs `stripe login`; `stripe listen --forward-to` the local
   webhook; give the dev server the CLI's signing secret as an env var rather than editing .env. Run the
   `declared_units` script first (ask). The org lands in the .env Directus, so ask whether to delete it afterwards. If the
   CLI or keys can't be set up, say so and stop at the tests rather than faking it.
2. All gates, including `pnpm build`.
3. docs/gtm-checklist.md: tick "A real subscription activates the org" in §3 if the run passed; close the per-plan route
   bullet in §8. Append a short "Post-Round-3 Session 1" entry to the Session log in docs/plan-earnest-parity-round3-gtm.md,
   including the deploy order: `declared_units` script on production Directus BEFORE the push goes live.
4. Commit and stop. Ask before pushing.
