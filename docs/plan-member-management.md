# Member management — status, role, residency, and invitation gating

> Source of truth for this workstream. Started 2026-08-26. The parent program's
> plan is `docs/plan-earnest-parity-round2.md`; this is a separate workstream
> because it is feature work, not parity work.

## Why

Peter's ask: manage members as active / archived, change their role
(admin vs member), and distinguish **owner** from **tenant** — so that
invitations go only to active members, and an accepted invitation knows the
person's role *and* residency.

## What already exists — most of it

Investigated against production Directus before planning. The schema is largely
in place; this is not a greenfield build.

| thing | state |
|---|---|
| `hoa_members.status` | ✅ `active \| inactive \| pending \| archived` |
| `hoa_members.member_type` | ✅ `owner \| tenant` |
| `hoa_members.role` | ✅ FK → HOA Admin / HOA Member / Property Manager / Administrator |
| `hoa_member_units` junction | ✅ with `is_primary_unit`, `start_date`, `end_date`, `ownership_percentage` |
| `MembersPage.vue` edit form | ✅ already covers status, role, member_type |

## The gaps — with evidence

**A. Every accepted invitation is hardcoded to owner.**
`core/server/api/hoa/accept-invitation.post.ts:158`:

```js
member_type: "owner", // Default to owner, can be changed later
```

Role *is* carried correctly from the invitation. Residency is the one that is
fabricated, for every member who has ever joined by invite.

**B. Invitations cannot carry residency at all.** `hoa_invitations` has no
`member_type` field, and `invite-member.post.ts:14` destructures
`{ email, firstName, lastName, organizationId, roleId }` — no residency. This is
the root cause of A; A cannot be fixed without B.

**C. Archived is a one-way trapdoor in the UI.** The list query hard-filters
`status: { _in: ["active", "inactive", "pending"] }`
(`MembersPage.vue:108`) and the member form's status control offers no
`archived`. So an admin cannot archive someone, see who is archived, or restore
them. 27 people are currently in that state, invisible.
*(The `archived` option at `MembersPage.vue:1207` belongs to the board-terms
form, not member status — do not mistake it for this.)*

**D. Invitations are not gated on member status.** `invite-member.post.ts`
409s on *any* existing member, with a message that does not distinguish
"already active here" from "archived former resident".

## ⚠️ Two orthogonal axes — do not collapse them

The single most important distinction in this workstream, and one this plan got
wrong once before Peter corrected it:

| axis | field | meaning | 1033 Lenox |
|---|---|---|---|
| **Membership** | `hoa_members.status` | Is this person a current member of the community? | 59 active, 27 archived |
| **Portal onboarding** | `hoa_members.user` is set | Have they ever signed up for HOA Connect? | 1 of 59 |

**An active member who has never signed in is completely normal.** `active`
describes the person's standing in the HOA — a current owner or tenant —
**not** their use of this app. Management needs those records precisely
*because* the person is a real resident who is not on the portal yet.

So: **never demote a member's `status` because they have no account.** The
"invited" state is not a membership status at all — it already lives in
`hoa_invitations.invitation_status`, which is where it belongs.

### What that means for the 85-invitation batch

1033 Lenox: **86 members = 59 active + 27 archived.** Of the 59 active, **58
have no portal account.**

The batch is **58** — active members not yet onboarded. The 27 archived are
former residents and must be excluded; the 1 remaining is already signed up.

## Decisions taken

1. **Residency moves to the unit link** (`hoa_member_units`), not the member.
   Per-unit is the more correct model: it can represent someone who owns one
   unit and rents another, and it gains move-in/move-out history from the
   junction's existing `start_date` / `end_date`.
2. **An invite to an archived member offers to restore — it never auto-restores.**
   A 409 that says *why*, plus an explicit Restore action. A typo'd email must
   not silently reactivate a former resident's account.
3. **Unlinked members are surfaced in the admin UI, not backfilled up front.**
   See the finding below. The admin gets an alert icon and a way to link a
   member to a unit, or create a unit for them.
4. **Portal onboarding is shown as its own axis, never as a membership status.**
   The members UI surfaces "has an account / invited / not yet invited"
   alongside `status`, so an admin can see which *active* owners and tenants are
   not on the portal yet. No member is ever demoted out of `active` for not
   having signed in. See Phase 5.

### The finding that shaped decision 3

Unit-link coverage is wildly uneven, and a clean cutover would break a live org:

| org | active members | with a unit link |
|---|---|---|
| 1033 Lenox | 59 | **55** |
| **605 Lincoln Road** | 33 | **0** |
| Harborview Lofts (demo) | 6 | 0 |
| The Beaumont Residences (demo) | 5 | 0 |
| 11 Lincoln | 2 | 2 |

605 Lincoln Road is **live in production** with a verified custom domain. A pure
move would strand all 33 of its active members with no residency.

**Therefore:** `residencyFor(member)` prefers the unit link and **falls back to
`hoa_members.member_type`** while links are missing. This is a transition
mechanism with a visible end state — the alert icon drives the gap to zero —
not a permanent dual source of truth. 1033 gets true per-unit residency
immediately; 605 keeps working untouched.

**Blast radius:** 34 files read `member_type`, including email audience
targeting (`EmailComposePage.vue`, `email-merge.ts`, `sendEmailJob.ts`,
`audience/index.vue`), `OccupancyWidget.vue`, `useHomeGlances.ts` and the
directory. Several decide **who receives mail**. The resolver is what lets these
migrate one at a time instead of in one sweep.

## Phases

### Phase 1 — Invitations carry residency *(fixes A + B)* — ✅ SHIPPED 2026-08-26

**The bug was not what the plan first said.** `InviteMemberForm.vue` has
*always* had a "Type" control offering Owner / Tenant / Property Manager, and
has always POSTed it as `personType` — along with a `unitId`. The endpoint
destructured neither. So the admin's answer was **discarded, not missing**, and
`accept-invitation` then hardcoded `member_type: "owner"` for everyone. No UI
change was needed.

Shipped:

- `scripts/add-invitation-member-type.ts` (+ `pnpm add:invitation-member-type`)
  — adds `hoa_invitations.member_type`, mirroring `hoa_members.member_type`
  exactly (nullable string, 255, same two choices). Idempotent; verified by
  running it twice.
- `core/shared/members/residency.ts` — `normalizeResidency`,
  `isKnownNonResidency`, `residencyOnAccept`. Extracted as pure functions
  precisely because this value decides mail audiences.
- `invite-member.post.ts` now reads `memberType ?? personType`, normalizes, and
  persists it; a junk value is a 400 rather than a silent write.
- `accept-invitation.post.ts` now calls `residencyOnAccept(invitation.member_type)`
  instead of the hardcoded `"owner"`.
- `tests/shared/residency.test.ts` — 10 tests. Suite baseline is now **1521**.

**`property_manager` maps to null**, not to owner: a manager is neither owner
nor tenant of the unit, and that is already carried by the Property Manager
role. Recording them as an owner would put them in owner-only audiences.

⚠️ **Directus does NOT enforce the `owner|tenant` choices.** Proved against
production: a write of `member_type: "COMPLETE-GARBAGE"` was accepted (and then
deleted). `choices` is a UI affordance, not a DB constraint — so
`normalizeResidency` in the endpoint is the **only** thing standing between a
bad client and the roster. Do not remove it on the assumption the schema
covers it.

⚠️ **`unitId` is still dropped by `invite-member`.** The form sends it and the
endpoint ignores it, so an invitation still cannot say *which unit*. That is
Phase 2/3 work, and it is the other half of "an active owner/tenant of which
unit".

### Phase 2 — Residency on the unit link
- Add a residency field to `hoa_member_units`.
- Introduce `residencyFor(member)` — junction first, `member_type` fallback.
- Migrate readers to the resolver, starting with the ones that decide mail
  recipients. Not all 34 at once.

### Phase 3 — Members UI *(fixes C)*
- Status filter including archived; archive and restore actions.
- Edit role and residency on existing members.
- **Unlinked-member alert**: flag any active member with no `hoa_member_units`
  row, with an inline action to link them to an existing unit **or create a
  unit for them**.

### Phase 4 — Invitation gating *(fixes D)*
- Exclude non-active members from any batch.
- Archived match → 409 that names the reason, plus the Restore action.

### Phase 5 — Close the roster gaps, and surface onboarding separately

**Superseded plan, recorded so it is not retried.** This phase originally
proposed resetting the 89 never-signed-in members to a new `invited` status,
on the reasoning that `role: null` correlates perfectly with `user: null`
(it does — all 126). **That reasoning was wrong**: it treated the app's
onboarding state as if it were the person's membership standing. An active
member who never logs in is a normal, correct record. No `invited` status
value is being added, and no member's `status` is being changed.

What is actually left, and it is small:

**Roster data gaps (1033 Lenox):**
- **3 active members with `member_type: null`** — no owner/tenant designation.
- **4 active members with no `hoa_member_units` row** — no unit.

**Roster data gaps (605 Lincoln Road):** 31 active members with no unit link
(see the coverage table above). Closed through the Phase 3 UI rather than a
script, since it needs someone who knows which resident is in which unit.

**Portal-onboarding visibility:** add an indicator to the members list —
*has an account* / *invited, not accepted* / *not yet invited* — derived from
`hoa_members.user` and `hoa_invitations.invitation_status`. This is what lets
management answer "which of my active owners still is not on the portal?"
without it ever touching membership status.

*(Note: `hoa_invitations` currently holds exactly one row, canceled. The 58
will effectively all be new.)*

## Traps

- ⚠️ **`member_type` decides who gets mail** in several call sites. Any change
  here is one bad filter away from mailing the wrong list. Verify against real
  org data, never fixtures.
- ⚠️ **Do not send test mail to real members.** 1033 Lenox and 605 Lincoln are
  real orgs with real people; a `directus_notifications` row emails from inside
  Directus.
- ⚠️ A Directus 403 is often a bad field name. Query `?fields=*` first.
- ⚠️ `hoa_invitations` holds acceptance tokens in cleartext — a leaked pending
  token lets an anonymous caller create an account. It must never gain a public
  read grant; `pnpm run audit:public-policy` guards this and now runs daily.
