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
- **A canceled test org remains:** "Testing HOA", Boutique, 28 units, refunded and canceled. Delete it only with
  Peter's yes, after reading it.
- **Gates at 70c2e68:** 145 files / 2,543 tests, 16 audits, lint 0 errors and 139 warnings, typecheck 0, build ok.
- **launch-followups.md Sessions 2–5 are still open.** Don't run Session B here alongside its Sessions 2 or 4; all three
  touch Stripe billing paths. Session B's re-banding action waits for its Session 3.

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

## Session A — read-only console (Opus 5.5)

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

## Session B — actions (Opus 5.5)

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

## Session C — support (Opus 5.5)

Build Phase 3 as decided: the two doors by role, `support_requests` and `support_messages`, the community inbox, the
platform inbox in `/ops` (gated by `requireOpsPermission(event, "support")`, so Platform Support can work it), replies by email, and the new Property Manager grants (`contact_platform`, `handle_requests`).
Add the grants to the canonical list.

- **Before starting:** needs launch-followups Session 2's notification email. If it isn't done, say so and stop.
- **Tests:** who sees which request (resident, owner versus tenant, board officer, HOA Admin, Property Manager with and
  without grants, App Admin); the role snapshot on each request; email on reply.
- **Browser check:** with a demo session, one request through each door.

Gates green. Commit and stop.

## Session D — system health (Sonnet 5.5)

Build Phase 4 from existing collections and `vercel.json` crons, behind `requireOpsPermission(event, "billing.read")`. The
Platform Support role and guard already exist from Session A.

Gates green. Commit and stop.
