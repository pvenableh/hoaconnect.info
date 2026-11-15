# Role-first UX — Session 6 (Phase 2b, responsibilities register, part 1)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. The spec, schema, area and routes are data-model and security work. Census and grep go to Haiku 5.5 subagents. Part 2 (the pages, Sonnet 5.5) is Session 7, and this session writes its prompt.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s6-responsibilities.md and carry out the prompt in its code block exactly: Phase 2b part 1 (responsibilities register: spec, shared code, area, schema, routes) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the first half of Phase 2b, the responsibilities register. The
brief is the code block in docs/prompts/responsibilities-register.md:
read all of it, with the seed-list appendix. Do its commits 1 to 5 here:
the spec, the pure shared code, the area, the schema script and the
server routes. Commits 6 to 9 (Board tab, admin register, owner view,
service history) are Session 7.

Read what that brief names in docs/plan-role-first-ux.md (§2.1, §2.3,
§3.4 with "History: end, don't erase", the Phase 2b row of §4, and §7
with its Session log), and docs/ux-standards.md. Do not read the rest
of the plan.

Phase 2 has shipped, so the brief's AppDataTable fallback does not
apply. What Session 3 left you (do not rebuild):
- docs/spec-resource-scaffold.md. useResource(def, { orgId, reuse }) in
  core/app/composables/useResource.ts: rows shared through useState by
  an index and its panel, search, one status filter, more filters,
  selection, the open panel on ?slide=, and remove through useConfirm.
  Reads go only through def.load, so the register's load is the GET
  index route and the owner view's is GET published. Shape the route
  responses for that.
- AppResourceIndex (app/components/App/ResourceIndex.vue): titled or
  headless, count, search, the status segment, #filters for Selects,
  #bulk, and an empty state with the create action. It has no grouping
  yet. Session 7 adds grouped rows with sticky headers to the scaffold,
  not to the register page; say so in the spec.
- Panel registry entries (app/components/panels/registry.ts) carry
  resource, index and page. A record page mounts AppResourceRecordPage
  and carries its index's middleware, and
  tests/components/panel-registry.test.ts checks that the nav registry
  gates it as it gates the index. Name the register's panel type, index
  and record route in the spec; Session 7 builds them.
- Charges is the worked example: core/app/composables/useChargesResource.ts,
  app/components/panels/ChargePanel.vue, and the Charges tab of
  app/pages/[slug]/admin/payments/index.vue.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `eval "$(/usr/local/bin/fnm env)"` in every one when fnm
is at that path. Never run a schema script against production: write it,
dry-run it, and list it under operator TODOs.

Time matters: the 1033 Lenox board is seated 2026-12-09 and needs the
grid and the PDF. If commits 1 to 5 cannot land in one session, say so
early in the log, and name which of them Session 7 must finish first.

Token rules, the quality gate and the rules are the brief's. Run the
build with NODE_OPTIONS=--max-old-space-size=6144 as well as the
typecheck: it runs out of heap without it.

When done: update the §7 Status row for Session 6, add the Session 7
row, and append to the Session log (shipped, deviations, operator TODOs: the
schema script and type regeneration). Write
docs/prompts/role-first-s7-responsibilities-pages.md for commits 6 to 9,
with its model (Sonnet 5.5) and a "Start it with" line under its Model
line. Link the spec from docs/ROADMAP.md. End your reply with that one
sentence, in a code block. Then stop.
```
