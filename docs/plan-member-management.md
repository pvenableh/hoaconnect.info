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

## ⚠️ This changes the 85-invitation batch

1033 Lenox has **86 members: 59 active, 27 archived.**

"Invitations only go to active members" is therefore not cosmetic — it takes the
batch from ~85 to **59**, and the 27 archived are former residents. Sending to
them would be 27 wrong emails to real people. **Settle this before that
mailing, not after.**

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

### Phase 1 — Invitations carry residency *(fixes A + B)*
- Add `member_type` (`owner|tenant`) to `hoa_invitations`.
- `invite-member.post.ts`: accept and persist `memberType`.
- `accept-invitation.post.ts`: read it instead of the hardcoded `"owner"`;
  fall back to `owner` only when absent, and say so in a comment.
- `InviteMemberForm.vue`: owner/tenant control beside the existing role control.

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

### Phase 5 — Backfill
- 3 active 1033 members with `member_type: null`.
- **126 of 136 members have `role: null`** (58 of 59 active in 1033). Needs a
  decision first: is a null role equivalent to HOA Member, or genuinely unset?
  Do not backfill until that is answered — it grants access.
- 605 Lincoln's unit links, through the Phase 3 UI rather than a script.

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
