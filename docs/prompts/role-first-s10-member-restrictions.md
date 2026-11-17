# Role-first UX — Session 10 (restricted members: posting paused, membership kept)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is permission work on the live Directus policies: five permission scripts, two new scope fields and a sync that every member write will depend on. A rule that is too narrow stops residents posting; one that is too wide is the gap this session closes. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s10-member-restrictions.md and carry out the prompt in its code block exactly: restricted members (posting paused) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build restricted members: an admin pauses a member's posting in one
community, and the same change stops archived and inactive members writing
through Directus. The spec is confirmed with me and is the brief:
docs/spec-member-restrictions.md. Read it all first. Then read
docs/spec-delegation.md ("Who holds what" and "Routes", for the patterns to
reuse), core/shared/roles/admin-scope.ts and core/server/utils/admin-scope.ts
(the scope fields and their sync), docs/ux-standards.md before any UI, and in
docs/plan-role-first-ux.md only §7 with the Session 8 log and its follow-up.
Do not read the rest of the plan.

What exists, read from the code on 2026-11-17 (re-check each before relying
on it, and log any that has changed):
- Every HOA Member Directus rule is scoped by ANY_MEMBERSHIP
  (scripts/lib/admin-scope-perms.ts), whatever the membership's status. The
  member's write rules live in scripts/setup-directus-permissions.ts (chat
  messages full, mentions read_create, the shared writes) and in
  scripts/create-comments-collections.ts (comments, reactions, comment
  reports), create-requests-collections.ts (requests) and
  create-polls-collections.ts (poll votes). scripts/lib/shared-write-
  validations.ts combines the member, admin and manager branches of a shared
  write into one validation.
- Scope fields on hoa_members (admin_of, manager_of, communications_of,
  inquiries_of) are computed by scopeFieldsOf and written by syncAdminScope,
  through POST /api/internal/sync-admin-scope (a Directus Flow on every
  hoa_members create and update, and a nightly reconcile with all: true).
- The routes that act for a caller and do not check status today:
  core/server/api/hoa/channels/[channel]/notify.post.ts,
  core/server/utils/channel-fanout.ts, channels/[channel]/edit.post.ts.
  org/notify-event.post.ts and support "ask the community" check an active
  membership.
- getHelperAreas (core/server/utils/manager-access.ts) reads helper and
  committee areas; the ledger catalogue is core/shared/ledger/events.ts;
  notifyUsers is core/server/utils/notify.ts; membership names for others
  come from core/server/utils/member-names.ts (ledgerActorFor).

Build in the spec's order, one commit each. The archived-member gap (spec
step 2) goes first and must ship on its own: active_in and posts_in, the
policy scripts switched to them, and their tests. Before writing any rule,
prove on the live instance, read-only, that a Directus filter on
$CURRENT_USER.hoa_members.posts_in admits a member whose membership has it
set and refuses one whose field is null (read the permission back and
reason from Directus's documented behaviour; if it cannot be shown without a
write, say so and ask me). Run pnpm setup:permissions:audit before and after
each permission commit, apply nothing, and list each change under operator
TODOs with the exact counts the audit printed.

Rules: the hat never grants access; a role never sees a control it cannot
use; a stored value is never one that can be derived (the two scope fields
are mirrors for Directus, like admin_of, and say so); no restriction without
a server check and a Directus rule behind it; a new field defaults so that
nobody loses or gains access when the code ships, except archived and
inactive members losing the writes they should never have had. Never raise an
audit baseline.

Test accounts: the five active members of 1033 Lenox are Peter's test
accounts (Peter, Oscar, Camila: admins; Obie: owner and the board secretary,
so he cannot be restricted while his term runs; Tester Two: tenant). Peter
signs in as each on the preview pane; check each with an identity read
before trusting what you see. Oscar's own Directus user has the global role
HOA Member, so the app's writes with his token are refused (Session 8
finding); sign in as Peter for admin writes that use the user's token.
Every write is real: a restriction writes a ledger entry and a bell. Lift
what you impose, and say what you left.

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus. Prefer the sandbox demo
  community (POST /api/demo/login, slug demo) for anything destructive.
- Gate each commit with typecheck, vitest, lint, pnpm audit:all and the
  build, serially, and stop at the first failure (&& between them); the
  pre-commit hook runs the audits and will refuse otherwise.
- New code copies the page it sits in; check it against
  docs/ux-standards.md, not against its neighbours.
- git add -N new files before pnpm audit:all.
- /ui-kit cannot be opened in the preview; add a demo anyway, and say so.
- Say which roles you could not see in the browser.

Out of scope: whether archived members should still READ (log it as a
question), a general moderation console, fines and hearings.

Local session: work on main, ask before pushing. Run the typecheck and the
build with NODE_OPTIONS=--max-old-space-size=6144.

When done: add a Session 10 row to the §7 Status table and a Session log
entry (shipped, what each role now sees, deviations, operator TODOs), and
link the spec from docs/ROADMAP.md. End your reply with the "Start it with"
sentence of the next queued session's prompt (Session 4's,
docs/prompts/role-first-s4-money-approvals.md, unless §7 says otherwise), in
a code block. Then stop.
```
