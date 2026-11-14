# Spec — capability nav (role-first UX, Phase 1b)

Plan: `docs/plan-role-first-ux.md` §2.2. Builds on `docs/spec-role-context.md`. Written 2026-11-14.

One registry, `core/shared/nav/registry.ts`, is the only source of nav entries. The dock, the App Library, the section pills, Spotlight, the mobile sheet, `module.global.ts` and the new `nav-gate` middleware all read it.

## Entry shape

```ts
interface NavEntry {
  id: string; label: string; shortName: string; icon: string; // lucide, no prefix
  path: string;            // org-relative; a hub's path is its fallback landing
  needs: NavNeed[];        // ALL must hold
  section?: string;        // set on a pill: the hub it sits under
  match?: string[];        // extra prefixes that mark it active ("__root__" = "/")
  routes?: string[];       // extra prefixes its module gate covers (legacy URLs)
  description?: string;
}
type NavNeed =
  | { admin: true }
  | { capability: Capability }                 // admin holds every capability
  | { area: AreaKey | "any" }                  // areas[k].canWork; "any" = at least one
  | { residency: "owner" | "tenant" | "any" }
  | { module: ModuleKey | ModuleKey[] }        // a list means any one is on
  | { orgFlag: "show_board" };                 // hoa_organizations boolean, unset = true
```

A hub shows only when its own `needs` hold **and** at least one of its pills shows. It opens on its first visible pill (`dashboard` and `settings` keep their own landing).

## Layouts: the hat picks the layout, `needs` pick what is in it

| Layout | Who | Entries, in order |
|---|---|---|
| `admin` | admin hat, not previewing as a member | `queue` (manager hat only) · dashboard · people · comms · records · payments · requests · settings |
| `manager` | not admin, with at least one `canWork` area | queue · inquiries · directory · approvals · communications · documents · feedback · projects · activity |
| `member` | everyone else, and an admin previewing | home · meetings · documents · rules · governing · board · ledger · payments (Money) · pay · requests · projects · polls |
| `sheet` | mobile sheet's Navigation list | home · board · documents · vendors |

The hat never grants access. It adds the queue to an admin's layout and picks the home route; every entry is still filtered by its `needs`. Previewing evaluates against an empty context (no hats, no areas, no capabilities).

## Entries and gates

Gates as they are today unless marked **new**. "A" = `{admin}`, "m:x" = module x, "cap:x" = capability, "area:x" = canWork.

| Entry (pills indented) | Path | Needs | Route gate |
|---|---|---|---|
| queue | /manage | area:any | `manager` (root: admin or any area, **new**) |
| dashboard | / | A | page |
|   overview · boardroom · activity · ai-spend | / · /admin/boardroom · /admin/activity · /admin/ai-spend | A | admin / auth + page |
| people | /admin/people | A | admin |
|   members · units | /admin/members · /admin/units | A, m:directory | admin |
|   board-roster | /board | A, m:board | auth |
|   teams | /admin/teams | A, m:directory (**new** pill gate; the route already had it) | admin |
|   vendors-admin | /admin/vendors | A, m:vendors (route gate **new**) | admin |
| comms | /admin/communications | A, m:[email, channels, polls] | admin |
|   email (routes /admin/email) · channels · polls-admin (routes /admin/polls) | … | A, m:email · m:channels · m:polls | admin · channel-access · auth |
| records | /admin/reporting | A, m:[meetings, documents, rules, governing, files] | admin |
|   meetings-admin · documents-admin · storage · rules-admin · governing-admin | … | A, m:meetings · documents · files (route gate **new**) · rules · governing | admin / auth |
|   ledger-admin | /admin/ledger | A | auth |
| payments (Money) | /admin/payments | cap:money:read, m:[payments, expenses] | `nav-gate` (**new**, was admin) |
|   payments-admin · expenses | /admin/payments · /admin/expenses | cap:money:read, m:payments · m:expenses | `nav-gate` |
| requests | /admin/more | A | admin |
|   requests-admin · projects-admin · leads · approvals-admin · moderation | … | A (+ m:requests · m:projects · — · — · m:moderation) | admin / auth |
| settings | /admin/settings | A | admin |
|   organization · domains · users · features · billing | … | A | admin |
| home · meetings · documents · rules · governing · ledger | member routes | m:same name (home and ledger: none) | auth |
| board | /board | m:board, orgFlag:show_board (dock **new**: the sheet already had the flag) | auth |
| pay · requests-member · projects-member · polls | /payments · /requests · /projects · /polls | m:payments · requests · projects · polls | auth |
| vendors | /vendors | m:vendors | auth |
| inquiries | /manage/inquiries | area:inquiries | `manager` + inquiries |
| directory-mgr | /manage/directory | area:directory | `manager` + directory |
| approvals | /admin/approvals | area:directory | auth + `change-request-access.ts` |
| communications | /manage/communications | area:communications | `manager` + communications |
| documents-mgr | /documents | area:documents, m:documents (module **new**) | auth |
| feedback | /polls | area:feedback, m:polls | auth + `poll-access.ts` |
| projects-mgr | /admin/projects | area:projects, m:projects | `nav-gate` (**new**, was admin) |
| activity-mgr | /admin/activity | area:activity | auth + `activity.get.ts` |
| (route only) | /feed | m:feed | — |

`module.global.ts` builds its prefix table from every entry with one module key (path plus `routes`) and the route-only list. `nav-gate` admits a route when any entry whose path or `routes` cover it meets its non-module `needs`. Denials redirect as `admin.ts` does.

## Areas without an entry

- `violations` is worked on the inquiries page; it has no page of its own.
- `contact_platform` is an action (the "Contact HOA Connect" request), not a destination.
- `vendors` and `billing` are notify-only: no gate, so no entry.

## Decisions taken with the operator (2026-11-14)

- **Money** goes to holders of `money:read` (Treasurer, President). For them the pages are read-only: the write controls hide for non-admins, because the server lets only admins write.
- **Approvals waits for the board.** No capability covers it, and `isChangeReviewer` admits only admins and managers with Directory. Managers with Directory get it.
- **A manager's dock** is Queue plus their areas. The resident apps leave it (URLs, the sheet and the home page still reach them).

## Home and badge

- `homePathFor(ctx)`: `/manage` when the manager hat is on and some area has `canWork`; otherwise `/`. Login and `/dashboard` use it.
- The org switcher shows each membership's hats from `GET /api/user/hats`, with `managerTitle` after "Manager". The endpoint reads with the admin token, so the client never names the new fields.

## Client context (retires the four compat rules)

`useCurrentDomainAccess` uses the server context once it is loaded for the org being viewed. Until then it runs the shared resolver over the cached membership, now with its real `status`, without the legacy Administrator or global HOA Admin rules, and with the server's date-inclusive term rule (`isCurrentBoardTerm`). `admin`, `admin-or-board`, `manager` and `nav-gate` load the server context on the client before they decide. `isPropertyManagerOfCurrentDomain` stays the role check, used only for copy and the assistant launcher; access reads areas.
