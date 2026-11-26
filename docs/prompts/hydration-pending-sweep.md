# Hydration — pages that render blank after a `server: false` load

Model: Sonnet 5.5 (`claude-sonnet-5-5`). Found on 2026-11-26 (`12f80ce4`): `/manage/inquiries` showed an empty list although `/api/org/inquiries` returned rows. `useAsyncData(..., { server: false })` is `"idle"` on the server, so `pending` is false and the server renders the empty state; the client's first render has `pending` true and renders the skeleton. Hydration mismatches ("Hydration completed but contains mismatches" in the console), Vue keeps a detached node, and when the data arrives the list is patched into it: the page stays blank with no error. The fix there: `const pending = computed(() => status.value === "idle" || status.value === "pending")`, so the server and the client's first render both show the loading state. Fixed so far: `manage/inquiries/index.vue`, `manage/inquiries/[id].vue`, `manage/directory/index.vue`.

Candidates (`server: false` and a template that branches on `pending` / `loading` / `isLoading`; not all are broken, some flags come from elsewhere):

`app/components/Admin/SettingsGlance.vue`, `app/components/projects/OrgTimeline.vue`, `app/components/panels/RequestPanel.vue`, `app/components/pages/{EmailComposePage,UnitsPage,MembersPage,UsersPage,EmailPage}.vue`, and under `app/pages/[slug]/`: `payments/index.vue`, `projects/index.vue`, `projects/[id].vue`, `admin/expenses/index.vue`, `vendors/index.vue`, `admin/units/[id].vue`, `profile/index.vue`, `polls/index.vue`, `requests/index.vue`, `requests/[id].vue`, `admin/leads.vue`, `admin/projects/[id].vue`, `admin/requests/index.vue`, `admin/requests/[id].vue`, `admin/communications/audience/index.vue`, `documents/[id].vue`.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/hydration-pending-sweep.md and carry out the prompt in its code block exactly: find and fix every page that hydrates on a mismatched loading state, on main, committing locally and asking before you push.

```
Find and fix every HOA Connect page whose loading state differs between the
server render and the client's first render, on main. Don't push. All orgs
are test data.

1. Confirm before fixing. For each candidate in the prompt file (and any other
   `server: false` useAsyncData/useFetch whose template branches on its
   pending/status), load the page in the Browser pane through the dev server
   (preview_start "hoaconnect") signed in as the right demo login (demo@,
   demo-board@, demo-tenant@ from .env DEMO_USER_EMAIL / DEMO_USER_PASSWORD,
   others from core/shared/demo/scenario.ts; read only those keys, never
   `source` .env), on the demo org (slug `demo`). Read the console for
   "Hydration" warnings on a fresh navigate, and check the page shows its
   data. Seed a row with the Directus MCP when the demo org has none to show
   (it had no requests until 2026-11-26).

2. Fix only the confirmed ones, in the pattern of 12f80ce4: take `status`
   from useAsyncData and derive
   `pending = status === "idle" || status === "pending"` so the server and
   the first client render agree. Where a page needs no SSR markup at all, a
   <ClientOnly> with the same loading fallback is acceptable; say why.
   Never edit app/components/ui (shadcn stays default).

3. Guard it: add a test (tests/shared or tests/app, whichever the repo uses
   for page-level checks) or a scripts/audit-all.ts audit that flags a
   `server: false` data call whose template branches on `pending` without
   counting "idle" as loading, with the fixed pages as its baseline of 0.

4. Verify each fixed page in the browser again (no Hydration warning, data
   shows), then run the full test suite and `pnpm typecheck` once at the end.
   Commit locally with a message per logical group; ask before pushing.

When done: list which candidates were broken and which were fine, and end
with the starter sentence for the next session and the model to run it on.
```
