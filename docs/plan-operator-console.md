# Operator console — running HOA Connect from one place

**Status:** 2026-11-09. Decisions are in §9. Phase 1 (Session A, read-only console plus the payments feed) is built and committed locally, not pushed; it releases with Phase 2 (Session B).

**What it is:** a place in the app where the people who run HOA Connect can see:
- which communities pay, and what's failing or ending;
- who asked for help;
- whether the system is healthy.

They can also act on all of these, safely. It is not a second admin area for HOA boards; they keep theirs.

---

## 1. How to manage subscriptions and refunds today

Until the console exists, money is managed in Stripe and the app follows by webhook. Directus holds the org records.

| Task | Where | What the app does |
|---|---|---|
| See a community's subscription | Stripe → Customers (search the board's email or the community name). Every HOA Connect object has `metadata.app = hoaconnect`; Hue's other products share the account. | — |
| Refund a subscription charge | Stripe → Payments → the charge → Refund (full or partial) | `charge.refunded` arrives; **access doesn't change**. A refund isn't a cancellation. |
| Cancel a subscription | Stripe → the subscription → Cancel: **immediately** or **at period end** | `customer.subscription.deleted` sets the org to `canceled`, and the board loses access then. At period end, they keep access until that date. |
| Board changes card, sees invoices, cancels | The board itself: Settings → Subscription → **Manage billing** (Stripe portal titled "Hue Billing"; cancels at period end) | Same webhooks as above |
| Agency-billed communities | One Stripe subscription per billing account, with quantity = properties. Managed at `/billing/<accountId>` by the account's owner or billing_admin. | Webhooks route to the `billing_accounts` row first |
| Give a community free access | Directus → `hoa_organizations` → `is_free_account = true` | Entitled regardless of status |
| Extend a trial | Directus → `trial_ends_at` (unpaid signups get 14 days) | Entitled while `trial` and the date is in the future |
| Discount code | Stripe → Coupons, add metadata `app = hoaconnect`, then a promotion code. Share the code or `https://app.hoaconnect.info/setup?code=CODE` | Signup checks and applies it |
| Resident dues refund (Connect) | Stripe → Payments → the dues charge → Refund | Ledger gets a "Payment refunded" row. A payment spread across several charges unwinds the first charge only (launch-followups Session 4). |

## 2. The roles, as the app has them today

Five independent layers. One person can hold several at once; `resolveActors()` (`core/server/utils/board-access.ts`) collects them for the shared capability matrix.

| Layer | Who | Stored as | Today they can |
|---|---|---|---|
| **Platform** | **App Admin** (Peter) | Directus role on the user, `directusRoleAppAdmin`. The client also accepts the legacy names "App Admin" and "Administrator"; the server checks the id only. | Everything. Passes every org's HOA-admin checks (`checkAdminAccess`) and every billing account (`billing-account.ts`). |
| **Org membership**: one `hoa_members` row per person per community | **HOA Admin** | `hoa_members.role` = HOA Admin role | Run the community: settings, members, units, content, **subscribe and Manage billing**. The community's customer contact. |
| | **Property Manager** | `hoa_members.role` = Property Manager, plus per-person grants in `manager_permissions` | What their grants allow (e.g. send communications, create violations). The role is only a ceiling (`manager-access.ts`). |
| | **Member** | `hoa_members.role` = Member | Resident features. |
| **Board office** | President, Treasurer, … | A current-term `hoa_board_members` row. **Not a role.** | Office-based capabilities from the shared matrix, on top of their membership role. |
| **Residency** | Owner or Tenant | `hoa_members.member_type`, overridden per unit (`residencyFor()`) | Owner- or tenant-specific features and stats (e.g. owner occupancy). |
| **Agency billing** | owner, billing_admin, viewer | `billing_account_members.role` on a billing account | Pay for and manage several communities at once (management companies). |

Two words mean different things in different layers:
- **Owner:** a unit owner (residency) or a billing account owner (agency).
- **Admin:** App Admin (platform), HOA Admin (community), or billing_admin (agency).

The console keeps these labels distinct.

## 3. What each role gets from this plan

| Role | Operator console (`/ops`) | Support |
|---|---|---|
| App Admin | Everything (§5) | Works the platform inbox; sees every request |
| Platform Support *(new, decided §9.2)* | Read-only console, plus the inbox. No money actions. | Works the platform inbox |
| HOA Admin | — (keeps Settings → Subscription) | **Contact HOA Connect**: billing, bugs, questions, feature ideas. Sees every platform request from their community. |
| Billing account owner / billing_admin | — (keeps `/billing/<id>`) | Contact HOA Connect about the billing account |
| Property Manager | — | Contact HOA Connect on the community's behalf, if their grants allow (new grant `contact_platform`) |
| Board officer (not an HOA Admin) | — | Contact HOA Connect. The HOA Admins see the request too. |
| Member: owner or tenant | — | **Ask my community** goes to the HOA, not to HOA Connect. **Report a problem with the app** goes to HOA Connect, with the HOA Admins copied. |

Why residents' questions go to the HOA first: questions about dues, rules or violations are the community's to answer, and HOA Connect can't answer them. Only app faults reach Peter, so the platform inbox stays about the platform.

Customer contacts are shown by name and email in the console: HOA Admins, board officers, Property Managers and billing account members. Residents appear only as counts (owners, tenants, units), unless one of them has opened a request. Peter needs to reach the people who pay and run the community, not browse residents.

## 4. Principles

1. **Stripe stays the source of truth for money.** The console reads Stripe live (filtered by `metadata.app`) and never keeps its own copy of amounts or statuses.
2. **Read-only first.** Actions come in Phase 2, once the views have been trusted for a while.
3. **Every action is a server route** under `/api/ops/*`, guarded by a new `requireAppAdmin(event)` (or `requireOpsPermission(event, flag)` if a Support role exists). It asks for confirmation and a reason in the UI, and is written to an append-only `ops_audit_log`. That log follows the `org_audit_log` rules: no update, no delete.
4. **Console actions are platform actions, not org actions.** An App Admin can already pass HOA-admin checks inside a community. Console writes stay separate, so a community's own audit log never shows Peter acting as their admin.
5. **Directus Data Studio stays** for raw edits and schema. The console is for the daily work, on a phone as well as a desk.
6. **No new secrets in the browser.** Stripe calls happen on the server with the existing keys and the pinned API version.

## 5. What it shows and does

### Phase 1 — Look (read-only)

- **Overview**
  - MRR and ARR from active subscriptions, normalised to monthly; agency billing accounts count by quantity.
  - Communities by status: active, trial, trial ending within 3 days, expired, canceled, free, agency-billed.
  - Signups in the last 7 and 30 days.
  - Failed payments in the last 30 days.
  - Discount code redemptions.
  - Webhook health: recent events with `pending_webhooks > 0`.
- **Communities:** a searchable, filterable table.
  - Columns: name, slug, band, declared and real units, how it's billed (self or agency), status, trial end, monthly value, signup date, primary contact.
  - Quick filters: "trial ending", "past due", "no units yet", "free", "agency".
- **Community page**
  - **People:**
    - HOA Admins, current board officers and Property Managers (with their grants), plus the billing account's members if agency-billed.
    - Counts of members, owners, tenants and units.
  - **Billing:** subscription, invoices, charges, refunds and discount, read live from Stripe. The band it's on, versus the band its units now fall into (feeds Session 3's re-banding).
  - **Activity:** last sign-in by an HOA Admin, the AI wallet balance, and the last 20 `org_audit_log` entries.
  - **Links:** Stripe Dashboard and the Directus item.
- **Billing accounts:** the agency view. Each account's communities, its quantity versus the communities actually attached, and its members.
- **Payments feed:** HOA Connect's subscription charges, refunds and failures, newest first. Resident dues are kept separate, under a tab.

### Phase 2 — Act (each confirmed, with a reason, and logged)

- Refund a subscription charge, full or partial. A reason is required on every refund; above $500 the amount must also be typed to confirm.
- Cancel immediately or at period end, and resume a subscription that's set to cancel at period end.
- Extend a trial, or mark a community free (comp).
- Move a community to another band now. This shares logic with Session 3; build that first.
- Discount codes:
  - List, create and deactivate them, with the `app = hoaconnect` tag added automatically.
  - Show redemptions per code.
  - Copy the signup link.
- Open the community's Stripe billing portal, to see what its HOA Admins see.
- Re-send the welcome email or a receipt, or change a community's primary billing contact.

### Phase 3 — Support

- **Two doors in the app**, offered by role (§3):
  - "Contact HOA Connect" goes to the platform inbox.
  - "Ask my community" goes to the community's own inbox: its HOA Admins, board officers, and Property Managers with a new `handle_requests` grant.
  - Each records the community, the user, their roles at that moment (membership role, board office, residency), the page and the app version.
- **Automatic platform entries:** a failed payment, a webhook failure, a signup stuck in `incomplete`.
- **Optional:** email to support@ through SendGrid Inbound Parse.
- **Model**
  - `support_requests`: scope (platform or community), community, requester, `requester_roles` snapshot, category (question, bug, billing, feature), status (new, open, waiting, closed), priority, subject, timestamps.
  - `support_messages`: request, author, body, internal or visible, attachments.
- **Console inbox:** filters, the thread, and a reply. A reply sends an email and appears in the requester's "My requests". There are internal notes, a status, and a link to the community page.
- **Notifications:** a new platform request emails Peter, through the same `BILLING_NOTIFY_EMAIL` channel as Session 2. A new community request notifies that community's handlers through the existing bell and email.

### Phase 4 — System health

- When each cron last ran: AI notices, stale AI actions, email continue-sends, reminders.
- Email queue: stuck and failed sends, recent SendGrid bounces.
- Spend: AI wallet and Anthropic/Voyage usage, and whether either key is missing.
- Storage use per community.
- Push subscriptions by platform.
- Webhook delivery (failed events in the last 7 days).

### Phase 5 — View as a role (later; not scheduled)

- See a community as a tenant, board officer, HOA Admin or Property Manager, to reproduce a problem.
- Read-only. Every "view as" session is written to `ops_audit_log`, and the viewed person's residents' details follow §3.
- Not built until Phases 1–4 have been in use.

## 6. Data and code changes

- **Platform role checks**
  - `requireAppAdmin(event)` in `core/server/utils/admin-auth.ts`. It returns 403 unless `checkAdminAccess().isAppAdmin`.
  - Platform Support is chosen. Add a Directus role `Platform Support` (id in `config.public.directusRolePlatformSupport`, server-checked by id like App Admin) and `requireOpsPermission(event, "billing.read" | "billing.write" | "support")`. App Admin passes all three; Platform Support passes `billing.read` and `support` only. `requireAppAdmin` stays for anything an App Admin alone may do.
  - Every read route uses `requireOpsPermission(event, "billing.read")`. Every money action uses `"billing.write"`.
  - Settle the client's legacy role names ("Administrator") to match the server's id-only check.
- **Grants:** two new Property Manager grants, `contact_platform` and `handle_requests`. Add both to the canonical grant list, so revocation clears them too (`manager-access.ts` explains why).
- **`ops_audit_log`:** append-only, written only through `writeOpsAuditEntry()`.
  - Fields: actor, action, community, billing account, Stripe ids, amount, reason, before and after, created.
  - The migration grants no role access, as with `org_audit_log`.
- **Support collections:** `support_requests` and `support_messages` (Phase 3). The migration script goes in `scripts/`, with Directus permissions for requesters to read their own rows and for community handlers to read their community's.
- **Routes and pages:** `/api/ops/*` routes, and pages under `app/pages/ops/`. Stripe list calls are paginated, filtered to `metadata.app = hoaconnect`, and short-cached (60 s) on the server.
- **Tests:** in the existing style, with a fake Stripe plus MemoryDirectus.
  - **Refused before Stripe:** a resident, a Property Manager without the grant, an HOA Admin, a billing_admin, and a Platform Support user trying a money action.
  - **Logged:** every action writes its audit row.

## 7. Security and privacy

- Server-side role check on every `/api/ops` route; the UI gate is only a convenience.
- Refunds and cancellations need a reason and a confirmation, and refunds are capped per request, and above $500 need the amount typed to confirm. Platform Support can read and work the inbox but is refused every `billing.write` action before Stripe is called. Stripe idempotency keys stop a double-click from refunding twice.
- Rate-limit `/api/ops` writes.
- Never return secret keys, signing secrets or full card details. Stripe's last-4 digits are enough.
- Show residents' details only for requests they opened (§3).
- `ops_audit_log` and the support collections stay closed to every Directus role except through the app and the permissions above.

## 8. Build order

| Session | Scope | Suggested model | Notes |
|---|---|---|---|
| A | `requireAppAdmin`, `requireOpsPermission` and the Platform Support role, `/ops` shell, Overview, Communities, Community page with People, Billing accounts (read-only) | Opus | No Stripe or Directus writes except creating the role, which needs Peter's yes. Prove the numbers against Stripe in test mode. |
| B | Payments feed and the Phase 2 actions, with `ops_audit_log` | Opus | Live Stripe writes: every action is tested in test mode first. Re-banding waits for launch-followups Session 3. |
| C | Support: collections, both doors by role, community inbox, platform inbox, replies by email, new grants | Opus | Role routing is the hard part. Needs launch-followups Session 2's notification email. |
| D | System health | Sonnet | Mostly reads of existing collections. Gate its routes with `requireOpsPermission(event, "billing.read")`. |

Phases 1 and 2 release together (§9.3): A and B are built as two sessions, but nothing is pushed until B is done and Peter says so. Don't run B alongside launch-followups Sessions 2 or 4: all three touch Stripe billing paths.

## 9. Decisions for Peter (recommendation first)

1. **Where:** `/ops` in the app, or a Directus extension/Insights?
   - Decided 2026-11-09: `/ops` in the app.
2. **Platform roles:** App Admin only for now, or add a "Platform Support" role (read-only console plus inbox, no money actions)?
   - Decided 2026-11-09: add a Platform Support role (read-only console plus inbox, no money actions). Built in Session A with `requireOpsPermission`, not Session D, so every route is gated by permission from the start.
3. **First release:** read-only Phase 1, or Phases 1 and 2 together?
   - Decided 2026-11-09: Phases 1 and 2 ship together. Built as Sessions A and B; nothing is pushed until B is done.
4. **Support:** build the two doors (community and platform), or use an existing helpdesk (Help Scout, Crisp) for the platform side and keep only "Ask my community" in the app?
   - Decided 2026-11-09: build both doors in the app (Session C as written).
5. **Residents and the platform:** can owners and tenants report app problems straight to HOA Connect (HOA Admins copied), or must everything from residents go through their community first?
   - Decided 2026-11-09: owners and tenants can report app problems straight to HOA Connect, with HOA Admins copied. "Ask my community" still goes to the HOA.
6. **Who sees a community's platform requests:** all of its HOA Admins, or only the person who asked?
   - Decided 2026-11-09: all of the community's HOA Admins see its platform requests.
7. **Refund guard:** a reason for every refund plus a typed confirmation above $500, or a reason only?
   - Decided 2026-11-09: a reason on every refund, plus the amount typed to confirm above $500.
8. **"View as" a role** (see a community as a tenant, a board officer, etc., to reproduce a problem): not now, or later as read-only and logged?
   - Decided 2026-11-09: later, as read-only and logged. Now Phase 5 (§5), not scheduled.
