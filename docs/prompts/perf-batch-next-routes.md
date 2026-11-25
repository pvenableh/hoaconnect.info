# Perf — find and batch the next slowest routes

Model: Sonnet 5.5 (`claude-sonnet-5-5`). Already batched on `main` (local, unpushed): money routes, the ledger, ai/notices, responsibilities, the home cards, channels/unread, hoa/find, then `0aa07caf` (org/my-household, 9 → 1 request), `f3330980` (governing overview/documents/search, 7 → 2) and `a0a03502` (support/context, 6–12 → 1).

Parked for later, not part of this prompt:

- **Cache the public find route in Nuxt.** `hoa/find` returns a community's public record, the same for every visitor, so a short Nitro cache (`defineCachedEventHandler` or route rules, keyed by community) would skip Directus entirely on repeat visits. Batching can't beat that. Needs a decision on how stale a public record may be and how an edit clears it. Only public, per-community responses qualify; per-user routes do not.
- **More Directus instances.** Batching works around one CPU-bound Directus process. Running one copy per spare vCPU on the droplet (the Docker image's `PM2_INSTANCES`; confirm the name in the Directus config docs) would speed every route. Blocked on knowing the droplet's vCPU count.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/perf-batch-next-routes.md and carry out the prompt in its code block exactly: measure, then batch the three slowest unbatched routes, on main, committing each locally and asking before you push.

```
Make the next slowest HOA Connect API routes much faster without changing
their responses, one commit per route, on main. Don't push. All orgs are
test data.

Why it works: Directus (admin.hoaconnect.info, 11.13.4) spends ~40ms of CPU
per authenticated request and serves concurrent requests nearly one after
another, so the fix is FEWER requests, not more parallelism. One GraphQL
query covering several collections takes ~105ms.

1. Measure first. Start your OWN dev server on a free port (3005 worked; add
   a temporary `.claude/launch.json` config with NUXT_PORT and a different
   Vite HMR PORT, and revert it before committing). Log in with curl as
   demo-board@, demo-tenant@ and the .env DEMO_USER_EMAIL admin, all with
   .env DEMO_USER_PASSWORD; read only those keys, never `source` .env. Demo
   org 8628b141-4e01-4998-b084-9c2f50547d03. Count Directus requests per
   route with a temporary server/plugins/ Nitro plugin that subscribes to
   diagnostics_channel "undici:request:create" and sets an x-dx-count
   response header (stop the server BEFORE deleting the plugin). Rank the
   routes the main pages call (app/composables/use*.ts) by request count
   and 30-request median; skip everything already batched. Pick the top
   three. Start with routes that still call `isActiveBoardMember(`
   (channel-enrollment.ts) instead of `activeBoardMemberFrom(snapshot)`.

2. For each route: record baseline responses per persona and query variant
   (including 400/401/403; compare with dev `stack` stripped), fold
   independent reads into one `readItemsBatch` (core/server/utils/
   directus-graphql.ts) or `batchWithAccessSnapshot` (access-snapshot.ts),
   and take admin/membership/board/manager/helper answers from the access
   snapshot. Never return rows a caller may not see: a 403 may come after
   the batch but with no data, unless a test says refusal must come before
   any read (governing-read.test.ts does; keep such rules).

3. Prove equivalence on live data: a temporary vitest file (not committed)
   with `// @vitest-environment node`, a live @directus/sdk client and the
   real helpers stubbed as globals, comparing old logic (git show HEAD:…)
   with new across every user and community. Demo data is sparse: Directus
   has no vehicle, pet or lease rows; governing data is only in org
   5f00fc6d. Add committed unit tests for new pure logic. For route tests on
   MemoryDirectus, stub readItemsBatch with tests/server/support/
   memory-batch.ts (declare the m2o/o2m relations; stubbing it globally also
   makes accessSnapshot batch, so declare hoa_members.board_member_terms).

Read first: the notes in the shared side-session notes folder if one is
named, the three commits above (their messages say how each was checked),
and core/server/utils/household-reads.ts, support-context.ts and
governing-data.ts as the pattern.

Gotchas: GraphQL returns decimals as numbers (readItemsBatch converts them);
count with CountSpec; in zsh never name a loop variable `path`; vitest's
happy-dom strips Authorization on cross-origin fetch (live checks need the
node environment); the shared Directus is noisy, so re-time outliers with 30
requests and A/B back to back when a change looks like a regression.

Done means: identical responses for every recorded case, a big median drop,
and `pnpm exec vitest run`, `pnpm exec eslint <changed files>` and
`pnpm typecheck` all clean. The pre-commit hook runs scripts/audit-all.ts:
never raise a baseline; `await` instead of detaching promises. Each commit
message gives before/after medians, request counts and how equivalence was
checked, ending with the Co-Authored-By trailer. At the end, report a
before/after table and the next starter sentence.
```
