# Spec — restricted members: posting paused, membership kept

Asked by Peter 2026-11-17: "I want something in between" archiving a member and moderating their comments one at a time. Builds on `docs/spec-delegation.md` and the scope fields in `core/shared/roles/admin-scope.ts`. Decisions confirmed with Peter 2026-11-17. Written 2026-11-17.

An admin can pause a member's posting in one community: they stop reaching other people, and keep everything private to them and the board. It is dated, ended rather than erased, recorded for the board, and the member is told. The same change closes a gap that exists today: an archived or inactive member can still write through Directus.

## The gap this also closes (found 2026-11-17)

Every HOA Member Directus rule is scoped by `ANY_MEMBERSHIP` (`$CURRENT_USER.hoa_members.organization`, `scripts/lib/admin-scope-perms.ts`): any membership row, whatever its status. So an archived or inactive member who is still signed in can create comments, reactions, comment reports, poll votes and requests with their own token. Chat messages and mentions are limited only by `channel_memberships`, which archiving does not remove. The routes check status; the direct writes do not. Read from the scripts, not tested live.

## The record

`scripts/create-member-restrictions-collection.ts` (idempotent, `--dry-run`; the operator runs it, then `pnpm generate:types`).

| Collection | Fields |
|---|---|
| `hoa_member_restrictions` | `organization` (M2O, required, CASCADE) · `member` (M2O `hoa_members`, required, SET NULL) · `starts_at` (timestamp, required) · `ends_at` (timestamp, null = until lifted) · `lifted_at` · `lifted_by` (M2O users) · `imposed_by` (M2O users) · `member_note` (shown to the member, required) · `internal_note` (admins and board only) · `holder_name` (frozen when the row ends) · `date_created` · `user_created` |

- **Restricted at t:** a row for the membership with `starts_at ≤ t`, no `lifted_at ≤ t`, and `ends_at` null or `> t`. Derived, never stored.
- **One open row per membership.** Imposing while one is open is refused (409); change it by lifting and imposing again.
- **Lifting early** sets `lifted_at` and `lifted_by`; an end date passing needs no write. Nothing is deleted.
- **No Directus policy reads or writes the collection.** Routes only.
- `hoa_members.status` is unchanged: a restricted member stays `active` (dues, household, hats, about 50 status reads).

## What a restriction stops and keeps

| Stops (reaches other people) | Keeps (private to them and the board) |
|---|---|
| Chat messages, @mentions, message edits | Reading everything a member reads |
| Comments (create, edit) | Paying dues; their household and change requests |
| Reactions | Requests to the board |
| Comment reports | Bug reports to HOA Connect |
| Triggering notifications (`notify-event`, channel notify) | Poll votes |
| Helper and committee areas (paused while restricted) | Deleting their own past messages and comments |

**Board seats.** A member with a current board term cannot be restricted (409, "End or change their term first"): a director who cannot speak in the board's channel is a governance question, not a moderation one.

## Enforcement (one rule, two layers)

`core/shared/members/restrictions.ts` (pure): `isRestrictedAt(rows, t)`, `openRestriction(rows, t)`, `planImpose`, `planLift`, and `canPost({ status, restricted })` = status `active` and not restricted.

**Directus, through two new scope fields** on `hoa_members`, beside `admin_of` (added to `SCOPE_FIELDS`, computed by `scopeFieldsOf`, kept by the existing sync Flow and nightly reconcile):

| Field | Value | Scopes |
|---|---|---|
| `active_in` | the community, when status is `active` | HOA Member create on `hoa_requests` and `hoa_poll_votes` |
| `posts_in` | the community, when status is `active` and no restriction is open | HOA Member create and update on `hoa_comments`, `hoa_reactions`, `hoa_comment_reports`; create on `hoa_channel_messages` and `hoa_channel_mentions` (alongside the channel-membership check) |

Reads keep `ANY_MEMBERSHIP` (unchanged here; whether archived members should still read is a separate question). Deleting one's own rows keeps it too. The restriction routes call the sync for that membership after each write; the nightly reconcile clears restrictions whose end date has passed. **Every change only narrows a policy:** the operator applies it (`pnpm setup:permissions`), and the audit before and after is in the log.

**Server**, for routes that act for the caller: `requireCanPost(event, orgId)` in `channels/[channel]/notify`, `channel-fanout` (the author), `channels/[channel]/edit`, `org/notify-event`, and `support` "ask the community". `getHelperAreas` returns nothing while restricted. Routes that already require an active membership keep doing so.

## Routes

Under `/api/org`, `orgId` in the query (GET) or body; zod bodies; the member read through the org filter (404 otherwise). **Admin only** for writes and the history.

| Route | Does |
|---|---|
| `GET member-restrictions?member=` | That member's rows, open and ended, with who imposed and lifted each |
| `GET member-restrictions` | Every open row in the community, for the Members list chip |
| `POST member-restrictions` | `{ member, endsAt?, memberNote, internalNote? }`. 409 if one is open, the membership is not active, or they hold a current board term. 400 for an admin or a property manager (remove the role first) |
| `POST member-restrictions/[id]/lift` | Ends it now. 409 if already ended |
| `GET member-restrictions/mine?orgId=` | The caller's own open restriction, if any: `{ restricted, endsAt, memberNote }` only. Any live member |

Each write: one ledger entry, `member_restricted` / `member_restriction_lifted`, category access, **visibility board** (it names one member's discipline; the same call as `member_email_status_cleared`), with the member's name, the dates and the member-facing note; never the internal note. And one bell notification to the member, through `notifyUsers` (category `membership`; if a member can switch that category off, this notice must still reach them, so the build checks `core/shared/notifications/preferences.ts` and says what it did).

## What each role sees

| Who | Sees |
|---|---|
| Admin | On the member's sheet: "Pause posting" (end date, default 30 days, or until lifted; a note the member sees; an internal note), the open restriction with Lift, and the history. A "Posting paused" chip on the Members list. Nothing for an admin, a manager or a current board seat, with the reason |
| Board seat | The ledger entries. No controls |
| Restricted member | A banner on every page of that community: "Posting is paused in {community} until {date}" (or "until the board lifts it"), the member note, "Contact the board" (their requests page). Chat and comment composers, reactions and Report are replaced by one line saying why. Everything they keep works as before |
| Everyone else | Nothing; past posts stay (moderation is per item, as today) |

Copy notes: say "paused", not "banned". Florida §720.305's notice-and-hearing rule covers fines and suspension of common-area use; pausing app posting is lighter, but the admin form says "Check your governing documents before pausing a member's posting." Not legal advice.

## Build order (one commit each, gated)

1. This spec.
2. **The archived-member gap first:** `active_in` and `posts_in` (posts_in = active only, until restrictions exist), the policy scripts switched to them, permission audit before and after, tests. Operator applies. This ships value on its own.
3. Shared model (`restrictions.ts`) with table tests; `scopeFieldsOf` takes the open restriction.
4. Schema script for `hoa_member_restrictions`; the operator runs it.
5. Routes, the ledger types and builders, the bell, `requireCanPost` in the five server places, `getHelperAreas` paused, the sync on write; org-scope tests.
6. Admin UI on the member sheet and the Members chip; the member banner and the composers; a `/ui-kit` demo.

## Named tests

- `tests/shared/member-restrictions.test.ts`: `isRestrictedAt` bounds (start inclusive, end and lift exclusive), lifted early, ended by date, future start · `planImpose` refuses an open row · `planLift` on an ended row is a no-op · `canPost` for each status × restricted.
- `tests/shared/admin-scope.test.ts`, added: `active_in` and `posts_in` for active, pending, inactive, archived, and restricted · the sync reads restrictions.
- `tests/scripts/…`: every HOA Member create/update rule on the posting collections names `posts_in`; requests and poll votes name `active_in`; reads still name `ANY_MEMBERSHIP`.
- `tests/server/member-restrictions-routes.test.ts`, on every route: 401, 400, 403 for a plain member and a board seat (not admin), 404 for another community's member · 409 open row, inactive member, current board term · 400 admin, manager · lift ends without deleting · ledger entry board-visible without the internal note · bell to the member · `mine` returns only the member-facing fields.
- `tests/server/can-post.test.ts`: the five server places refuse a restricted member and an archived one, and admit an active one; a restricted helper's areas are paused.
