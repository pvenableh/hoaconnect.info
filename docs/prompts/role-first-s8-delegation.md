# Role-first UX — Session 8 (delegation to members: volunteer and committee grants)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is permission design: who may act for the community, enforced on the server, with a record that cannot be rewritten. A grant that is too wide, or one that a holder can widen for themselves, is a security bug, so the spec and the server layer are Opus work. Census and grep go to Haiku 5.5 subagents. The pages for the new areas may be Sonnet work in a later session if the spec splits them off.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s8-delegation.md and carry out the prompt in its code block exactly: delegation to members (volunteer and committee grants) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build delegation to members: let an admin give a volunteer, or a committee,
some of what a property manager can be given today. Asked by me on 2026-11-16:
"can an admin grant create privileges for specific members if they volunteer
to help or are on a committee?" SPEC FIRST. Do not build until I have
confirmed the spec.

Read, in this order: docs/spec-role-context.md and docs/spec-capability-nav.md,
then in docs/plan-role-first-ux.md only §2.1, §2.2, the "Queued: delegation to
members" section of §7 (the findings and the six-point scope) and the Session 1
and Session 2 logs (what the areas and the grants became), and
docs/ux-standards.md before any UI. Do not read the rest of the plan.

What exists today. It was read from the code on 2026-11-16 and 2026-11-17:
re-check each before relying on it, and log any that has changed.
- The ten grantable areas and the presets: AREAS, MANAGER_GRANT_KEYS,
  normalizeGrants in core/shared/transition/grants.ts. An area is grantable only
  if it has a `gate` file; every key defaults to false.
- Who holds a grant is decided in ONE server place: getManagerGrants and
  requireAdminOrManagerGrant, core/server/utils/manager-access.ts. It reads
  hoa_members.manager_permissions only for an active member holding the
  Property Manager role (config.public.directusRolePropertyManager). About 25
  files read grants or call it: find them with grep, do not trust this list.
  Among them role-context (core/server/utils/role-context.ts and
  core/shared/roles/role-context.ts: areas[k].canWork), board-access,
  change-request-access, governing-access, poll-access, project-access,
  responsibility-access, support, activity.get, ledger.get, invitations and
  accept-invitation, and on the client useSelectedOrg and
  useCurrentDomainAccess.
- POST /api/org/managers/grants (core/server/api/org/managers/grants.post.ts):
  admin only; refuses anyone who is not a property manager ("That member is not
  a property manager."); writes one ledger entry through buildGrantChangeEntry
  (core/shared/ledger/entries.ts); a no-op writes nothing. The switches and
  presets are app/components/pages/SettingsPropertyManagementPage.vue.
- The Directus side. hoa_members carries scope fields (admin_of, manager_of,
  communications_of, inquiries_of), kept by core/shared/roles/admin-scope.ts
  through the sync route and Flows; the Property Manager policy scopes by them.
  A volunteer is a plain HOA Member: no Directus policy gives them a ceiling.
  So an area can be held by a helper only if every read and write it needs goes
  through a server route. An area whose page reads Directus with the user's own
  token (inquiries, the communications recipients) cannot be held until it does.
- Teams: hoa_teams and hoa_team_members. A team lead gets projects:write and
  milestone:approve on their team's projects (board-access.ts,
  project-access.ts). A team whose domain matches a request's type gets
  board-style controls in app/pages/[slug]/requests/[id].vue (`isBoard`), and no
  server route was found that honours it.
- core/shared/permissions.ts lists communications:send (President) and
  violations:manage (board). Sending email checks
  requireAdminOrManagerGrant(..., "communications"), which admits admins and
  managers only: the two capabilities are in the matrix and enforced nowhere.
- The capability nav: core/shared/nav/registry.ts. An area entry needs
  { area }, and documents-mgr / responsibilities-mgr are the pattern for a
  holder's dock entry. The manager layout lists them.
- Revocation: core/server/utils/transition-execute.ts and transition-snapshot.ts
  walk MANAGER_GRANT_KEYS when account ownership moves. A new kind of holder has
  to be walked too, or a grant outlives the person.
- Ops "view as" labels: core/server/api/ops/communities/[id].get.ts.

Write docs/spec-delegation.md (under 150 lines), in the shape of
docs/spec-responsibilities.md: the model, who may call each route, what each
role sees, the named tests. Settle these with me as short decisions, each with
your recommendation, before writing the build list. Do not guess:
1. Who can hold a grant: any active member, one at a time (a "helper"); a team
   as a whole (a "committee"), whose members hold its grants while they are on
   it; both? Owners and tenants alike?
2. Where the record lives. Keep hoa_members.manager_permissions and drop the
   role check, or a new collection (a grant: the member or the team, the area,
   who granted it, start and end dates) so a grant has a history, as board
   terms and register holders do ("end, don't erase")? Recommend one. There are
   no live organisations, so no migration plan is needed.
3. Which of the ten areas a helper may hold, given the Directus-token problem.
   For each: server-only today, or needs a route first.
4. New areas: announcements (post and edit), events and meetings (create and
   edit, not minutes approval), and perhaps a committee's own documents folder.
   For each: its gate file, what a holder sees in their dock, what they never see.
5. The team-domain request controls: a server check, or take the controls out.
6. communications:send and violations:manage for board seats: enforce or drop.
7. The admin's UI: grant from the member's page and from the team page, the same
   switches and presets as Property management; every change in the ledger.
8. What stays admin-only whatever is granted: grants themselves (a holder cannot
   widen their own, and the activity record says who granted what), board terms,
   money, the register's visibility switches.
9. The split: what is this session and what is a later one. Propose it.

After I confirm, build in the order the spec gives, one commit each, gated as
below. At minimum: the shared model and its table tests; the server layer
(getManagerGrants and every route that calls it, org-scope tests: 401, 400, 403
for a plain member, 404 for another community's member or team, on every route);
the admin UI; the dock entries for holders. Each new gate file is named in
AREAS in the same commit that gives the area its gate: never a switch with
nothing behind it.

Rules: the hat never grants access; a role never sees a control it cannot use;
a stored value is never one that can be derived; no grant without a server
gate; a grant never widens an existing person's access when the code ships
(a new key defaults to false). Do not widen any Directus policy: run
`pnpm setup:permissions:audit` before and after, apply nothing, and list any
change under operator TODOs.

Test accounts. The five active members of 1033 Lenox are Peter's own test
accounts, and he has said they may be used for roles and permissions:
- Peter Hoffman: the global Administrator.
- Oscar Hoffman and Camila Hoffman: HOA Admin.
- Obie Hoffman: a plain HOA Member, owner, unit 100, with a login. The helper.
- Tester Two: a tenant, unit 202, linked to a personal address. A committee
  member, or a tenant helper.
No manager exists there: a Property Manager membership is needed to compare a
manager with a helper. You cannot type passwords: Peter signs in as each on the
preview pane and says so, and you check each with an identity read (the
session's user id against hoa_members) before trusting what you see. Every
write there is real: a grant writes a ledger entry. Revoke what you grant when
you are done, and say what you left.

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus (DIRECTUS_URL in .env is
  admin.hoaconnect.info). 1033 Lenox is a real community whose members happen to
  be test accounts today: prefer the sandbox demo community (POST
  /api/demo/login, slug `demo`, is_demo, an admin there) for anything
  destructive, and ask before a bulk delete.
- Leaving the admin's "Member" preview on redirects admin routes to member pages
  until Exit is pressed. A preview is not a login as another role.
- The scratchpad can be cleared overnight. Keep scripts you need again out of it.
- /ui-kit cannot be opened in the preview; add a demo anyway, and say it was not
  seen.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.
- Say which roles you could not see in the browser.

Out of scope: money approvals (Session 4), the responsibilities map (Session 9),
a general roles editor, per-record sharing.

Local session: work on main, ask before pushing. Run
`eval "$(/opt/homebrew/bin/fnm env)"` in a tool shell only if node is not on
PATH (it usually is). Rules, token rules and the quality gate are the earlier
briefs': per commit, typecheck 0, vitest green, build green (serially),
pnpm audit:all at or under baseline, lint under the warning cap. Run the
typecheck and the build with NODE_OPTIONS=--max-old-space-size=6144. Never raise
an audit baseline.

When done: update the §7 Status row for Session 8, append to the Session log
(shipped, what each role now sees, deviations, operator TODOs), and link the
spec from docs/ROADMAP.md. End your reply with the "Start it with" sentence of
the next queued session's prompt (Session 4's,
docs/prompts/role-first-s4-money-approvals.md, unless §7 says otherwise), in a
code block. Then stop.
```
