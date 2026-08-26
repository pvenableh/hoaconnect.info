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

## Kickoff prompt — next session (ready to paste)

````
Continue HOA Connect. Read docs/plan-member-management.md FIRST — it is the
source of truth for this workstream. Read "⚠️ Two orthogonal axes", then the
Phases. Also skim the LAST section of docs/plan-earnest-parity-round2.md for
the 1033 domain state. Chat memory is not authoritative; those files are.

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
  daily 06:17 UTC + push-to-main + dispatch, reusing the existing
  DIRECTUS_STATIC_TOKEN secret. ⚠️ It is a DETECTOR, not a gate — Vercel
  deploys independently of Actions. Do not re-wire it.
- `subscription_plans` is REVIEWED and CLEAN (no tenant FK, 8 catalog rows,
  Enterprise stores no negotiated number). Only the NARROWINGS remain.
- 1033 Lenox is DOMAIN-VERIFIED. `domain_verified: true`, verified through the
  real endpoint with an App Administrator session. NO TRAFFIC MOVED — the apex
  is still 76.76.21.21 and 1033 still serves off the old Vercel project.
  Step 4 (the Vercel project move) is PETER'S, and he is doing design work
  first. Do not chase it.
- MEMBER MANAGEMENT PHASE 1 IS SHIPPED. Invitations now carry residency.
  Do not re-derive it: InviteMemberForm.vue ALWAYS had the Owner/Tenant control
  and always POSTed it as `personType`; invite-member.post.ts just never read
  it, and accept-invitation hardcoded "owner". Fixed via
  core/shared/members/residency.ts. 10 tests.
- Everything is pushed and deployed; 0 unpushed commits.

⚠️⚠️ THE SINGLE MOST IMPORTANT THING IN THIS WORKSTREAM — two ORTHOGONAL axes.
  `hoa_members.status = active` means AN ACTIVE MEMBER OF THE COMMUNITY (a
  current owner or tenant). It does NOT mean "uses the app". Whether someone has
  ever signed in is a SEPARATE axis: `hoa_members.user` being set.
  An active member who has never logged in is NORMAL and CORRECT — management
  needs that record precisely because they are a real resident not yet on the
  portal. 1033: 59 active, only 1 with an account. 605: 33 active, 2 accounts.
  NEVER demote a member's `status` because they have no account. A previous
  session proposed exactly that and it was wrong. "Invited" is not a membership
  status — it lives in `hoa_invitations.invitation_status`.

FIRST, orientation:

  dig +short 1033lenox.com A     # 76.76.21.21 = still old, 216.150.1.1 = moved
  pnpm run audit:public-policy   # green, 3 grants, directus_files "filtered"
  pnpm test                      # 1521/1521 across 87 files

Then, the work — Phase 2 is next:

PHASE 2 — residency on the unit link, and stop dropping `unitId`.
  ⚠️ `invite-member.post.ts` STILL IGNORES `unitId`, which the form already
  sends. That is the other half of "an active owner/tenant of WHICH UNIT".
  - Add residency to `hoa_member_units` (it already has is_primary_unit,
    start_date, end_date, ownership_percentage).
  - Add `residencyFor(member)` — junction FIRST, `hoa_members.member_type` as
    FALLBACK. The fallback is required, not optional: 605 Lincoln Road is LIVE
    IN PRODUCTION with 33 active members and ZERO unit links, and both demo
    orgs have none either. A clean cutover would blank all of them.
  - ⚠️ 34 FILES READ `member_type`, including EmailComposePage.vue,
    email-merge.ts, sendEmailJob.ts and audience/index.vue — several DECIDE WHO
    RECEIVES MAIL. Migrate them to the resolver ONE AT A TIME, mail-deciding
    ones first and most carefully. Do not sweep all 34 in one commit.

Then Phases 3, 4, 5 as written in the plan. Phase 5 runs LAST.

Also still open (ask Peter which, do not do all):
  - `subscription_plans` ROW FILTER — safe, recommended. Apply
    `{status:{_eq:"published"},is_active:{_eq:true}}` to the public grant AND
    add the same filter to ALLOWED in scripts/audit-public-policy.ts in the
    SAME commit, or the daily job goes red the next morning.
  - `subscription_plans` FIELD SCOPE — test on a dev server first. Landing.vue
    and experimental.vue FILTER on `status` and `is_active`, and Directus may
    require read permission on a filtered field, so this could SILENTLY EMPTY
    the marketing pricing section. Low value; consider skipping.
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
member_type "COMPLETE-GARBAGE" was ACCEPTED. The dropdown is a UI affordance,
not a DB constraint — server-side normalization is the ONLY guard. Never drop
it assuming the schema covers it.

⚠️ DO NOT SEND TEST MAIL TO REAL MEMBERS. invite-member.post.ts SENDS via
SendGrid — never call it to "test". A write to `directus_notifications` EMAILS
the recipient from inside Directus; one row is one mail. A GET to
/api/ai/notices/check also SENDS; use POST with dryRun:true. 1033 Lenox and
605 Lincoln are REAL orgs with real people. There are no Directus flows on
hoa_invitations, so a DIRECT Directus write to that collection is mail-safe —
that is how Phase 1 was verified.

⚠️ IMAGES ARE STILL ANONYMOUSLY READABLE ACROSS ALL ORGS. Accepted residual of
the type-filter design, not a bug to re-fix. Tightening it needs a per-file
public marker + backfill, and a missed flag breaks a landing image or an email
logo SILENTLY. Do not start without Peter. And do NOT "simplify" by deleting
the public grant: the logo in every already-sent email is a bare /assets/<id>
fetched with no session, and those URLs cannot be reissued.

⚠️ A NEW COLLECTION THAT STORES A FILE needs adding to core/server/utils/
file-owner.ts. Forgetting costs a 403 on download, never a leak — it fails
closed on purpose. Do not "fix" that by allowing unowned files.

⚠️ A DIRECTUS 403 IS OFTEN A BAD FIELD NAME, NOT PERMISSIONS. Asking for a
column that does not exist returns 403, not 400. Query `?fields=*` first.

⚠️ A PUBLIC GRANT CANNOT BE TENANT-SCOPED. An anonymous request has no
$CURRENT_USER. `/api/directus/items` falls back to the anonymous client when
there is no session, so any grant is reachable by one POST with no token.
VERIFY PUBLIC GRANTS FROM THE ANONYMOUS SIDE — a curl with NO token is the view
that matters.

⚠️ A DIRECTUS 204 ON CREATE IS A WRITE, NOT A REJECTION. Check for, and delete,
anything a probe creates.

⚠️ COLD vs WARM DEV SERVER FAKES A DIFF. Take a noise control — two captures
with nothing changed — before believing a before/after.

⚠️ zsh DOES NOT WORD-SPLIT `$VAR`: `for id in $IDS` runs ONCE with the whole
string. zsh also globs BOTH Directus filter URLs AND bare `--include=*.ts`
flags — quote them.

⚠️ WHEN CAPTURING AN EXIT CODE, CAPTURE THE COMMAND'S, NOT A PIPELINE'S.
`pnpm typecheck | tail -25; echo $?` reports tail's 0 and hides real failures.

Quality gate per commit: typecheck 0, vitest 1521/1521 (87 files), build green,
hairline audit green at BASELINE 0 (it BLOCKS commits via husky). Do NOT run
`pnpm build` and `pnpm typecheck` concurrently — they corrupt each other's
`.nuxt` cache. `pnpm typecheck` takes >10min, so run it in the BACKGROUND.

Verify against real data, not fixtures — every real bug in the last five
sessions was found that way and none by unit tests. Use your own dev server
(preview_start, never Bash) with a real session. Browser-pane SCREENSHOTS fail
silently on the dev server tab (blank images while the DOM is correct) — verify
headlessly with curl / read_page / javascript_tool. Browsing writes hoa_activity
rows; cookie-less curl and API calls do not. Delete every row you create and
re-check the counts: demo 462, demo-classic 13 (demo-classic is a CONTROL,
never write to it), 1033 Lenox 285, hoa_invitations 1.

When done: update the plan's phase status and Operator TODOs, and ask before
pushing.
````
