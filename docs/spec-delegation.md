# Spec — delegation to members: helpers and committees (role-first UX, Session 8)

Plan: `docs/plan-role-first-ux.md` §7 "Queued: delegation to members". Builds on `docs/spec-role-context.md` and `docs/spec-capability-nav.md`. Decisions confirmed with the operator 2026-11-17. Written 2026-11-17.

An admin can give a member (a **helper**) or a team (a **committee**) some of the areas a property manager can be given. A committee's members hold its areas while they are on it. Managers keep their own path (`manager_permissions`, Settings → Property management); this adds a second kind of holder, never a second store for the same fact.

## The record

`scripts/create-area-grants-collection.ts` (idempotent, `--dry-run`; the operator runs it, then `pnpm generate:types`).

| Collection | Fields |
|---|---|
| `hoa_area_grants` | `organization` (M2O, required, CASCADE) · `area` (a key of `HELPER_AREA_KEYS`, checked by the route) · `member` (M2O `hoa_members`, SET NULL) · `team` (M2O `hoa_teams`, SET NULL) · `starts_at` (timestamp, required) · `ends_at` (timestamp, null = open) · `granted_by` · `ended_by` (M2O users) · `end_reason` (revoked · transition) · `holder_name` (frozen when the row ends) · `date_created` · `user_created` |

- **Exactly one holder:** `member` or `team`, never both, never neither. The holder never changes after the row opens.
- **One open row per holder and area.** Switching on opens one; switching off ends it (`ends_at` = now, `ended_by`, `end_reason` revoked, `holder_name`). Nothing is deleted, so "who could do what, and when" stays answerable.
- **Timestamps, not dates:** a revoke takes effect at once, and a grant opened and revoked the same day stays a valid row. Holds at t: `starts_at ≤ t` and (`ends_at` null or `ends_at > t`).
- **No Directus policy reads or writes it.** Every read and write is a route, as with the register.

Not stored, because each is derived: whether a person holds an area today (below); "ended because the membership ended", because the read requires an active membership; "ended because they left the committee", because the read requires a current `hoa_team_members` row.

## Which areas a helper can hold

`HELPER_AREA_KEYS` in `core/shared/roles/area-grants.ts`: a subset of `MANAGER_GRANT_KEYS` whose every read and write goes through a server route.

| Area | Helper? | Why |
|---|---|---|
| `feedback` | yes | `poll-access.ts` |
| `responsibilities` | yes | `responsibility-access.ts`; routes only |
| `projects` | yes, without money | `project-access.ts` and `requests/[id]/promote`. The four expense routes stay admin-or-manager: money is admin's |
| `documents` | yes, governing and publish | `governing-access.ts`, `governing-sources.ts`, `documents/publish`. Rename, delete and folders on the documents page write with the user's token and stay admin |
| `inquiries` | yes (2026-11-26) | `area-requests.ts`; `/api/org/inquiries` (list, one with its linked channel, save details, transition) and `hoa/requests/manager-create` for a follow-up task |
| `violations` | yes (2026-11-26) | `area-requests.ts` (alone: the violation requests only), `manager-create`, `/api/org/violations/members` (names only) |
| `directory` | yes (2026-11-26) | `change-request-access.ts`; `/api/org/directory`, and change-request review |
| `communications` | yes (2026-11-26) | every `/api/email` route on `requireAreaWork`; `/api/org/communications/{recipients,templates,activity}`; `/manage/communications/*` |
| `meetings` | yes (2026-11-26; a new area) | `meeting-access.ts`; `/api/org/meetings` and its attendee routes; `/manage/meetings` |
| `activity` | no | shows a neighbour every resident's actions |
| `contact_platform` | no | speaking to HOA Connect for the community stays with admins and managers |

A test checks that every helper area is grantable, that its gate is a server file (not a `.vue` page), and that the two "no" areas are absent.

### The 2026-11-26 routes

Each reads and writes with the app's token behind `requireAreaWork`, and its reads ride in one batch with the caller's access snapshot (`readForArea` / `readBeforeGate` in `core/server/utils/area-reads.ts`), refusing before any row is returned. Route tests: `tests/server/delegated-area-routes.test.ts` (401, 400, 403 for a plain member, a board seat, a helper of another area and a manager without the grant; 404 for another community's row; what each writes).

- **Inquiries.** `GET /api/org/inquiries`, `GET` and `PATCH /api/org/inquiries/:id` (the workflow's detail fields only, `mergeDetails`), `POST /api/org/inquiries/:id/transition` (`{ to }`; the server checks the move and picks the status, `planTransition`; writes the timeline note and tells the submitter through the reminder engine). `RequestDetail` takes `via="area"` on the manage pages. A request of another community, or a non-violation for a violations-only caller, is a 404.
- **Violations.** The violations area alone opens `/manage/inquiries` with the violation requests: the manager middleware's `managerCapability` and the nav's `area` need accept a list.
- **Directory.** `GET /api/org/directory`; `isChangeReviewer` admits a helper holding it, so `/admin/approvals` works for them.
- **Communications.** Compose, detail and activity also live under `/manage/communications`; the shared email pages navigate under the base they were opened from (`useCommsBase`). The attachment browser uses `/api/org/storage/list`.
- **Meetings.** `GET`/`POST /api/org/meetings`, `PATCH`/`DELETE /api/org/meetings/:id`, `DELETE /api/org/meetings/:id/attendees/:attendeeId`; adding attendees asks the area.

**Gaps, stated not closed.** A helper on a request reads and writes its thread as the member they are: no internal notes. Discussion channels on a ticket stay with admins and board seats; Promote needs the Projects area. In the composer, saving templates, the email builder and AI drafts stay with admins, the board and managers (`requireOrgComposeAccess`), and the visual editor's inline image upload uses the member's own file access. Reminders (`reminder-admin.ts`) stay admin or manager. The manager queue at `/manage` still reads with the user's token; a helper keeps the member dock and does not use it. The Board Room strip and director layer on the meetings page stay admin-only.

## Who holds what

`getAreaGrants(event, orgId)` (`core/server/utils/manager-access.ts`) is the one reader. It returns `{ areas: Record<ManagerGrantKey, boolean>, manager: boolean }`:

- **Manager:** `getManagerGrants`, unchanged (active row, Property Manager role).
- **Helper:** open `hoa_area_grants` rows naming the caller's **active** membership in `orgId`.
- **Committee:** open rows naming a team with `status` active in `orgId` that the caller is on (`hoa_team_members.user` = session user, same organization), and the caller has an active membership there.

Helper and committee rows count only for `HELPER_AREA_KEYS`; any other key on a row is ignored. The pure part is `helperAreasFor({ memberId, teamIds, rows, now })`.

- `requireAreaWork(event, orgId, key)`: admin, a manager grant, or a helper/committee area. Replaces `requireAdminOrManagerGrant` in `documents/publish` and `requests/[id]/promote`, and the grant reads in `project-access`, `responsibility-access`, `poll-access`, `governing-access`, `governing-sources` and `resolveCapabilities` (projects → `projects:write`, `milestone:approve`).
- `requireAdminOrManagerGrant` keeps today's meaning (admin or manager) for every other caller: reminders and expenses. (Email, inquiries and violations moved to `requireAreaWork` on 2026-11-26.)
- **A helper is never the `property_manager` actor.** `getManagerGrants` stays PM-only, so `board-access` (the actor), `ledger.get` (`isManager`), `ai/ask`, `support`, and project and change-request notifications are unchanged. Helpers are not notified about areas: notify stays the manager's switch.

**Role context.** `resolveRoleContext` takes the helper areas as an input. `areas[k].canWork` = admin, or (PM role and the grant), or (active and k in the helper areas). New field `helps: AreaKey[]`: the areas held as a helper or committee member, admin and manager aside. The hat is unchanged; holding an area never sets `hats.manager`.

## Routes

Every route is under `/api/org`. It takes `orgId` (query on GET and DELETE, body otherwise), checks a zod body, and refuses with 404 any member, team or row outside `orgId`. All are **admin only**: a holder can never widen, keep or move their own grants.

| Route | Does |
|---|---|
| `GET area-grants?member=` or `?team=` | That holder's rows, open and ended, with who granted and ended each |
| `GET area-grants` | Every open row in the community, for the Members and Teams lists |
| `POST area-grants` | `{ member \| team, area, value }`. On opens a row, off ends it; a no-op writes nothing. 400 for an area outside `HELPER_AREA_KEYS`, for an admin ("Admins already work every area") and for a Property Manager ("Use Property management"). 409 for a membership that is not active or a team that is archived |
| `POST teams/[id]/members` | `{ member, role }`: the member must be active in `orgId`. Admin, because joining a committee now grants its areas |
| `PATCH teams/members/[id]` | `{ role }` (member · lead) |
| `DELETE teams/members/[id]` | Removes the row. Its areas stop at once (derived) |

Every write here adds one ledger entry through `writeAuditEntry`. `buildHelperGrantEntry` covers "Oscar Hoffman gave Obie Hoffman Projects" and "…ended Projects for the Landscaping committee". `buildCommitteeMemberEntry` covers "…added Tester Two to the Landscaping committee (Projects, Responsibilities register)". As in `managers/grants`, a failed entry returns `recordError` rather than a clean success.

**Directus.** The HOA Admin create, update and delete on `hoa_team_members` move to `REMOVED_ADMIN_RULES`, so membership changes cannot skip the ledger. That narrows a policy; the operator applies it. `useTeams` writes members through the routes. Archiving or deleting a team still goes through Directus: an archived team's areas stop (derived), with no ledger entry. That gap is stated, not closed.

## Revocation

- `transition-snapshot.ts`: `hasGrants` is also true for a member with an open helper row.
- `transition-execute.ts`'s `revoke_grants` ends those rows too (`end_reason` transition), beside `NO_GRANTS` on `manager_permissions`.
- A membership going inactive or archived, leaving a committee, or the team being archived all end access without a write, because the read needs each to be current.

## What changes elsewhere

- **Team-domain request controls are removed.** `isBoard` in `app/pages/[slug]/requests/[id].vue` is admin or board only. `canManageRequestType` and the "grants manager rights" copy on the team page go away; `domain` stays as a label. Finding, not fixed here: board seats change requests with the user's token through the member policy.
- **The matrix:** `communications:send` and `violations:manage` are deleted from `core/shared/permissions.ts`, and `core/shared/ops/view-as.ts` drops its two labels.
- **Request search:** the "Requests" group in `core/shared/search/index.ts` used `violations:manage` (every property manager, with or without a grant, and the plain "member" board title). Every hit opens `/admin/requests/:id`, which only an admin can open, so it becomes `requires: "admin"`. (Changed from "area violations" while building: the links decide it.)
- **Ops "view as":** `GET /api/ops/communities/[id]` lists helpers and committees with their areas, after the managers.

## What each role sees

| Who | Sees |
|---|---|
| Admin | "Helps with" switches for the four helper areas: on the member's sheet (Members page), below the profile, and on the team page. No presets; every preset includes areas a helper cannot hold. The Members and Teams lists show a "Helps with" chip. Property management is unchanged |
| Helper or committee member | The **member** dock plus `projects-mgr` (in place of the resident `projects`) and `responsibilities-mgr`. Documents and Polls stay the member entries; those pages already show manage controls from the server's `viewer`. Never grant switches, team membership, board terms, money (expenses included), register visibility or module switches |
| Committee lead | As a committee member, plus today's lead rights on the team's projects |
| Property manager | Unchanged |
| Plain member, tenant | Unchanged |

**Layout rule** (`layoutFor`): `manager` when not admin and some area is workable outside `helps`, which is exactly today's rule for managers. Otherwise `member`, with the helper entries. In `navEntriesFor`, an entry with `replaces: "projects"` hides that entry when it shows, and an entry whose path is already shown is skipped.

## Build order (one commit each, gated)

1. This spec.
2. Shared model: `area-grants.ts` (`HELPER_AREA_KEYS`, `holdsAt`, `helperAreasFor`, `planGrantChange`), `resolveRoleContext` `helps` and `canWork`, the two ledger builders, and the matrix and search change, with tests.
3. Schema script for `hoa_area_grants`. The operator runs it.
4. Server layer: `getAreaGrants`, `requireAreaWork` and every caller above; `area-grants` routes; role context; revocation; ops labels.
5. Team-member routes, `useTeams` on them, `REMOVED_ADMIN_RULES`, and the team-domain controls removed.
6. Admin UI: `HelperAreaSwitches.vue` on the member sheet and the team page, "Helps with" chips, and a `/ui-kit` demo.
7. Dock: `layoutFor`, `replaces`, path de-duplication, `helps` through `useNavContext`.

## Named tests

- `tests/shared/area-grants.test.ts`:
  - `holdsAt` bounds;
  - `helperAreasFor` with member rows, team rows, ended and future rows, a non-helper area ignored, and another org's rows ignored;
  - `planGrantChange`: open, end, no-op both ways;
  - helper areas are grantable and gated by server files, and the six "no" areas are absent.
- `tests/shared/role-context.test.ts`, added cases: owner helper · tenant helper · committee member · archived membership holding a row gets nothing · a helper never gets the manager hat or a non-helper area.
- `tests/shared/nav-registry.test.ts`: a helper's dock is the member dock plus their entries · Projects is not shown twice · a manager's layout is unchanged · a helper is never laid out as a manager.
- `tests/server/area-grants-routes.test.ts`, on every route:
  - refusals: 401, 400, 403 for a plain member and for a helper granting themself, 404 for another community's member or team;
  - holders: PM and admin refused, an inactive member or archived team gets 409;
  - writes: a no-op writes nothing, off ends the row without deleting it, a ledger entry is written.
- `tests/server/team-members-routes.test.ts`: the same 401/400/403/404 set; a ledger entry per change; a member of another org refused.
- `tests/server/area-access.test.ts`:
  - helpers: a helper passes `requireAreaWork("projects")` but an expense route refuses them; a helper is not the `property_manager` actor;
  - committees: a committee member holds the team's areas, loses them when removed or when the team is archived, and an inactive membership holds nothing;
  - managers: their access is unchanged.
- `tests/server/transition-execute.test.ts`: `revoke_grants` ends open helper rows.
- `tests/shared/permissions.test.ts`: the two capabilities are gone.
