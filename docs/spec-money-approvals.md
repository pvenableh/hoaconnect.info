# Spec — money approvals (decision 16)

Plan: `docs/plan-role-first-ux.md` §6, decisions 16 and 17. Builds on `docs/spec-capability-nav.md` (the `money:read` routes). Written and confirmed with the operator 2026-11-14. Every organization on the instance is test data, so the schema changes below come with no migration or backfill.

> Money is overseen, not delegated: every board seat reads the books; no single officer writes them. Money going out needs approval by two of the operating committee (President, Treasurer, Secretary), or a board majority where there is no committee, never by the person who entered it, and each approval is in the Ledger.

## What the app can and cannot stop

The app records money. It does not move it: a treasurer pays a vendor from the bank, not from HOA Connect. So the app cannot prevent a payment. What it can do:

1. **Make approval the normal path.** Every expense is entered, approved by two people, then recorded as paid. There is no amount below which approval is skipped (decided).
2. **Make spending without approval loud.** Recording an expense as paid before it is approved is allowed, because the books must match the bank (decided). The expense is flagged for good, the whole board is notified, and the approval still has to happen afterwards.
3. **Make the record permanent.** Nothing past draft can be deleted, only voided, and every step is a Ledger entry.

Spending that is never entered at all is caught only by comparing the books with the bank. That is reconciliation, a later phase (see "Later").

## What needs approval

One approval object, `money_approvals`, has three kinds and the same rule for each:

| Kind | Subject | On approval |
|---|---|---|
| `spend` | An expense (money going out) | The expense becomes `approved` (or, if already paid, ratified) |
| `void` | An expense that was approved or paid | The expense becomes `void` |
| `waive` | An owner charge: cancelling or waiving it gives up income the community is owed (decided) | The charge becomes `canceled` |

## Lifecycle of an expense

| State | Means | Moves to |
|---|---|---|
| `draft` | Being written; seen only by people who can enter expenses | `submitted` · deleted |
| `submitted` | A `spend` approval is open | `approved` · `rejected` · `paid` (flagged) · `void` |
| `approved` | The rule is met | `paid` · `void` (by a `void` approval) · `submitted` (new round, if amount, vendor or payee changes) |
| `rejected` | The rule can no longer be met | `submitted` (edited, new round) · `void` |
| `paid` | Recorded as gone out by a person, with a date and a reference | `void` (by a `void` approval) |
| `void` | Cancelled; stays on record | — |

A paid expense whose approval was not met first keeps `paid_without_approval = true`. Its `spend` approval stays open: approvers can still approve (ratify) or reject it, and either way the flag stays.

## The rule

The rule is a pure function in `core/shared/money/approval-rule.ts`. It decides from three inputs: the current board seats, the approval's excluded people, and the decisions so far. Routes call it; the client never computes it.

- **Seats.** Published, current-term rows in `hoa_board_members` (the same rule as `isCurrentBoardTerm`). One person counts once, whatever offices they hold.
- **Excluded.** The person who asked for the approval (who entered the expense, asked for the void or asked for the waiver) can never decide it. So can anyone who changed the amount, vendor or payee in this round.
- **Committee mode.** The committee is whoever holds President, Treasurer or Secretary. It applies when at least two committee members are not excluded. Two of them must approve.
- **Majority mode.** Applies when fewer than two committee members are eligible. More than half of all seats must approve (`floor(seats / 2) + 1`). Excluded people count as seats but cannot vote.
- **Rejected** as soon as approval can no longer be reached: the rejections leave fewer eligible people than approvals still needed. With two eligible committee members, one rejection is enough.
- **Cannot be approved.** A board too small for either rule, such as a single seat, shows this state. An expense in it can still be recorded paid, flagged as paid without approval.
- **Recomputed at each decision** from the seats as they stand then. A decision keeps the office its maker held when they made it, so it stays valid if they later leave the board.
- **The HOA Admin role approves nothing** (decided). Approval comes from board seats only, which closes Session 2 operator TODO 4. An admin who also holds a seat approves as that seat.

## Who does what

| Action | Who | Gate |
|---|---|---|
| Read the books and every approval | Every board seat, admins | `money:read` (exists) |
| Enter, edit, submit, record paid, upload a receipt; ask for a void or a waiver | Every board seat, admins, a manager with the `projects` grant | `money:enter` (new; replaces the unused `money:write`) |
| Approve or reject | People the rule makes eligible for that approval | The rule |
| Delete a draft, or void a submitted expense that has no decisions | The person who entered it, or an admin | `money:enter` |

Entering is safe to give widely, because nothing an enterer does counts as approval.

## Edits

- `draft`: anything.
- `submitted` or `approved`: notes, category and receipt can change freely. A change to the amount, vendor or payee closes the open approval as `superseded` and opens a new round. The person who made the change is excluded from it, and the expense goes back to `submitted`.
- `paid`: notes and receipt only. To correct a paid expense, void it and enter it again.

## Schema (one script in the house style, `scripts/add-money-approvals.ts`)

| Collection | Change |
|---|---|
| `money_approvals` (new) | `organization`, `kind` (spend · void · waive), `expense` (M2O, nullable), `charge` (M2O `payment_requests`, nullable), `round` (int), `state` (pending · approved · rejected · cannot_approve · superseded), `mode` (committee · majority), `needed` (int), `requested_by` (user), `excluded` (json, user ids), `reason`, `date_created`, `decided_at` |
| `money_approval_decisions` (new) | `approval` (M2O), `decided_by` (user), `office` (the title held then), `decision` (approve · reject), `note`, `date_created`. Unique on approval and `decided_by`. Append-only |
| `payment_expenses` | status gains `submitted`, `rejected` and `void`. New fields: `entered_by` (user), `approval` (M2O, the current `spend` approval), `paid_by` (user), `paid_reference` (check number or transfer reference), `paid_without_approval` (bool), `void_reason` |
| `payment_requests` | `waiver` (M2O, the open or last `waive` approval) |
| Permissions | The HOA Admin policy loses create, update and delete on `payment_expenses`, and cannot set a charge's status to `canceled` (the build checks which Directus mechanism holds: a validation rule, or charge updates moved to routes). No policy writes the two new collections; reads go through the routes. Members get no access. Directus's own administrators (platform staff) are outside this |

## Routes (the only way to write)

Each route checks the org, reads rows through the org filter, applies the rule on the server and writes the Ledger entry.

| Route | Does |
|---|---|
| `POST /api/org/expenses` | Create a draft, or submit straight away (`money:enter`) |
| `PATCH /api/org/expenses/[id]` | Edit; opens a new round when the amount, vendor or payee changes |
| `DELETE /api/org/expenses/[id]` | Drafts only |
| `POST /api/org/expenses/[id]/submit` | Draft to submitted; opens the `spend` approval and notifies the eligible approvers |
| `POST /api/org/expenses/[id]/pay` | Record paid with a date and a reference; replaces `record.post.ts`. Sets the flag and notifies the whole board if not yet approved |
| `POST /api/org/expenses/[id]/void` | Voids a draft or an undecided submission at once. On an approved or paid expense it opens a `void` approval |
| `GET / POST /api/org/expenses/[id]/receipt` | Serve the receipt to `money:read` holders; upload one with `money:enter` |
| `POST /api/org/money/charges/[id]/waive` | Opens a `waive` approval with a reason (`money:enter`) |
| `GET /api/org/money/approvals?view=open\|awaiting-me\|all` | Approvals with their subject, the rule's view and `canDecide` for the caller (`money:read`) |
| `GET /api/org/money/approvals/[id]` | One approval, its decisions, who is eligible and who is excluded |
| `POST /api/org/money/approvals/[id]/decide` | Approve or reject, with an optional note; 403 for anyone the rule excludes |

`GET /api/org/expenses` (exists) adds `approval.state`, `approval.needed` and the count of approvals so far.

## Ledger

| Event | Visibility | Summary |
|---|---|---|
| `money_decision` (new) | board | "Jane Doe (President) approved $2,400.00 to Acme Roofing for gutter repair." |
| `expense_approved` (new) | owners | "$2,400.00 to Acme Roofing for gutter repair was approved by Jane Doe (President) and Sam Lee (Secretary)." |
| `expense_recorded` (exists) | owners | Unchanged sentence. The payload adds `approved_by`, `paid_by`, `paid_reference` and `paid_without_approval`; with the flag set, the summary ends "…before it was approved." |
| `expense_voided` (new) | owners if it was approved or paid, else board | "…was voided: {reason}." |
| `charge_waived` (new) | board (it names a household, like `payment_recorded`) | "A $300.00 charge for {title} was waived, approved by … : {reason}." |

## Notifications (`core/shared/notifications/events.ts`)

- An approval opens, or a new round starts: the eligible approvers. Essential class.
- Each decision: whoever asked for the approval.
- Approved or rejected: whoever asked for it, and for `spend`, everyone who can record it as paid.
- Paid without approval: every board seat. Essential class, so no one can opt out.

## Nav (registry)

- `money-approvals`, label "Approvals", path `/approvals`, needs `money:read`. It sits in the member layout after Money, and in the admin Money hub as a pill.
- Every board seat sees what is waiting, who has decided and what each item still needs. Approve and Reject show only where the server says `canDecide`.
- The Charges page's Cancel becomes "Ask to waive", shown to `money:enter` holders. A charge with a waiver pending shows that state instead.
- The home "Assigned to me" list (Phase 9) will show the items waiting on the viewer.

## Tests to name

- `tests/shared/money-approval-rule.test.ts`: committee and majority modes, the fallback between them, exclusion of the requester and of anyone who reshaped the round, one person holding two offices, the rejection threshold, `cannot_approve`, a seat change between decisions, and an admin with no seat.
- `tests/server/money-approvals.test.ts`: every route's gate and org filter, a new round when the amount changes, pay before approval (flag and board-wide notice), void and waive approvals, and that the client's `canDecide` is never trusted.
- A permissions check: after the script, the HOA Admin policy has no write on `payment_expenses` or the two new collections, and cannot cancel a charge.

## Later (not in this spec)

- **Reconciliation.** Import a bank statement or feed, match it against paid expenses, and flag payments no one entered. This is the check that catches spending outside the app, and a candidate paid feature.
- **Pre-authorised recurring bills.** A vendor contract approved once covers its monthly bills up to its amount (Phase 7, `hoa_vendor_contracts`).
- **Per-community settings.** A limit below which one approval is enough, the vice president on the committee, or majority mode always.
- **Refunds.** Stripe refunds happen in Stripe, and the webhook already records them (`payment_refunded`).
