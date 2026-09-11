# Plan — PayHOA parity, scoped to "accept payments, show reports, show live data"

> Drafted 2026-09-11, revised the same day after scoping. Companion to
> [VISION.md](VISION.md) (why) and [ROADMAP.md](ROADMAP.md) (what shipped).
> Status: **proposed — nothing here is built yet.** Kickoff prompt for Phase 1:
> [prompts/payhoa-parity-phase1-billing.md](prompts/payhoa-parity-phase1-billing.md).
>
> Scope decision (owner, 2026-09-11): HOA Connect is **not** an accounting system
> and **not** a bill-pay system. It accepts dues, shows every owner their own
> ledger, shows the board and owners live bank data, and treats the bookkeeper's
> or manager's financial reports as the reference record. Compliance (violations,
> ARC) stays at its current request-type depth. This keeps VISION's "Not
> QuickBooks" decision intact.

---

## 0. What "parity" means under this scope

PayHOA sells three things a board notices: dues collection with autopay, a
general ledger with bank feeds and 40 reports, and a long tail of comms and
management tools. Under this scope, HOA Connect answers each differently:

| PayHOA sells | HOA Connect ships |
|---|---|
| Dues, autopay, late fees, owner ledger | The same, on Stripe Connect into the association's own account |
| Its own GL, reconciliation, bookkeeper service | **Live bank feed + simple reports + the bookkeeper's uploaded reports**, all owner-visible, all queryable by the AI |
| Vendor bill pay, 1099, lockbox | Not built. Expenses are records linked to bank rows; the board pays from its bank as it does today |
| SMS and voice, message boards, voting, amenity reservations | SMS as a per-org add-on on the existing notification system; bylaw-grade voting plus polls inside channels; amenity reservations with fees |
| Violations, ARC, custom forms, mailroom, resale packets | Existing request types; mail and resale deferred until an org asks |

The pitch: *"Every owner sees the bank balance, every charge, every payment, and
the treasurer's reports, in real time, and can ask the AI about any of it."*
PayHOA cannot say that because their books are a manager-facing ledger.

---

## 1. Gap matrix (financial core only)

Legend: ✅ have · 🟡 partial · ❌ absent · ⭐ already ahead

| Deliverable | Today | Phase |
|---|---|---|
| Recurring dues generate charges automatically | 🟡 `payment_schedules` stored, never materialized | P1 |
| Autopay (saved method, day of month) | ❌ | P1 |
| Late fees applied on a schedule | 🟡 config exists, never applied | P1 |
| Owner account ledger: charges, payments, running balance, receipts | 🟡 owner sees charges + can pay; no running ledger | P1 |
| Multi-unit owner pays everything in one checkout | 🟡 M2M exists; checkout is per charge | P1 |
| PDF account statement | ❌ | P1 |
| ACH + card into the association's account | ✅ code-complete, **not activated** | P1 |
| Bank connection (Plaid), daily feed | ❌ | P2 |
| Bank feed visible to board, and to owners read-only | ❌ | P2 |
| Simple categorization of feed rows (rules + AI suggest) | ❌ | P2 |
| Link Stripe payouts and recorded expenses to bank rows | ❌ | P2 |
| Reports: cash balance trend, cash in/out by category, budget vs actual, delinquency aging | 🟡 running balance, income by type, expense by category, AR aging on `ledger.ts` | P2 |
| Simple annual budget table | ❌ | P2 |
| PDF/XLSX export of reports | 🟡 CSV only | P2 |
| Bookkeeper/PM uploads financial reports as the reference record | ❌ (generic documents only) | P3 |
| Owners can read those reports; AI can answer from them | 🟡 RAG covers `hoa_documents` already | P3 |
| Data Trust export, transition planner, audit ledger, HITL AI | ⭐ | — |

---

## 2. Rules that apply to every phase

**Ownership.** Every new collection carries `organization`, joins
`core/shared/export/collections.ts` in the same PR, and writes to
`org_audit_log` for anything a board would later point at. Plaid Items belong to
`hoa_organizations`, never to a manager or billing account, and the transition
planner lists them as "stays with the community."

**Visibility.** Decided once in `core/shared/ledger/visibility.ts`:
- Owner-visible: bank balances and the feed (with the redaction below), all
  reports, aggregate delinquency, uploaded financial reports flagged published.
- Board-only: per-member balances and delinquency, unpublished reports.
- Never: one owner's payment status to another owner. The bank feed shows
  inbound dues rows as "Owner payment" with the counterparty name stripped;
  outbound rows show the merchant.

**Money.** No autonomous money movement. HOA Connect never pays anyone out.
Refunds and fee waivers are human actions.

**UX.** Owner money screen answers "what do I owe, when, and where did the
community's money go" in the first viewport. Board screen answers "what's the
balance, what's uncategorized, who's late." Everything else is a drill-down.
Mobile first for owners: pay, autopay, statement, feed, reports.

**Engineering.** Pure logic in `core/shared/<area>/` with Vitest; routes under
`core/server/api/org/<area>/`; idempotent `scripts/create-<area>.ts` as
`pnpm create:<area>`; `pnpm generate:types` + `pnpm setup:permissions` after
schema changes; module key in `useModules.ts` (fix the `ModuleKey` vs
`MODULE_GROUPS` drift while there).

---

## 3. Phase 1 — Billing engine and the owner ledger

Prerequisite for everything else. Nothing financial is trustworthy until charges
generate themselves and owners can see a running balance.

**Activate Connect first.** Finish
[connect-activation-runbook.md](connect-activation-runbook.md). Add a Settings
toggle for who absorbs processing fees (org vs owner); PayHOA's $2.45 ACH and
3.5% + $0.50 card are the benchmark.

**Schema** (`scripts/create-billing-engine.ts`)
- `payment_schedules`: `cadence` (`monthly | quarterly | semiannual | annual`),
  `amount_source` (`fixed | per_unit_rate | ownership_pct`), `audience` (all
  units or a unit list), `generate_days_ahead`, `last_generated_period`.
- `hoa_organizations`: extend the existing late-fee fields with `late_fee_kind`
  (`flat | percent`), `late_fee_repeat` (`once | monthly`), `late_fee_cap`.
  Keep it to that; no interest tables.
- `payment_methods`: Stripe PaymentMethod on the **connected** account's
  Customer, type, last4, `is_autopay`, `autopay_day`, per member.
- `payment_requests`: add `unit`, `period_start/end`, `source`
  (`schedule | manual | late_fee | plan`), `source_id`.
- `payment_plans` (small): member, total, installment, cadence, next date,
  status. Installments become `payment_requests`. Optional in P1; ship if cheap.

**Engine** (`core/shared/billing/engine.ts`, pure, tested)
- `chargesDueForPeriod(schedule, units, asOf)`: idempotent on
  `(schedule, unit, period)`, ownership-% split, daily proration on the first
  period only.
- `lateFeesToApply(charges, policy, asOf)`.
- `autopayRunsFor(day, methods, openCharges)`.
- Worker `scripts/billing-worker.ts` on the droplet cron, same pattern as the
  digest worker: generate → late fees → autopay → reminders. Each run writes one
  `billing_run` ledger entry.

**Owner UX** (`[slug]/payments` becomes the account ledger)
- Header: balance due, next due date, one "Pay" button that covers every open
  charge across the owner's units.
- Ledger: every charge and payment with running balance, receipt links,
  filters by unit and year. "Download statement" produces a branded PDF (the
  account-history PDF PayHOA advertises for estoppel).
- Autopay card: pick a saved method and a day; confirmation is a ledger entry.
- Reminders: push + email at due-7d, due, past-grace; AI-drafted templates that
  the board approves once, then send automatically (existing outbound rule:
  the template is approved, each send is not a new approval).

**Board UX** (Finances → Charges)
- Generation preview before commit ("42 charges, $18,900, 3 prorated").
- Delinquency: the existing aging report with per-member drill-down and a
  "start reminder sequence" HITL action.

**Tests**: engine math, idempotency, autopay selection, webhook credit paths.
This is the money path ROADMAP flags as untested.

---

## 4. Phase 2 — Live bank data and simple reports

Plaid gives the transparency story its teeth. No journal, no reconciliation
engine. The feed is the truth; HOA Connect annotates it and reports on it.

**Schema** (`scripts/create-bank-feed.ts`)
- `bank_connections`: org, Plaid Item id, encrypted access token, institution,
  `accounts` JSON (id, name, mask, type, current/available balance),
  `last_sync_at`, `status`, `owner_visible` (per account; reserve accounts can
  be board-only).
- `bank_transactions`: org, account, Plaid transaction id, date, amount,
  merchant/name, Plaid category, `category` (org category), `linked_type`
  (`payout | expense | charge_payment | none`), `linked_id`, `visibility`
  override, `note`.
- `finance_categories`: org, name, kind (`income | expense`), seeded from a
  template (dues, assessments, landscaping, insurance, utilities, management,
  repairs, reserve contribution, other). Expenses and feed rows share these.
- `coding_rules`: match on merchant/description/amount range → category,
  `learned_from` (confirmed codings).
- `budgets` + `budget_lines`: fiscal year, category, annual amount (monthly
  optional), `copied_from`. `hoa_organizations.fiscal_year_start_month`.

**Feed pipeline**
- Plaid Link in Settings → Finances → Bank accounts (admin or treasurer).
- Daily sync in the billing worker; CSV upload fallback through the same
  normalizer for banks Plaid lacks.
- Auto-categorize: rules first, then an AI suggestion with confidence, treasurer
  confirms or corrects; corrections become rules. "Uncategorized" is the only
  queue the treasurer works.
- Auto-link: Stripe payouts to feed rows by amount + date; recorded expenses to
  feed rows by amount + vendor. Links are informational, used to avoid double-
  counting in reports and to show an owner "this $4,200 was the roof invoice
  (attached)".

**Reports** (`core/shared/reporting/`, extend `ledger.ts`, all pure)
- Cash balance trend per account and total.
- Cash in / cash out by category, monthly and YTD.
- Budget vs actual by category.
- Dues collected vs billed; delinquency aging (exists).
- Reserve contributions (a category, not a fund engine).
- All return one `ReportTable` shape; one renderer, one PDF/XLSX route reusing
  the email branding tokens for the header. Packets = ordered reports + cover,
  attachable to `hoa_meetings`.

**Owner surface**
- Finances hub in the portal: balances, "where the money went" donut by
  category, the feed (redacted per §2), reports, and uploaded reports (P3).
- Community Ledger entries for: bank connected, month summarized, budget
  adopted.

**Explicitly not**: double-entry journal, chart of accounts, accrual basis,
reconciliation state, fund sub-ledgers, transfer detection beyond a
same-amount hint, vendor payments, 1099, lockbox.

---

## 5. Phase 3 — The bookkeeper's reports as the reference record

The manager or bookkeeper already produces monthly and annual financials. Make
those first-class instead of forcing them into a ledger.

**Schema**: `hoa_financial_reports` (or a typed category on `hoa_documents` if
the fields fit): org, `report_type` (`balance_sheet | income_statement |
budget | budget_vs_actual | reserve_study | audit | tax_return | bank_statement
| other`), `period_start/end`, `fiscal_year`, file, `uploaded_by`, `source`
(`manager | bookkeeper | board`), `published_to_owners`, `notes`.

**Upload UX**: a "Financial reports" area under Finances for admins, treasurer,
and property managers with the `documents` grant. Drag a PDF or XLSX, pick type
and period (the AI pre-fills both from the file), toggle owner visibility.
Publishing writes a ledger entry and notifies owners.

**Owner UX**: the Finances hub lists reports by fiscal year with a period
picker, alongside the live reports from P2, clearly labeled "from your
bookkeeper" vs "live from the bank."

**AI**: ingest into `ai_doc_chunks` (the existing RAG pipeline over
`hoa_documents` already does this for governance and documents; extend the
indexer to the new collection with table-aware chunking for XLSX). Ask the HOA
answers "what was the reserve balance in June" with a citation to the page.
Structured grounding: a tool read over the P2 `ReportTable`s so "what did we
spend on landscaping this year" comes from the feed, not a PDF.

---

## 6. Phase 4 — AI over the financial core

All on existing rails (`ACTION_CATALOG`, autonomy tiers, credits, RAG). Nothing
here moves money or auto-approves outbound.

| What | Rail |
|---|---|
| Categorize feed rows with confidence; learn rules from confirmations | new `categorize_transaction` action, low risk, auto-approvable at tier 2+ |
| Month summary: "September: $18.9k in, $14.2k out, 3 owners past due, reserve +$2k", citing rows | notice (deterministic parts) + drafted narrative |
| Budget draft from last year's actuals with variance notes | `propose_budget` action |
| Delinquency copilot: reminder sequences tuned by `attention.ts`, payment-plan proposals | `send_email` (existing) + `propose_payment_plan` |
| Ask the HOA on the portal home and the public landing (public docs only for anonymous visitors), transcripts reviewable in `admin/ai-spend` | existing `ask.post.ts` + visibility policy |
| State of the Community monthly brief citing feed + reports, board-approved via the HITL outbound gate | existing |
| Statement and receipt wording, reminder templates | existing `draft.post.ts` |

Add tests for the chat runtime and RAG before shipping the financial actions
(ROADMAP's flagged zero-coverage gap).

---

## 7. Phase 5 — Community decisions: votes, and polls inside channels

Two things, one vote rail. `hoa_polls` already has options, `allow_multiple`,
`is_anonymous`, `closes_at`, `target_audience`, tally-only ledger entries, and a
pure access module (`core/shared/polls/access.ts`) that keeps "can run a vote"
apart from "can cast one." Build on it; do not replace it.

**A. Bylaw-grade community votes**
- `hoa_polls`: add `kind` (`poll | survey | vote`), `weighting`
  (`one_per_user | one_per_unit | ownership_pct`), `quorum_pct` (nullable),
  `proxy_allowed`, `questions` JSON for surveys (single, multi, scale, free text;
  validated in `core/shared/polls/`), `result_summary` written at close.
- `hoa_poll_votes`: add `unit` (which seat the ballot counts for) and `weight`
  (resolved at cast time from `hoa_member_units.ownership_percentage`, so a
  later ownership change does not rewrite a closed vote).
- `hoa_poll_proxies`: poll, grantor, grantee, `created_at`. A grantee casts one
  extra ballot per proxy, each tagged with the grantor's unit.
- Tally (`core/server/utils/poll-tally.ts`) grows to weighted counts, quorum
  reached or not, and per-unit dedupe. Still only counts leave the file; the
  ledger entry gains `quorum` and `weighting`. Never who voted which way.
- Board UX: create → choose kind and weighting → open → live tally with a quorum
  meter → certify. Certifying closes the vote, writes the ledger entry, and
  drafts the results announcement through the existing outbound gate.
- Owner UX: one screen, one ballot, a receipt in the ledger. Push on open and
  24h before close. Proxy assignment is a two-tap form for the grantor.
- Results archive by year in the portal, next to meetings.

**B. Polls inside channels**
- `hoa_channel_messages`: add `poll` (FK to `hoa_polls`, nullable). A message
  with a poll renders `PollCard` inline; the poll's `target_audience` is the
  channel's membership, resolved through the channel scope util, and it never
  appears in the community-wide polls list.
- Composer gains a "Poll" button: question, 2–6 options, single or multiple,
  optional close time, anonymous toggle. `kind = poll`, never `vote`; anything
  that counts for the bylaws goes through A.
- Live results in the thread; close writes a comment-style system message
  instead of a ledger entry (board deliberation stays in the channel record,
  which is already exportable).

**C. Ideas boards: visual options, owner submissions, board curation**

The "paint the floor, three colors" and "Courtyard ideas" cases. Not a channel:
a channel is a stream with no lifecycle, and a picture in a message is an
attachment, not an option. This is a small dedicated system that borrows the
comments rail, the reactions rail, the polls table, and the approvals page.

- `hoa_idea_boards`: org, `title`, `slug`, `description`, `cover`, `status`
  (`open | closed | archived`), `who_can_submit` (`owners | members | board`),
  `requires_approval`, `visibility` (`members | public`), `sort`. A board is a
  page: `[slug]/ideas/[board]`, and optionally a landing-page block when public.
- `hoa_ideas`: org, board, `title`, `description`, `images` (M2M files, cap 6),
  `submitted_by`, `unit`, `status` (`submitted | approved | declined | in_vote
  | selected | not_selected | archived`), `review_note`, `reviewed_by`,
  `cost_estimate` (optional), `sort`. Discussion is `hoa_comments` on the idea;
  "support" is an `hoa_reactions` row, aggregated client-side like everywhere
  else, so an upvote costs no new table.
- **Options with visuals**: `hoa_polls.options` entries gain optional `image`,
  `description`, and `idea` (FK). `PollCard` renders visual option cards when
  any option carries an image. Board-authored choices (three swatches) and
  idea-derived choices (three owner submissions) are the same shape.
- **Approval**: submissions with `requires_approval` land in the existing
  `[slug]/admin/approvals` queue beside change requests. Approve publishes to
  the board page and notifies the submitter; decline carries the note. Pure
  transitions in `core/shared/ideas/status.ts`; access decided once, mirroring
  `polls/access.ts` (submit needs a seat; curate needs board or the `feedback`
  grant; a manager can curate but not support or vote).
- **Decision**: "Open a vote" on a board picks approved ideas (or free-form
  visual options), creates a `kind = vote` poll with the Phase 5 weighting and
  quorum, and flips the chosen ideas to `in_vote`. Certifying writes the ledger
  entry ("Courtyard: Option B selected, 34 of 48 units voted", with the image)
  and sets `selected` / `not_selected`. Selected ideas can be promoted to a
  project with one click (`hoa_projects`, like request promotion).
- **Board deliberation** stays in channels: an idea board links to a channel
  the way requests do (`link:requests-channels` pattern), so the argument
  happens in the record and the outcome lands on the page.
- Owner UX: gallery of ideas with images, support counts, and comments; a
  "Submit an idea" sheet with camera upload; when a vote is open, the ballot
  sits at the top of the same page. Push on approval, vote open, and result.
- Ships under the `polls` module key (renamed "Decisions" in Settings) so an
  org that turns off voting loses ideas boards with it.

**AI**: draft the ballot question and neutral option wording from a channel
thread, a meeting agenda item, or an ideas board; cluster a crowded board into
themes; summarize survey free-text answers at close. Image generation is out
of scope; owners upload their own visuals.

---

## 8. Phase 6 — Amenity reservations

`hoa_amenities` is landing-page content today (title, icon, description, image).
Make the same rows bookable.

- `hoa_amenities`: add `reservable`, `capacity`, `hours` JSON (per weekday),
  `slot_minutes`, `max_hours_per_booking`, `advance_days`, `requires_approval`,
  `fee_amount`, `deposit_amount`, `rules` (short text), `member_visible`.
- `hoa_amenity_reservations`: org, amenity, member, unit, `starts_at`,
  `ends_at`, `status` (`requested | confirmed | cancelled | completed`),
  `guests`, `note`, `charge` (FK to `payment_requests` when a fee applies),
  `approved_by`.
- Conflict check and slot generation in `core/shared/amenities/` (pure: hours,
  capacity, overlap, advance window, per-member caps). Fees become a
  `payment_requests` row with `source = amenity`, paid at booking through the
  P1 checkout; deposits are the same row with a refundable flag the treasurer
  releases by hand.
- Owner UX: Amenities card on the portal home → pick amenity → pick day and
  slot on a simple availability strip → confirm (and pay if a fee). Three taps.
  Push on confirmation and a reminder the day before. Cancel from the same card.
- Board UX: calendar view per amenity, approve or decline requests from the
  notification center, block-out dates for maintenance.
- Ledger: nothing per booking; a monthly "N reservations, $X in fees" summary
  entry keeps the Community Ledger readable.
- Ships as a `amenities` module key so orgs without shared amenities never see it.

---

## 9. Phase 7 — SMS as a per-org add-on

Email and push already carry every notification. SMS is a third channel on the
same events, sold per org.

- Twilio Messaging Service per org (number provisioned when the add-on is
  enabled; 10DLC registration handled once at the platform level with per-org
  campaign metadata). Priced in `core/shared/billing/addons.ts` as a monthly
  fee plus a message allowance; overage billed per message.
- `hoa_members`: `phone_sms`, `sms_consent_at`, `sms_opt_out_at`. Double opt-in
  by texting a code; STOP handling via Twilio webhook writes the opt-out.
- `core/shared/notifications/preferences.ts`: SMS becomes a per-category
  channel next to email and push, respected at send time in the same fan-out
  that `sendPushToUser` uses. Categories: payment reminders, urgent
  announcements, amenity confirmations, vote open/close. Not channel chatter.
- Bulk texting from the Communications compose page as a delivery option
  beside email, gated by `communications:send`, with a character counter and
  the same audience resolution.
- Inbound replies: Twilio webhook → a comment on the originating record when
  the text carried one, otherwise a message in a board-only "SMS replies"
  channel.
- Automated voice calls (PayHOA's fallback for owners with no email): Twilio
  text-to-speech of the same message. Optional, a few hours once SMS exists.

---

## 10. Later, if an org asks

- **Fines to charges.** A violation request's `fine_amount` creates a
  `payment_requests` row with `source = fine`, board-only. One small PR once P1
  exists. Everything else in compliance stays as-is.
- **Mailroom.** Lob mailing of invoices with a payment slip, and of any PDF
  letter, for owners with no email or for notices that must be mailed. Per-
  piece add-on pricing. Worth it only when an org has offline owners.
- **Resale packets.** When a unit sells, the title company or lender requests
  governing docs, budget, reserve balance, and an estoppel letter (seller's
  balance, fees due at closing). Self-serve request page with a pass-through
  fee, assembled from P2 reports and P3 documents, treasurer approves. Pairs
  with an ownership-transfer wizard that hides the prior owner's history from
  the buyer. Highest value of this list; it mostly reads what P1–P3 create.
- **Calendar.** A unified view over meetings, project events, amenity bookings,
  and vote deadlines with iCal feeds and RSVP.
- **Platform.** 2FA via Directus TFA, a published security and continuity
  page, AI-assisted CSV import wizard (units, owners, balances), Google
  Calendar.
- **Never under this scope.** Vendor bill pay, check printing, vendor bank
  details, 1099 e-file, lockbox, double-entry GL, human bookkeeping services.

---

## 11. Sequencing

Two spines that do not depend on each other:
- **Money:** P1 → P2 → P3 → P4. P3 can start during P2.
- **Community:** P5 (votes + channel polls) and P6 (amenities) are independent
  of each other and of the money spine, except that amenity *fees* use the P1
  checkout. P7 (SMS) is last because every earlier phase adds events it can
  carry.

Interleave them: a community phase between money phases keeps releases visible
to owners while the financial core is under construction.

| Phase | Weeks (est.) | Ships | Sellable as |
|---|---|---|---|
| **P1 Billing engine** | 3–4 | Connect live, schedules that generate, autopay, late fees, owner ledger + PDF statement, multi-unit checkout, reminders | "Dues on autopilot, into your own account" |
| **P5 Decisions: votes, channel polls, ideas boards** | 3 | Per-unit and weighted votes, quorum, proxies, surveys, certify-and-announce; polls in the channel composer; ideas boards with image submissions, board approval, visual ballots, promote-to-project | "Show three colors, let the building decide" |
| **P2 Live bank + reports** | 4–5 | Plaid, feed with redaction, categories + rules, links to payouts/expenses, budget, 6 reports, PDF/XLSX packets | "Every owner sees the bank balance" |
| **P6 Amenity reservations** | 1–2 | Bookable amenities, availability, approval, fees through checkout, board calendar | "Book the clubhouse in three taps" |
| **P3 Reference reports** | 1–2 | Upload, type/period, publish, portal surface, RAG ingest | "Your bookkeeper's reports, one tap away" |
| **P4 AI over money** | 2–3 | Categorization, month summary, budget draft, delinquency copilot, Ask the HOA everywhere, runtime tests | "An AI treasurer's assistant you can audit" |
| **P7 SMS add-on** | 1–2 | Twilio per org, opt-in, per-category channel, bulk texts, inbound replies, optional voice | "Reach owners who don't read email" |

Roughly four months end to end, three for the money spine alone.

---

## 12. Open decisions (owner's call; none block P1)

0. **Default weighting for community votes.** Recommend `one_per_unit` as the
   default with `ownership_pct` selectable per vote; most condo bylaws count
   by unit, and the weight is frozen on the ballot row either way.

1. **Owner visibility of the bank feed: default on or off per org?** Recommend
   default on for operating accounts with the redaction in §2, off for reserve
   accounts, both toggles in Settings. This is the transparency flagship, so
   default-on is the brand.
2. **Payment plans in P1 or later?** Recommend later unless a pilot org needs
   them; delinquency copilot in P4 can propose them as manual charges first.
3. **Fee pass-through default.** Recommend owner-pays for card, org-absorbs for
   ACH, editable per org.
4. **`hoa_financial_reports` as its own collection or a typed document
   category.** Recommend its own collection: period and type fields drive the
   fiscal-year picker and the RAG chunking, and the export map stays explicit.
5. **Plaid production access.** Requires Plaid's review; start the application
   during P1 so it does not gate P2.
