# Spec — RoleContext (role-first UX, Phase 1a)

Plan: `docs/plan-role-first-ux.md` §2.1. Written 2026-11-14. No behaviour visible to a user changes in this phase.

## Shape

One `RoleContext` per membership (`hoa_members` row: one person in one community), resolved on the server.

```ts
interface RoleContext {
  orgId: string | null;
  membershipId: string | null;
  residency: "owner" | "tenant" | "none";
  hats: { board: boolean; manager: boolean; admin: boolean }; // additive
  areas: Record<AreaKey, { canWork: boolean; isNotified: boolean }>;
  isAccountOwner: boolean;
  managerTitle: string | null;
  source: "hat" | "legacy"; // were the manager fields on the row? (degrade marker)
}
```

## Where each field comes from

| Field | Source | Notes |
|---|---|---|
| `residency` | `residencyFor(membership)`, `"none"` when it returns null | The unit link first, `member_type` as fallback (`core/shared/members/residency.ts`). |
| `hats.admin` | Platform App Admin role on the session, or a membership role in the admin role ids | Server admin ids are `[HOA Admin]`, as `checkAdminAccess`. Counts for `active` and `pending`, as today. |
| `hats.board` | The current-term `hoa_board_members` rows the caller passes in | "Current" is the caller's read. Server: Directus filter, date-inclusive, as `getBoardPosition`. |
| `hats.manager` | `hoa_members.is_manager`; before the schema script, `role === Property Manager` | Identity only. Never read for access. |
| `managerTitle` | `hoa_members.manager_title` when the manager hat is on, else null | |
| `areas[k].canWork` | `hats.admin`, or (`role === Property Manager` and `manager_permissions[k] === true`) | Only for an area with a gate (below). Identical to `requireAdminOrManagerGrant`. |
| `areas[k].isNotified` | Manager hat and `manager_areas[k].notify === true` | False everywhere before the schema script. |
| `isAccountOwner` | Agency-billed: `billing_accounts.owner`, or a `billing_account_members` row with role `owner`. Self-billed: the HOA Admin role on an active membership. | A self-billed community has no owner field; its admins pay. Platform staff are never the account owner. |

**Membership status.** `active` gets everything. `pending` gets the admin hat only, because `checkAdminAccess` already admits pending admins. `inactive` and `archived` get nothing: every hat, area and `isAccountOwner` comes back false.

**Why `canWork` reads `manager_permissions`, not `manager_areas.work`.** Every enforcement path reads `manager_permissions`: `getManagerGrants`, poll, project and activity access. The grants route, invitations and transition revocation all write it too. If the context read a second store, it would drift from what the server enforces the first time an admin changed a grant. The schema script back-fills `manager_areas[k].work` as a mirror. It becomes the source in one change that moves the writers and the readers together (operator TODO in the plan log).

**Why access requires the Property Manager role and not the hat.** That is the condition the server enforces today (`getManagerGrants` filters on the role). The hat is identity: badge, queue-first home, routing, assignment default.

## Areas

There is one list: `AREAS` in `core/shared/transition/grants.ts`. It is the only source for the server and the client. `MANAGER_GRANT_KEYS`, `ManagerGrantKey` and `MANAGER_GRANT_LABELS` are derived from it. They keep their order and meaning, so presets, revocation, the ledger and the settings screen are unchanged.

| Key | Label | Work gate (where "can work" is enforced) |
|---|---|---|
| `inquiries` | Inquiries | `manager.ts` middleware (page); Directus PM policy is the ceiling |
| `violations` | Violations | `managerCan` on the inquiries page; Directus PM policy is the ceiling |
| `directory` | Directory | `manager.ts` middleware, `change-request-access.ts` |
| `documents` | Documents | `governing-access.ts`, `documents/publish` |
| `communications` | Communications | the `/api/email/*` routes |
| `feedback` | Community feedback | `poll-access.ts` (`requirePollManage`) |
| `projects` | Projects | `project-access.ts`, `expenses/record`, `requests/[id]/promote` |
| `activity` | Activity | `GET /api/org/activity` (data scope) |
| `contact_platform` | Contact HOA Connect | `support.ts`, `support/requests` |
| `vendors` | Vendors and contracts | none yet: notify-only |
| `billing` | Invoices and payments | none yet: notify-only |

An area with no gate cannot be granted. It is not in `MANAGER_GRANT_KEYS`, not in a preset and not in the settings switches, and its `canWork` is admin-only. It becomes grantable in the same change that adds its gate. `projects`, `activity` and `feedback` are kept, because each already has a server gate. What they lack is a page, and pages are Session 2.

## Vendor ↔ manager link (plan's "(verify)": confirmed, with a correction)

`hoa_vendors` has two optional links: `user` (to `directus_users`) and `hoa_member` (to `hoa_members`). It also has `management_role` routing, `notify_email`/`notify_inapp` and `active_since`/`active_until`. Only `user` is read, by `inquiry-routing.ts`, to add the in-app recipient. Neither link is checked against a membership or used for access, and nothing ties a manager's membership to an engagement. So the engagement, ending one, and staff sharing one are all still to build (plan §2.1 "Staff of a company"). This phase does not read vendors.

## Fallback when nobody is notified

`resolveNotified(orgId, area)` returns the user ids of the org's active members who have the manager hat and notify on for `area`. When that list is empty, it returns the org's active HOA Admins instead, with `via: "admins"`. The result is deduped and has no null users. A member's own notification preferences still pick bell, push or email; this only picks who. It is not wired into the reminder engine in this phase.

## Degrade (before `scripts/add-manager-hat.ts` has run)

- Server reads of `hoa_members` use `*`, because naming a missing field fails the whole read. The resolver treats `is_manager === undefined` as legacy: `source: "legacy"`, hat = the Property Manager role, `managerTitle` null, nothing notified.
- So `resolveNotified` falls back to admins until the field exists and someone is switched on.

## Client

- `useRoleContext()` calls `GET /api/org/role-context?orgId=` and returns `{ context, actors, capabilities }`, cached per org.
- `useCapabilities` reads its actors and capabilities from it. Same return, same values: the endpoint computes them exactly as `/api/org/capabilities`, which stays.
- `useCurrentDomainAccess` has to answer synchronously, because route middleware runs before any fetch. So it runs the same resolver over the cached membership (`roleContextFromMembership`). Today's client rules that differ from the server are kept as named compat clauses, so nothing it returns changes. Session 2 retires them:
  - every cached membership counts as live, whatever its status;
  - the legacy `Administrator` role id counts as admin;
  - the HOA Admin global role plus any membership counts as admin;
  - board terms use the client's own date filter.
- `isPropertyManagerOfCurrentDomain` stays the role check, not the hat, because `manager.ts` uses it for access.

## Endpoint

`GET /api/org/role-context?orgId=`:
- 401 without a session; 400 without `orgId`.
- 403 when the caller has no membership in that org and is not the App Admin.
- Every read is filtered by the session user and that `orgId`. Any user id in the query is ignored.

## Named tests

`tests/shared/role-context.test.ts` (pure resolver, table):
tenant · owner · owner on the board · manager with grants · manager who is admin (hat kept) · account owner who is a management company · two managers with different areas · one person, different hats in two communities · archived membership · pending membership (admin only) · legacy row (no manager fields) degrades to today.

`tests/shared/areas.test.ts`: every area has a label · grant keys derive from areas, in the old order · no gate means not grantable · presets cover exactly the grant keys.

`tests/server/role-context-org-scope.test.ts`: 401 · 400 · 403 for another org · reads filtered by session user and orgId · query user id ignored · billing owner sees `isAccountOwner`.

`tests/server/resolve-notified.test.ts`: area managers when on · admins when nobody is · not another org's members · legacy rows fall back to admins.

`tests/composables/useCurrentDomainAccess.test.ts`: returns are unchanged across admin / PM / board / archived-row cases.
