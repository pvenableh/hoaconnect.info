# Spec — correcting a charge (Phase 5c)

Plan: `docs/plan-role-first-ux.md` §7, "Queued: correcting a charge". Builds on `docs/spec-money-approvals.md` (the rule, `waive`, the charge cancel lock). Decisions confirmed with the operator 2026-11-18 (the six below, each as recommended). Every organization on the instance is test data, so the schema change comes with no migration or backfill.

> A charge an owner owes is income the community is owed. Raising it, renaming it or moving its date before it is due gives up nothing, so an admin may do it. Lowering it, moving it to another household or taking it back gives up income, so the board approves it, except for one short window to undo a fresh mistake. Nothing is deleted, and every change is in the Ledger.

## What exists today (read from the code 2026-11-18)

- No policy updates or deletes `payment_requests`: `REMOVED_ADMIN_RULES` in `scripts/lib/admin-scope-perms.ts:201` (the prompt said `money-approval-perms.ts`; that file holds the lock's plan, `CHARGE_WRITES`). The HOA Admin policy keeps create and read.
- The New charge form (`app/components/Payment/ChargeForm.vue`) creates through the Directus proxy with the admin's token, status `active` at once, and sets no `source`: a hand-entered charge has `source` empty.
- Server writers, all on the app's token: Mark Paid (`core/server/api/org/payments/record.post.ts`), the Stripe webhook (`updatePaymentRequest`), the reminder tick (`stampCharges`: `reminder_sent`, `reminder_sent_at`, `metadata.reminders`), the waive route (`waiver`) and `settleWaiver` (`status: canceled`). The billing worker (`scripts/billing-worker.ts`) inserts schedule charges (`source: schedule`) and late fees (`source: late_fee`, `source_id` = the charge), flips past-grace charges to `overdue`, and stamps its reminders.
- A late fee is flat or a percent of what remains, capped per charge, charged once or monthly when `due_date + grace_days` has passed (`lateFeesToApply`). Waiving a charge today leaves its late fees owing.
- A Stripe payment is split across the charges it names, oldest due first, when the webhook arrives; each charge takes up to what remains, the last takes any overpayment. It does not skip a canceled charge.

## The six decisions

1. **Lowering the amount is a partial waiver.** Ask to waive takes an optional amount; the same rule decides it; no small-amount limit (decision 17).
2. **A 24-hour window to withdraw.** A charge entered by hand, nothing paid, no reminder sent, no late fee charged, within 24 hours of entry: an admin may withdraw it without the board. It is canceled and kept on record. After that it is a waiver.
3. **The wrong household is a `move` approval**, only while nothing is paid. Approved, the charge moves and its unpaid late fees are canceled. Both households are told.
4. **A full waiver takes the charge's unpaid late fees with it**, in the same approval, listed so the approvers see the total. A partial waiver leaves them; each late fee can still be waived on its own.
5. **The owner hears when what they owe, or when it is due, changes**: amount up or down, due date, withdrawn, waived, moved to or away from them. Not title, description or notes.
6. **Admins make the free corrections** (as they create charges today). **Asking** for a partial waiver or a move is `money:enter`, like Ask to waive. The HOA Admin role approves nothing.

## What each correction does

A charge is **open** while its status is `active`, `partially_paid` or `overdue` (`isWaivableCharge`). Only an open charge is corrected. One approval at a time: while a `waive` or `move` is open on a charge, the amount, due date and household cannot change, and no second approval opens (409). Title, description and notes stay free.

| Change | Who | When | Effect |
|---|---|---|---|
| Title, description, notes | Admin | Open | Saved. `charge_corrected` (board). The owner is not told |
| Amount up | Admin | Open, no approval open | `amount` and `amount_remaining` rise by the difference; status unchanged. `charge_corrected`; the owner is told |
| Amount down | `money:enter` asks | Open, no approval open, the cut less than what remains | A `waive` approval with `amount`. Approved: `amount` and `amount_remaining` drop by the cut (or by what remains, if payments came in meanwhile and left less; the charge is then `paid`). Late fees stay |
| Waive all that remains | `money:enter` asks | Open, no approval open | As today, plus: its unpaid late fees are canceled in the same approval, and their open waivers close as superseded |
| Due date | Admin | Open, not yet due (`due_date` today or later, or none), no late fee charged on it, no approval open; the new date today or later | Saved. `charge_corrected`; the owner is told. Reminder stages already sent stay sent (a moved date does not resend them). An overdue charge's date is not changed: waive the fees, or waive and enter again |
| Household | `money:enter` asks | Open, nothing paid on it or on its late fees, no approval open; the new household an active member of the community | A `move` approval with the proposed household. Approved: `member` and `unit` change (the unit is the new member's), its unpaid late fees are canceled, both households are told. `charge_moved` (board) |
| Withdraw | Admin | Entered by hand (`source` empty or `manual`), not a late fee, `date_created` within 24 hours, `amount_paid` 0, no transaction, no reminder sent (`reminder_sent` false, `metadata.reminders` empty), no late fee on it, no approval open | `status: canceled`, `withdrawn_at`, `withdrawn_by`, `withdrawn_reason`. `charge_withdrawn` (board); the owner is told |

Amount down through `PATCH` is refused (422: "Lowering a charge gives up income: Ask to Waive part of it."). Lowering to zero is the full waiver.

**At settle** (the rule met), every condition is checked again from the charge as it stands. A charge paid in full or canceled meanwhile closes the approval as `superseded` (Session 5). A `move` whose charge took a payment meanwhile closes as `superseded` too, and the requester is told why. Settling closes any other open approval on the same charge (the race fix in `68b3830`).

**A payment in flight.** A Stripe payment that arrives after a correction lands on what the charge says then. A payment on a charge withdrawn or waived meanwhile is still recorded on it (the webhook records money that arrived); the board refunds it in Stripe. Unchanged from today; not fixed here.

## Schema (one script in the house style, `scripts/add-charge-corrections.ts`)

| Collection | Change |
|---|---|
| `money_approvals` | `kind` gains `move`. New: `amount` (decimal 10,2, nullable: a partial waiver's cut; empty is all that remains), `proposed` (json, nullable: a move's `{ member, unit, from_member, from_unit }`, written at request, read at settle) |
| `payment_requests` | New: `withdrawn_at` (timestamp), `withdrawn_by` (M2O `directus_users`, SET NULL), `withdrawn_reason` (text). All read-only in the Directus UI |
| Permissions | None change. The script's dry run also lists every rule on `payment_requests` and fails if any policy has update or delete |

`pnpm add:charge-corrections` is the dry run; `--apply` writes. Idempotent. Then `pnpm generate:types`. I show the dry run and ask before `--apply`.

## Routes

Each checks the org, reads the charge through the community filter (`loadCharge`: another community's charge, or one whose household is another community's, is 404), applies the rules on the server and writes the Ledger entry. The rules are pure functions in `core/shared/money/charge-corrections.ts`, shared with the page so it shows only what the server will accept.

| Route | Gate | Does |
|---|---|---|
| `PATCH /api/org/money/charges/[id]` | Admin (`checkAdminAccess`) | Title, description, notes, amount (up only), due date. Body `{ orgId, title?, description?, notes?, amount?, due_date? }`. Only fields that differ are written. 409 when the charge is not open or an approval is open and amount or due date is sent; 422 for amount down or a due date the rules refuse |
| `POST /api/org/money/charges/[id]/withdraw` | Admin | Body `{ orgId, reason }` (required). 409 with the rule that failed ("It has been more than 24 hours: Ask to Waive it.") |
| `POST /api/org/money/charges/[id]/waive` (exists) | `money:enter` | Gains `amount?`: present, a partial waiver (more than 0, less than what remains); absent, all that remains and its unpaid late fees. Refused while any approval is open on the charge, not only a waiver |
| `POST /api/org/money/charges/[id]/move` | `money:enter` | Body `{ orgId, member, reason }`. Opens a `move` approval, tells the approvers (essential) |
| `GET /api/org/money/charges` (exists) | `money:read` | Each row adds `approval_pending: { kind, amount } \| null` (keeps `waiver_pending`), `late_fees_open` (the sum of its unpaid late fees), `withdrawable` (the window rule, server time) and `due_date_editable`. `viewer` adds `canCorrect` (admin) beside `canEnter` |
| Approvals routes (exist) | as today | The charge subject adds `waive_amount`, `late_fees` and, for a move, `from` and `to` households. `decide` accepts `move` |

`settleApproval` hands a `move` to a new `settleMove`; `settleWaiver` handles the partial cut and the late fees.

## Ledger (all board: each names a household, like `payment_recorded`)

| Event | Summary |
|---|---|
| `charge_corrected` (new) | "Pat Park changed a $300.00 charge to Bob Diaz for March dues: amount $300.00 → $350.00, due date Dec 1 → Dec 15." Title, description and notes say what changed, not the old text. Payload: each field's before and after |
| `charge_withdrawn` (new) | "Pat Park withdrew a $300.00 charge to Bob Diaz for March dues, entered in error: Wrong month." |
| `charge_waived` (exists) | Partial: "$50.00 of a $300.00 charge to Bob Diaz for March dues was waived, approved by Pat Park (President) and Sam Lee (Secretary): Pool closed." Full with late fees: "…was waived with its late fees ($25.00), approved by…". Payload adds `partial` and `late_fees` (ids and amounts) |
| `charge_moved` (new) | "A $300.00 charge for March dues was moved from Bob Diaz to Carol Eve, approved by Pat Park (President) and Sam Lee (Secretary): Wrong unit." With late fees canceled: "…and its late fees ($25.00) were canceled." |
| `money_decision` (exists) | Takes the new phrasing: "…approved waiving $50.00 of a $300.00 charge to Bob Diaz for March dues", "…approved moving a $300.00 charge for March dues from Bob Diaz to Carol Eve" |

## Notices (`notifyUsers`, category `payment`)

- **The owner** (the household's user, if it has one), not essential, path `/payments`:
  - Amount up: "Your charge for March dues is now $350.00 (was $300.00)."
  - Due date: "Your charge for March dues is now due Dec 15 (was Dec 1)."
  - Withdrawn: "Your $300.00 charge for March dues was withdrawn: it was entered in error."
  - Waived: "$50.00 of your charge for March dues was waived. You now owe $250.00." / "Your $300.00 charge for March dues was waived."
  - Moved: to the old household, "A $300.00 charge for March dues was removed from your account: it was entered for the wrong household."; to the new one, "A $300.00 charge for March dues, due Dec 1, was added to your account."
- **Approvers**, when a partial waiver or a move opens: as today, essential. "Waiving $50.00 of a $300.00 charge to Bob Diaz for March dues needs your approval." / "Moving a $300.00 charge for March dues from Bob Diaz to Carol Eve needs your approval."
- **Whoever asked**: each outcome, as today.

## The Charges page and its panel

Shown only where the server will accept it (`viewer.canCorrect`, `viewer.canEnter`, and the row's flags). Each lives in the row's overflow menu and the panel's, beside Ask to Waive.

| Control | Who sees it | Opens |
|---|---|---|
| **Edit Charge** | Admins, open charge | `AppBottomSheet`: title, description, notes, amount (no lower than now; under it, "To lower it, Ask to Waive part of it."), due date (`DateInput`; disabled with the reason when `due_date_editable` is false, or while an approval is open) |
| **Withdraw Charge** | Admins, `withdrawable` | `useConfirm` prompt, reason required: "Withdraw “March dues”? Bob Diaz will no longer owe $300.00. You can withdraw a charge only within 24 hours of entering it, before anything is paid or reminded." |
| **Ask to Waive** | `money:enter`, open, no approval open | Becomes a sheet: "All that's owed" ($300.00, plus late fees $25.00 when there are any) or "Part of it" (an amount), and the reason |
| **Move to Another Household** | `money:enter`, open, nothing paid, no approval open | Sheet: the household (the community's active members, the current one left out) and the reason |
| Pending | Everyone who reads | "Waiver awaiting approval", "Waiver of $50.00 awaiting approval" or "Move awaiting approval" in place of the controls that are locked |
| Withdrawn | Everyone who reads | Status "Withdrawn" (not "Canceled") and, in the panel, when, by whom and why |

The Approvals page names partial waivers and moves in its headline ("Waive $50.00 of $300.00 owed by Bob Diaz for March dues", "Move $300.00 for March dues from Bob Diaz to Carol Eve") and lists a full waiver's late fees under it.

## Tests to name

- `tests/shared/charge-corrections.test.ts`: the pure rules. Withdraw window (each condition, the 24-hour edge, `source` empty or `manual` only, a late fee never). Due date editable (not due, overdue, late fee charged, a past new date, no date). Amount up only. The partial cut against what remains. Settle maths (a cut larger than what remains after a payment leaves the charge paid). The phrases.
- `tests/server/charge-corrections.test.ts`: `PATCH`, `withdraw` and `move`: each gate (an admin, a board seat without admin, a manager with the projects grant, an owner), the org filter, 409 while an approval is open, 422 for amount down, the Ledger entry and who is told. Waive with an amount, and a full waiver cancelling its late fees and closing their waivers. `move` settle: the charge moves, its late fees are canceled, both households told, superseded if it took a payment meanwhile.
- `tests/composables/useChargesResource.test.ts`: each control appears only where the row's flags and the viewer allow.
- `tests/scripts/charge-corrections-perms.test.ts`: the script's plan, and that no policy has update or delete on `payment_requests` after it.
- `tests/shared/ledger-visibility.test.ts`: the three new events are board-only.

## Commits (each gated)

1. Shared rules, the schema script and its test (the dry run shown, `--apply` asked).
2. `PATCH` (free corrections), `charge_corrected`, the owner notices.
3. `withdraw`, `charge_withdrawn`.
4. `waive` with an amount, and a full waiver taking its late fees.
5. `move`, `settleMove`, `charge_moved`.
6. The Approvals routes and page: partial waivers and moves.
7. The Charges page and panel.

## Later (not in this spec)

- **A draft for new charges.** The withdraw window covers a fresh mistake; a draft would stop one reaching the owner at all.
- **A due-date correction after a charge is overdue**, through an approval that cancels the late fees the new date would not have caused.
- **The webhook skipping a canceled charge** when it splits a payment.
- **A unique key on open approvals** per charge, so two requests at the same instant cannot both open (Session 5's note).
