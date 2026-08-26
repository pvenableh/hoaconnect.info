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

### Phase 2 — Residency on the unit link — ✅ SHIPPED 2026-08-26

Shipped:

- `scripts/add-unit-link-residency.ts` (+ `pnpm add:unit-link-residency`) —
  adds `hoa_member_units.member_type` and `hoa_invitations.unit`
  (M2O → `hoa_units`, **ON DELETE SET NULL** so deleting a unit cannot destroy a
  pending invitation and with it the recipient's only acceptance token).
  Idempotent; verified by running it twice.
- `residencyFor()` / `resolveResidency()` in `core/shared/members/residency.ts`,
  plus `RESIDENCY_UNIT_FIELDS` so a call site cannot half-migrate — asking for
  residency while forgetting `end_date` would let an ended occupancy decide a
  current mail audience. 12 new tests; suite baseline is now **1533**.
- `invite-member.post.ts` persists `unitId` (400 if the unit belongs to another
  org); `accept-invitation.post.ts` creates the `hoa_member_units` row and puts
  the residency on the link as well as the member.
- **All four mail-deciding readers migrated**, one commit each:
  `sendEmailJob.ts`, `email-merge.ts` (+ `email/send.post.ts`'s fetch),
  `EmailComposePage.vue`, `communications/audience/index.vue`.

**Two resolver decisions came from production data, not from the design:**

- ⚠️ **`status` is NOT consulted on the link.** 79 of 81 real links are `draft`
  — that is what `scripts/migrate-1033.ts` wrote — and only 2 are `published`
  (written by `member-units/assign.post.ts`). No existing reader of the
  collection filters on it either. Filtering would have ignored 97% of the real
  links and silently fallen back to `member_type` for all of 1033 Lenox.
- **Only `end_date` gates a link, never `start_date`.** A link created ahead of
  a move-in is still the residency an admin just recorded; treating a future
  start as "not yet a resident" would make a freshly assigned unit resolve to
  nothing.

**Verified against production, not fixtures:**

- The resolver is a **no-op today**: across all 136 real members, resolved
  residency differs from current behavior in **0** cases (132 resolve via
  `member_fallback`, 4 via `none`). Nothing moves until a link actually carries
  a residency.
- `sendEmailJob`'s recipient set is **identical** to the old Directus filter for
  every one of the 7 orgs and both residency filters — 1033 Lenox 34 owners /
  22 tenants, 605 Lincoln 33 / 0, demo 5 / 1. No member gains or loses mail.
- Both new fields accept a write and read back (an invitation row created with a
  real unit, then deleted — count back to 1; a junction `member_type` written
  and restored to `null`).

⚠️ **Property Manager has NO read permission on `hoa_member_units`**, and the
client queries run on the *user's own* token (`api/directus/items.post.ts` uses
`getUserDirectus` when there is a session). Proved on production that this is
safe: **Directus silently OMITS an unreadable NESTED relational field and
returns 200** — only a nonexistent ROOT field is a 403. A property manager
therefore gets `units` absent and falls back to `member_type`, which is exactly
today's behavior. But once links start carrying residency, a PM's composer
counts could diverge from what the send actually resolves. See Operator TODOs.

**29 display/analytics readers of `member_type` remain** — `OccupancyWidget`,
`useHomeGlances`, the directory, `MembersPage`, `UsersPage`, `PeopleGlance`,
`MemberDashboardPage`, `units/[id].vue` and others. None of them decide who
receives mail, so they are follow-up work, still one at a time.

### Phase 3 — Members UI *(fixes C)* — ✅ SHIPPED 2026-08-26

Shipped in `MembersPage.vue`, `PeopleGlance.vue` and `member-units/assign.post.ts`:

- **The status filter, including archived.** The list query no longer filters on
  status at all — it used to hard-filter `_in ["active","inactive","pending"]`,
  which is what made `archived` a one-way trapdoor. A `Show` control decides
  what is rendered, with the count on each option so an admin can see that
  former residents exist without going looking: *Current (59) · Active (59) ·
  Inactive (0) · Pending (0) · **Archived (27)** · All (86)* for 1033 Lenox.
  **"Current" is the default and equals exactly what the page showed before**,
  so the filter adds reach without changing the arrival view.
- **Archive and restore.** An archived row offers Restore where every other row
  offers Archive. Delete stays, but is no longer the only way to take someone
  off the active roster.
- **A Status column beside the existing Account column** — deliberately side by
  side, because they answer different questions. See "Two orthogonal axes".
- **`archived` added to the member form's status select**, with a note that
  status is standing in the community, not app usage.
- **The unlinked-member alert.** Active members with no `hoa_member_units` row
  are counted in a banner and flagged inline as a clickable "No unit" in the
  Unit(s) column.
- **Residency is editable and now reaches the link.** The unit select used to be
  write-only on CREATE — editing a member and picking a unit silently did
  nothing. It now writes on update and carries residency onto the link.
  `handleEdit` also seeds the form from `residencyFor()`, so opening it shows
  the value the rest of the app resolves rather than re-saving the older
  fallback over the link.
- **`assign.post.ts` is now an upsert** keyed on (member, unit), demotes any
  previous primary, and normalizes residency — a junk value is a 400. Without
  the upsert, editing a member twice would leave two rows for the same unit.
- **`PeopleGlance` migrated to `residencyFor()`.** It sits directly above the
  table; reading the raw field there would have let the glance call someone an
  owner while the row beneath it called them a tenant.

**Verified in the running app against real 1033 Lenox data:**

| check | result |
|---|---|
| default view | 59 rows, Members tab count 59 — unchanged from before |
| filter options | Current 59 · Active 59 · Inactive 0 · Pending 0 · Archived 27 · All 86 |
| archived view | **27 rows, 27 Restore buttons, 0 Archive buttons** |
| active view | 59 rows, 59 Archive buttons, 0 Restore buttons |
| unlinked alert | "4 active members have no unit", and exactly 4 rows flagged |
| PeopleGlance | Owners 34 · Tenants 22 · Unrecorded 3 — matches the resolver |
| archive → restore | round-tripped through the real proxy on the TEST FIXTURE org |
| assign upsert | returned the SAME link id twice; global link count stayed 81 |
| assign junk value | **400**, rejected |

All probe writes were reverted: links back to 81 with 0 carrying residency, and
the 2 `hoa_activity` rows browsing created were deleted (1033 back to 285).

⚠️ Every `/api/directus/items` call returned 200 with the new nested
`units.member_type` / `units.end_date` fields — no 403, as the nested-omission
finding predicted.

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

## Operator TODOs

- [ ] **Decide whether Property Manager should read `hoa_member_units`.**
      It cannot today, so a PM's composer and audience counts fall back to
      `hoa_members.member_type` while the actual send (static admin token)
      resolves through the link. Identical today — the resolver is a proven
      no-op — but they diverge the moment links start carrying residency. It is
      a production permission change, so it is Peter's call, not a silent fix.
      A PM already reads `hoa_members` and `hoa_units`, so granting it is
      consistent rather than a widening of scope.
- [ ] **Fill in the residency on 1033 Lenox's 55 unit links.** They exist but
      all carry `member_type: null`, so every one of those members still
      resolves through the fallback. Phase 3's UI can now do this — editing a
      member and saving writes residency onto their link.
- [ ] **The 29 remaining `member_type` readers** — display and analytics only,
      none decide mail. One at a time.

## Traps

- ⚠️ **`member_type` decides who gets mail** in several call sites. Any change
  here is one bad filter away from mailing the wrong list. Verify against real
  org data, never fixtures.
- ⚠️ **Do not send test mail to real members.** 1033 Lenox and 605 Lincoln are
  real orgs with real people; a `directus_notifications` row emails from inside
  Directus.
- ⚠️ A Directus 403 is often a bad field name. Query `?fields=*` first.
  **Corollary, proved anonymously on production:** that is true only of a ROOT
  field. An unreadable NESTED relational field is silently OMITTED with a 200,
  not refused — so adding `units.member_type` to a query never 403s a role that
  cannot read the junction; it just quietly gets less data and falls back.
  Convenient here, but it means a permission gap shows up as a wrong number
  rather than an error.
- ⚠️ **The unit link's `status` is meaningless as a filter.** 79 of 81 real
  links are `draft`; only the 2 written by `member-units/assign.post.ts` are
  `published`. Anything that filters on it silently drops nearly every real
  residency.
- ⚠️ `hoa_invitations` holds acceptance tokens in cleartext — a leaked pending
  token lets an anonymous caller create an account. It must never gain a public
  read grant; `pnpm run audit:public-policy` guards this and now runs daily.

## Kickoff prompt — next session (ready to paste)

````
Continue HOA Connect. Read docs/plan-member-management.md FIRST — it is the
source of truth for this workstream. Read "⚠️ Two orthogonal axes", then the
Phases and the Traps. Also skim the LAST section of
docs/plan-earnest-parity-round2.md for the 1033 domain state. Chat memory is not
authoritative; those files are.

Work on `main` in /Users/peterhoffman/Sites/hoaconnect/hoaconnect — the repo
root is the NESTED directory; the parent is a workspace folder, and ANY `cd`
elsewhere silently resets your shell there for the next command, so re-`cd`
in every tool call that needs the repo. No branch, no worktree.
`git pull --ff-only` first. Tool shells have no node/pnpm: run
`eval "$(/usr/local/bin/fnm env)"` in every one. Vercel AUTO-DEPLOYS on push,
so a push IS a production deploy — ask before pushing, never run `vercel --prod`.

DONE, do not redo:
- The directus_files hole is CLOSED on production (public grant filtered to
  `type _starts_with image/`; everything else via /api/directus/assets/:id).
- The AI notices cron is CONFIRMED FIRING. Closed.
- The 4 flaky org-scope tests are FIXED.
- `audit:public-policy` IS IN CI — .github/workflows/public-policy-audit.yml,
  daily 06:17 UTC + push-to-main + dispatch. ⚠️ It is a DETECTOR, not a gate —
  Vercel deploys independently of Actions. Do not re-wire it.
- `subscription_plans` is REVIEWED and CLEAN. Only the NARROWINGS remain.
- 1033 Lenox is DOMAIN-VERIFIED, but NO TRAFFIC MOVED — the apex is still
  76.76.21.21. Step 4 (the Vercel project move) is PETER'S. Do not chase it.
- MEMBER MANAGEMENT PHASE 1 IS SHIPPED. Invitations carry residency.
- MEMBER MANAGEMENT PHASE 3 IS SHIPPED. Do not re-derive any of it:
  * MembersPage.vue no longer filters status in the QUERY. A "Show" control
    does, defaulting to "Current" = active/inactive/pending — the exact set the
    page showed before. Archived is reachable; 1033's 27 former residents are
    visible and restorable.
  * Archive/Restore actions, a Status column beside Account, `archived` in the
    member form, and the unlinked-member alert all exist.
  * assign.post.ts is an UPSERT keyed on (member, unit) that demotes the old
    primary and normalizes residency (junk = 400). The member form now writes
    the unit on UPDATE, not only on create — it was silently a no-op before.
  * PeopleGlance.vue is migrated to residencyFor() too.
  * VERIFIED IN THE RUNNING APP on real 1033 data: 59 default rows, 27 archived
    rows with 27 Restore buttons, "4 active members have no unit", glance
    34/22/3. All probe writes reverted.
- MEMBER MANAGEMENT PHASE 2 IS SHIPPED. Do not re-derive any of it:
  * hoa_member_units.member_type and hoa_invitations.unit both EXIST on
    production (scripts/add-unit-link-residency.ts, idempotent).
  * residencyFor() / resolveResidency() / RESIDENCY_UNIT_FIELDS live in
    core/shared/members/residency.ts. 22 tests in that file.
  * invite-member NO LONGER DROPS unitId; accept-invitation CREATES the
    hoa_member_units link with residency on it.
  * ALL FOUR mail-deciding readers are migrated: sendEmailJob.ts,
    email-merge.ts (+ email/send.post.ts's fetch), EmailComposePage.vue,
    communications/audience/index.vue.
  * PROVEN A NO-OP: 0 residency changes across all 136 real members, and
    recipient sets identical for all 7 orgs on both residency filters.
- Everything is pushed and deployed; 0 unpushed commits.

⚠️⚠️ THE SINGLE MOST IMPORTANT THING IN THIS WORKSTREAM — two ORTHOGONAL axes.
  `hoa_members.status = active` means AN ACTIVE MEMBER OF THE COMMUNITY (a
  current owner or tenant). It does NOT mean "uses the app". Whether someone has
  ever signed in is a SEPARATE axis: `hoa_members.user` being set.
  An active member who has never logged in is NORMAL and CORRECT. 1033: 59
  active, only 1 with an account. 605: 33 active, 2 accounts.
  NEVER demote a member's `status` because they have no account. A previous
  session proposed exactly that and it was wrong. "Invited" is not a membership
  status — it lives in `hoa_invitations.invitation_status`.

FIRST, orientation:

  dig +short 1033lenox.com A     # 76.76.21.21 = still old, 216.150.1.1 = moved
  pnpm run audit:public-policy   # green, 3 grants, directus_files "filtered"
  pnpm test                      # 1533/1533 across 87 files

Then, the work — Phase 4 is next:

PHASE 4 — invitation gating (fixes gap D).
  - Exclude non-active members from any invitation batch.
  - An invite whose email matches an ARCHIVED member must 409 with a message
    that NAMES the reason, plus an explicit Restore action.
    ⚠️ It must NEVER auto-restore. A typo'd email must not silently reactivate
    a former resident. That is a settled decision, not an open question.
  - Today invite-member.post.ts 409s on ANY existing member with a message that
    does not distinguish "already active here" from "archived former resident",
    and its `user`-based branch calls an accountless member "a pending
    invitation" — which is the axis confusion this workstream exists to fix.

Then Phase 5, which runs LAST.

Also still open (ask Peter which, do not do all):
  - PROPERTY MANAGER CANNOT READ hoa_member_units. Client queries run on the
    USER'S OWN token, so a PM's composer/audience counts fall back to
    member_type while the actual send resolves through the link. Identical
    today; they diverge the moment links carry residency. Production permission
    change — Peter's call.
  - `subscription_plans` ROW FILTER — safe, recommended. Apply
    {status:{_eq:"published"},is_active:{_eq:true}} to the public grant AND add
    the same filter to ALLOWED in scripts/audit-public-policy.ts in the SAME
    commit, or the daily job goes red the next morning.
  - `subscription_plans` FIELD SCOPE — test on a dev server first. Landing.vue
    and experimental.vue FILTER on status and is_active, so this could SILENTLY
    EMPTY the marketing pricing section. Low value; consider skipping.
  - Stale comment in core/server/api/domains/verify.post.ts still claims
    verification "lets Caddy issue a cert via /api/domains/ask". There is no
    Caddy and that is not a cert gate on Vercel. Comment only, 2 minutes.
  - THE 58 RESIDENT INVITATIONS — gated on Peter's Vercel move, NOT ready.
    ⚠️ It is 58, not 85: 1033 has 86 members = 59 active + 27 archived, and 1
    active member already has an account. The 27 archived are FORMER RESIDENTS.
    ⚠️ BULK MAIL TO REAL PEOPLE. Build it, render the template, produce the
    recipient list as a file, and STOP. Second explicit yes before any send.
    ⚠️ Whichever host the admin is browsing is baked into those links, and they
    sit in inboxes permanently. Decide before/after the domain move deliberately.

⚠️ DIRECTUS DOES NOT ENFORCE `choices`. Proved on production: a write of
member_type "COMPLETE-GARBAGE" was ACCEPTED. Server-side normalization is the
ONLY guard. Never drop it assuming the schema covers it.

⚠️ THE UNIT LINK'S `status` IS MEANINGLESS AS A FILTER. 79 of 81 real links are
`draft` (migrate-1033.ts wrote them); only the 2 from member-units/assign.post.ts
are `published`. residencyFor() deliberately ignores it. Anything that filters
on it silently drops nearly every real residency.

⚠️ DO NOT SEND TEST MAIL TO REAL MEMBERS. invite-member.post.ts SENDS via
SendGrid. A write to `directus_notifications` EMAILS the recipient from inside
Directus; one row is one mail. A GET to /api/ai/notices/check also SENDS; use
POST with dryRun:true. 1033 Lenox and 605 Lincoln are REAL orgs with real
people. There are NO Directus flows on any collection (only 4 schedule/webhook
flows), so a DIRECT Directus write to hoa_invitations is mail-safe — that is how
Phases 1 and 2 were verified.

⚠️ IMAGES ARE STILL ANONYMOUSLY READABLE ACROSS ALL ORGS. Accepted residual of
the type-filter design, not a bug to re-fix. Do not start without Peter. And do
NOT "simplify" by deleting the public grant: the logo in every already-sent
email is a bare /assets/<id> fetched with no session.

⚠️ A NEW COLLECTION THAT STORES A FILE needs adding to core/server/utils/
file-owner.ts. Forgetting costs a 403 on download, never a leak.

⚠️ A DIRECTUS 403 IS OFTEN A BAD FIELD NAME — but only for a ROOT field. An
unreadable NESTED relational field is SILENTLY OMITTED with a 200. Proved
anonymously on production. So a permission gap on a nested field shows up as a
WRONG NUMBER, never an error. Query `?fields=*` first.

⚠️ A PUBLIC GRANT CANNOT BE TENANT-SCOPED. VERIFY PUBLIC GRANTS FROM THE
ANONYMOUS SIDE — a curl with NO token is the view that matters.

⚠️ A DIRECTUS 204 ON CREATE IS A WRITE, NOT A REJECTION. Check for, and delete,
anything a probe creates.

⚠️ COLD vs WARM DEV SERVER FAKES A DIFF. Take a noise control first.

⚠️ zsh DOES NOT WORD-SPLIT `$VAR`, and globs BOTH Directus filter URLs AND bare
`--include=*.ts` flags — quote them.

⚠️ WHEN CAPTURING AN EXIT CODE, CAPTURE THE COMMAND'S, NOT A PIPELINE'S.
`pnpm typecheck | tail -25; echo $?` reports tail's 0 and hides real failures.

Quality gate per commit: typecheck 0, vitest 1533/1533 (87 files), build green,
hairline audit green at BASELINE 0 (it BLOCKS commits via husky). Do NOT run
`pnpm build` and `pnpm typecheck` concurrently — they corrupt each other's
`.nuxt` cache. `pnpm typecheck` takes >10min, so run it in the BACKGROUND.

Verify against real data, not fixtures — every real bug in the last six sessions
was found that way and none by unit tests. The highest-value check in this
workstream is a BEFORE/AFTER DIFF OF THE ACTUAL RECIPIENT SET across all 7 orgs;
that is what proved Phase 2 safe. Use your own dev server (preview_start, never
Bash) with a real session. Browser-pane SCREENSHOTS fail silently on the dev
server tab — verify headlessly with curl / read_page / javascript_tool. Browsing
writes hoa_activity rows; cookie-less curl and API calls do not. Delete every row
you create and re-check the counts: demo 462, demo-classic 13 (demo-classic is a
CONTROL, never write to it), 1033 Lenox 285, hoa_invitations 1.

When done: update the plan's phase status and Operator TODOs, and ask before
pushing.
````
