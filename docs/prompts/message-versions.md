Build "versions" of a community email: an author-approved short summary and translations, made once at send time, with
each member choosing which version they get by default. Start a session with
"Read docs/prompts/message-versions.md and do Session N." Do that session only, commit locally, report, and stop.

Session 0 comes first: it reads, writes the plan, and gets Peter's decisions. Nothing is built before his go-ahead.

Suggested model is on each session. Sessions run one at a time, in order.

## Why this exists

Peter's idea (2026-11-10): members choose how much they read. It applies to ordinary communications only. Anything with
legal effect is excluded. He is building HOA Connect as a platform for many communities and wants each feature weighed
for income, so the plan must say how this earns.

## Rules that hold everywhere

- **The author's message is the original.** A version never replaces it. The full original is always one tap away, and
  every version is labelled as a summary or as a translation.
- **A person approves every version before it is sent.** Versions are generated at send time and shown to the author,
  who may edit them. Nothing is generated per reader, and no member ever sees text nobody approved.
- **Dates, times, amounts, addresses, names and deadlines are carried over exactly.** They are where a summary or a
  translation goes wrong and where a mistake costs a member something. The plan must say how this is checked in code
  (for example: every date and amount in the original must appear in the version, or the author is warned).
- **Legal-effect messages get no versions.** At minimum: violation notices and fines, assessment and dues notices,
  meeting and election notices, anything with a deadline to respond or a right to a hearing. Exclude by message type,
  off by default, not by a per-message judgment. By-laws, rules and financial statements are out of scope entirely.
- **A translation of anything official is a courtesy copy** and says so; the original language governs.
- **Enforced on the server.** A member's chosen version is applied where the message is rendered, not only in the page.
- **Follow the repo:** naming, layout, components, permission model, pnpm. No new dependency without telling Peter why.
- `.env` points at the production-domain Directus and holds live keys. Never print a value. **Every Directus write
  (collection, field, permission) needs Peter's yes for that action in that session.** Schema scripts do a dry run
  first (names and counts only), show it, then ask. Never edit an existing create script; add a new one.
- Live Stripe is read-only for the agent. No live charge, ever.
- Work on main. It auto-deploys, so NOTHING is pushed unless Peter says so in that session.
- The agent never types a password. If a check needs a sign-in on the production site, ask Peter to do that step.

## Token discipline (read before the first tool call)

- Only Session 0 may use Explore agents (one, see below). Later sessions read the plan, the files their section names,
  and what grep points to.
- Never read `core/types/directus.ts` whole (108 KB): `grep -n "interface HoaEmail " -A60 core/types/directus.ts`.
- `app/components/pages/EmailComposePage.vue` is about 2,000 lines. Grep for the part you need, then read ~80 lines.
- Grep with `-n | cut -c1-140 | head`. Don't re-read a file after editing it.
- Node first, in every shell: `eval "$(/opt/homebrew/bin/brew shellenv zsh)"; eval "$(fnm env --shell zsh)"; fnm use 22.22.1`
- Touched tests first. Full gates once, at the end, in the background, and read each one's own exit code:
  `pnpm test`, `pnpm lint` (≤148 warnings), `pnpm audit:all`, `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`.
- Dev server: `preview_start {name: "hoaconnect"}`. It comes up on port 3002 and needs about 20 seconds before the
  first navigate. A "what's new" sheet covers screenshots: prove UI work with page text.
- Ask Peter decisions in one `AskUserQuestion` batch (≤4), recommendation first. Summaries ≤8 lines.
- If a session grows long: commit, write what's left under "Where things stand", stop.

## Where things stand (2026-11-10)

Nothing is built. A read-only pass on 2026-11-10 found the following. **It was not checked file by file; Session 0
verifies each line it relies on.**

- **Email is the main channel.** `hoa_emails`: `content` is HTML, `content_mode` is `visual` (Tiptap) or `mjml`;
  `email_type` is `basic | alert | newsletter | announcement | reminder | notice`; `email_class` is `essential` (dues,
  meetings, governance) or `community`. Rules for the class: `core/shared/email/email-class.ts` (`defaultEmailClass`,
  `canBeEssential`). `email_class` is the natural exclusion hook but is not an exact "legal effect" flag, and elections
  are not typed anywhere.
- **Send path:** `core/server/api/email/send.post.ts` → `core/server/utils/email-send-enqueue.ts` →
  `email-send-tick.ts` → `email-send-render.ts`, which renders per recipient (`RenderTarget`). A member's version
  would be chosen there.
- **Compose:** `app/components/pages/EmailComposePage.vue`, reached from `app/pages/[slug]/admin/communications/compose.vue`.
  AI drafting already charges the wallet from compose: `core/server/api/email/ai-generate.post.ts`.
- **Reminders** (dues, assessments, meetings, violations, polls): `core/server/utils/reminders.ts`, templates in
  `core/server/emails/*.mjml`. These are legal-effect or close to it: excluded.
- **Out of the first version:** channel chat (`hoa_channel_messages`; created in the browser, no server step at send
  time), the retired `hoa_announcements` authoring, and translating the app's own interface (there is no i18n
  framework; translating messages does not need one). No SMS exists.
- **AI:** `getLlmProvider()` in `core/server/utils/llm/provider.ts`; `MODEL_TIERS` in `core/shared/ai/credits.ts`;
  wallet in `core/server/utils/ai-wallet.ts` (`chargeForCompletion`, `getWalletSummary`, `AiFeature`, which already has
  an unused `"summarize"`). Each feature checks the balance itself and answers 402 at zero. A worked example of the
  whole pattern, with tests that fake the model and the wallet: `core/server/utils/governing-suggest.ts` and
  `tests/server/governing-suggest.test.ts`.
- **Plans:** `subscription_plans` has Stripe price ids, `included_credits` and unit bands; `features` on a plan is
  display text only. **Nothing gates a feature by plan.** `useModules` is a per-community on/off switch, not tied to
  plans. Credits: monthly allowance per plan (`ensurePlanAllowance`), top-up packs (`CREDIT_PACKS`), Stripe webhook.
- **Member settings:** `directus_users.language` exists; `notification_preferences` JSON is served by
  `core/server/api/user/notification-preferences.get.ts` / `.patch.ts`. No language field on members or communities.
- **Income, as discussed with Peter:** each version spends the community's credits at send time (works with no new
  billing code); the larger lever is languages as a higher-plan feature, which needs plan gating built first.
- `docs/prompts/launch-followups.md` is a separate track about signup and Stripe. Read its "Where things stand" before
  planning anything that touches plans, so the two do not collide.

Each session appends its own "Session N done" bullet here: what exists, where, what was deferred.

---

## Session 0 — verify, plan, decide (no code, no writes) · strongest model

1. One Explore agent, "medium", to confirm the findings above with file and line, and to answer what the first pass
   did not: how an email's audience and recipients are resolved; how the HTML body reaches the per-recipient render
   and whether `mjml` mode can carry a second body; whether members also read a sent email inside the app (an inbox
   or archive page) and where; how the compose page saves a draft; where the unsubscribe and "essential" rules are
   applied; what the Stripe plans look like today (names and bands only, no prices printed from live Stripe).
2. Write `docs/plan-message-versions.md`: findings; the data shape for versions (new fields or a new collection, and
   why); the generate-and-approve step in compose; the exact-values check; the exclusion rule as a table of
   `email_type` × `email_class` → allowed or not; the member preference and where it is enforced; what plan gating
   would take and whether it belongs in this feature or its own track; cost per send in credits, estimated from
   `MODEL_TIERS` pricing for a typical message; a test map; and the build sessions with a model for each.
3. Ask Peter, in one batch, the decisions the plan cannot make. Expect at least:
   - Two levels (short and full) or three, and what a third level would contain that the author did not write.
   - Which languages first, and whether the community or the platform chooses them.
   - Included for everyone and paid by credits, or held to a higher plan (which means building plan gating first).
   - Whether the author must approve every version on every send, or may trust a translation after the first few.
4. Record his answers in the plan and under "Where things stand". Stop. No code before his go-ahead.

## Session 1 — storage, generation, author approval · strong model

To be written by Session 0 from the plan. Expected shape: the schema script (dry run, Peter's yes), a server route
that generates the versions for a draft email and charges the wallet, the exact-values check, the approval step in
compose, the exclusion rule enforced on the server, tests with the model and wallet faked. No member-facing change.

## Session 2 — member preference and delivery · strong model

To be written by Session 0. Expected shape: the preference, per-recipient rendering of the chosen version with the
original linked, the in-app view if one exists, tests that a member with no preference gets the original and that an
excluded message never carries a version. Ends with one real send to Peter only, with his yes.

## Session 3 — plan gating · strongest model (only if Peter chose to gate by plan)

To be written by Session 0, after reading `docs/prompts/launch-followups.md`. It touches billing, so it gets its own
session and its own stop.
