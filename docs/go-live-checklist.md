# Go-live checklist — Storage, Notifications & Stripe add-on

Operator runbook for everything shipped this round that needs env/dashboard/droplet
setup before it works. Deep-dive docs are linked where they exist.

## Where each piece runs

| Host | Runs | Env lives in |
|---|---|---|
| **Vercel** | the Nuxt app — UI, API routes (storage meter, add-on toggle, preferences API), the composer | Vercel → Project → Settings → Environment Variables |
| **DigitalOcean droplet** | **Directus** + **workers** (the digest worker) | Directus compose/`.env` on the droplet; the worker's own `.env` / crontab |

Rule of thumb: **Stripe + storage-tunable env → Vercel** (the app reads them);
**Spaces backend + worker env → the droplet.**

---

## 1. Stripe — the "Extra Storage" add-on price

The paid **Extra Storage (+100 GB)** add-on is a recurring **$10/mo** Stripe price.
You create it once in **test** and once in **live**, then point env vars at each.
Without these the Settings toggle returns a clean `503` (nothing breaks).

The app picks test vs live from `STRIPE_MODE` (`test`|`live`), falling back to
`NODE_ENV` — so set **both** price vars and flip `STRIPE_MODE` to test the flow.

### In the Stripe dashboard
- [ ] **Test mode** → Products → **+ Add product**: name `Extra Storage`, recurring,
      **$10.00 / month**. Copy the **Price ID** (`price_...`).
- [ ] **Live mode** → same product, **$10.00 / month**. Copy the live **Price ID**.

### Env (Vercel, server-only)
- [ ] `STRIPE_PRICE_ADDON_STORAGE_100_TEST=price_...` (test price id)
- [ ] `STRIPE_PRICE_ADDON_STORAGE_100_LIVE=price_...` (live price id)

### Prerequisites already in place (confirm, don't re-create)
These existed before this round — the add-on rides on them:
- [ ] `STRIPE_SECRET_KEY_TEST` / `STRIPE_SECRET_KEY_LIVE`
- [ ] `STRIPE_WEBHOOK_SECRET` (or `_TEST` / `_LIVE`) — the webhook already handles
      `customer.subscription.*`; the add-on reconciles `active_addons` from the
      subscription's line items there. No new webhook needed.
- [ ] `STRIPE_MODE=test` while testing, `live` (or unset) for production.

### Testing the add-on
- [ ] Run with `STRIPE_MODE=test`.
- [ ] The toggle needs an org with an **active (test) Stripe subscription**
      (`stripe_subscription_id`) — it adds a prorated subscription item. On an org
      with no subscription it returns `409` ("Add-ons require an active paid
      subscription"), which is expected.
- [ ] Toggle on in **Settings → Subscription → Add-ons** → confirm the storage
      meter's limit jumps by 100 GB and a subscription item appears in Stripe.

---

## 2. Storage

### 2a. Schema (already run on prod Directus — for reference / other instances)
Done this session against the prod droplet Directus. Only re-run on a *different*
Directus instance:
- [x] `pnpm run setup:org-storage-fields` — adds `storage_used_bytes`,
      `storage_extra_bytes`, `active_addons` to `hoa_organizations`
- [x] `pnpm run setup:notification-prefs` — adds `notification_preferences` to
      `directus_users`
- [x] `pnpm generate:types`
- [x] `pnpm run recompute:org-storage -- --apply` — seed the usage counters

### 2b. Optional storage tunables (Vercel env — defaults are fine)
- [ ] `STORAGE_MAX_FILE_MB` (default `250`)
- [ ] `STORAGE_FREE_GB` (default `5`)
- [ ] `IMAGE_MAX_EDGE` / `IMAGE_JPEG_QUALITY` / `IMAGE_WEBP_QUALITY` (default `2560` / `82` / `82`)

### 2c. DigitalOcean Spaces backend (droplet — Directus config) — **full steps: [storage-spaces-migration.md](storage-spaces-migration.md)**
Moves Directus file storage from the droplet's local disk to a Spaces bucket. This
is a **Directus config change on the droplet**, not app code. **Snapshot the droplet
first.**
- [ ] Create a **private** Spaces bucket + an access key/secret.
- [ ] Set the `local` storage location to the `s3` driver on the Directus env
      (`STORAGE_LOCATIONS="local"`, `STORAGE_LOCAL_DRIVER="s3"`, `..._KEY`,
      `..._SECRET`, `..._BUCKET`, `..._REGION`, `..._ENDPOINT`,
      `STORAGE_LOCAL_ACL="private"`, `STORAGE_LOCAL_FORCE_PATH_STYLE="true"`).
- [ ] `rclone`/`s3cmd` sync the current uploads dir into the bucket **preserving
      keys** (keys must equal `directus_files.filename_disk` exactly, or old
      `/assets/<id>` 404s).
- [ ] Restart Directus; verify an **old** file, a **new** upload, an image
      transform (`?width&height&fit`), and that the raw Space object is 403 while
      the `/assets` proxy returns bytes.

---

## 3. Scheduled jobs — all four live in GitHub Actions

**Full steps: [notification-digest-cron.md](notification-digest-cron.md) and
[data-export-cron.md](data-export-cron.md).**

Four jobs run on a schedule. None of them runs on the droplet, and none of them
needs to:

| workflow | schedule | what it does |
|---|---|---|
| [`notification-digest.yml`](../.github/workflows/notification-digest.yml) | hourly, `:07` | daily/weekly member digests via SendGrid |
| [`data-export.yml`](../.github/workflows/data-export.yml) | every 15 min | builds queued Data Trust archives, purges expired ones |
| [`ai-notices.yml`](../.github/workflows/ai-notices.yml) | nightly, 07:10 UTC | `POST /api/ai/notices/check` — deterministic, no LLM call, no AI credits |
| [`ai-action-expiry.yml`](../.github/workflows/ai-action-expiry.yml) | Sundays, 07:40 UTC | `POST /api/ai/actions/expire-stale` |

The first two check out the repo and run a worker script; the last two are a
`curl` at the deployed app and need no checkout at all.

- [ ] Set three repository secrets at **Settings → Secrets and variables →
      Actions**: `DIRECTUS_STATIC_TOKEN`, `SENDGRID_API_KEY`, `CRON_SECRET`.
      Every other value is a non-secret literal in the workflow files.
- [ ] Confirm each workflow appears under **Actions** and can be dispatched.
      All four have a `workflow_dispatch` whose `dry_run` input defaults to
      **true**, so the obvious button is the safe one.
- [ ] Watch the first real hourly digest run and the first export tick go green.

> `CRON_SECRET` is **not** used by the digest or export workers — they talk to
> Directus directly rather than through an HTTP endpoint. It guards the two AI
> endpoints and the scheduled-email Directus flow.

---

## 3b. Why this is not on the droplet — and what that mistaken assumption cost

**Resolved 2026-08-25.** This section used to be titled "the droplet's checkout
is stale — refresh it before either worker runs", and it was the single item
blocking two shipped features. Both premises were wrong.

**There was never a checkout.** The droplet runs three containers — `database`
(postgis), `cache` (redis), `directus` (container name `admin`) — and nothing
else. No node service, no repo, and `crontab -l` returns "no crontab for root".
The `directus/directus` image carries Directus's own runtime, not this repo. So
the digest and export workers had never had anywhere to run; the `/apps/app`
path this section told you to fix had never existed on that machine either.

**And the export worker could not have started even on a perfect checkout.**
`9fedc37` (2026-08-20 14:36) added an `import … from "#core/shared/ledger/visibility"`
to `core/shared/export/collections.ts`. `#core` is a **Nuxt and vitest alias**
(`core/nuxt.config.ts:151`, `vitest.config.ts:16`) with no matching `imports`
map in `package.json` — so vitest, `nuxt typecheck` and `nuxt build` all resolved
it happily while the standalone `tsx` worker died on
`ERR_PACKAGE_IMPORT_NOT_DEFINED`. Every gate was green and the script was dead.

Neither worker needs the droplet. Both are pure HTTP clients of Directus, which
is public at `admin.hoaconnect.info`, so they run on a GitHub Actions runner
where the code is the commit on `main` and there is nothing to keep in step by
hand.

**The proof.** The `hoa_data_exports` row on `/transition-test`, requested
2026-08-20 16:07 and `queued` ever since — about ninety minutes after the import
that broke the worker — was built on 2026-08-25 at 15:39:

- `queued → running → ready` in ten seconds
- `transition-test-shareable-export-2026-08-25.zip`, 18,975 bytes,
  `expires_at` 2026-09-01
- filed in the top-level `Data exports` folder with `parent: null`, outside
  every org folder, as the quota rule requires
- "your export is ready" notification written to the requester

- [x] Both workers proved runnable with CI-shaped env (no `.env`, everything
      from the environment)
- [x] The stuck export row built end to end
- [ ] First scheduled run on Actions observed green (needs the workflows pushed
      and the secrets set — see §3)

> **The lesson worth keeping.** Three quality gates passed over a script that
> could not start, because all three resolve module aliases that the runtime
> does not. `core/shared` is imported by the Nuxt app, by vitest **and** by
> standalone scripts; only the first two know what `#core` means. Shared code
> that scripts import must use relative imports. There is no gate that catches
> this — the only evidence is running the thing.

Full detail: [data-export-cron.md](data-export-cron.md) and
[notification-digest-cron.md](notification-digest-cron.md).

---

## 3c. Make the audit log append-only in the database (droplet — Postgres)

`org_audit_log` (Phase 4) is the community's permanent record of what happened
to it — who ended a manager's access, who took over the account, when. VISION
lists **"no mutable audit log, ever"** under What NOT to Build.

Right now that holds by construction, not by constraint:

- the migration grants **no role permissions**, so no client can reach the table;
- the app has **one writer** (`writeAuditEntry`) and no update or delete path.

Both are real, and neither stops the admin static token. Until the trigger below
is installed, "it cannot be edited" is a statement about our code. Say it that
way to a board until this is done.

Run once, on the droplet, against the Directus database:

```sql
CREATE OR REPLACE FUNCTION org_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  -- A deliberate erasure (the "delete our data" request in the continuity
  -- policy) sets the flag first; everything else is refused.
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'org_audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON org_audit_log
  FOR EACH ROW EXECUTE FUNCTION org_audit_log_append_only();
```

Verify — the first two must fail, the third must succeed:

```sql
UPDATE org_audit_log SET summary = 'tampered' WHERE id = (SELECT id FROM org_audit_log LIMIT 1);
DELETE FROM org_audit_log WHERE id = (SELECT id FROM org_audit_log LIMIT 1);
SELECT count(*) FROM org_audit_log;
```

> **Know this before you install it.** `org_audit_log.organization` is
> `ON DELETE CASCADE`, so the trigger will also refuse the cascade when someone
> deletes an organization — the org delete fails rather than silently erasing
> its history. That is the intended trade (erasing a community's record should be
> a deliberate act), but it means a genuine deletion request is now a two-step
> operation:
>
> ```sql
> SET app.allow_audit_delete = 'on';   -- this session only
> -- perform the deletion
> RESET app.allow_audit_delete;
> ```

- [ ] Trigger installed
- [ ] Both mutation statements above fail with the append-only exception
- [ ] A transition still writes successfully afterwards (run one on a test org)

> Not yet run from this machine — there is no SSH to the droplet here, so the SQL
> above is written but unverified against the live database. Treat the first run
> as a test, on a snapshot.

**Confirmed NOT installed as of 2026-08-20.** There is no SSH from the dev
machine, but the trigger can be probed over the Directus API without SSH and
without changing anything: PATCH an existing `org_audit_log` row, writing one
field back with its own current value.

```bash
# 200 = no trigger. The append-only exception = installed.
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  -H "Authorization: Bearer $DIRECTUS_STATIC_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"summary\": \"<the row's existing summary, verbatim>\"}" \
  "$DIRECTUS_URL/items/org_audit_log/<id>"
```

It returned **200**, so the admin static token can still rewrite history. Phase 5
did not change that and cannot: `writeAuditEntry` is still the only writer in the
app, and there is still no update or delete path — but that is a property of our
code. Until the SQL above runs, say it that way to a board.

**Re-probed 2026-08-20 (end of the Phase 5 writers session): still 200.** The
probe is a no-op — it writes the row's existing `summary` back verbatim — so
running it again costs nothing and is the honest way to answer "is it installed
yet" without SSH. Six writers now feed this table; the trigger is the only thing
that would make their output tamper-evident rather than merely tamper-free.

---

## 3d. The transition test fixture lives on prod — on purpose

`/transition-test` is **not a real community**. It is the fixture the Phase 4
wizard was driven against end to end (2026-08-20), kept deliberately so the next
piece of transition work has a realistic org to run against rather than seeding
one from scratch each time.

| | |
|---|---|
| Org | `Transition Test HOA [TEST FIXTURE]` — slug `transition-test` |
| Billing account | `Transition Test Agency [TEST FIXTURE]` — no Stripe subscription, so seat syncs charge nothing |
| State | post-transition: detached, `grace_ends_at 2026-10-19`, Nina Alvarez promoted to HOA Admin. **Dana Reyes (manager) is inactive; the demo user's "Agency Admin" seat was REACTIVATED on 2026-08-20** so the fixture can still be driven from a browser — the transition left nobody with a login on it, which made the org unreachable for Phase 5's ledger read-back. Flip it back to `inactive` to restore the pristine post-transition state. |
| Ledger | **twelve** `org_audit_log` entries as of 2026-08-20 — one per writer, each driven through its real route. August's transition; two `manager_grants_changed` (one switch, one preset) against Dana Reyes; `document_published`; `poll_closed`; `expense_recorded`; `payment_recorded` (the only **board**-visible row, and the one that proves the export's row filter drops something); `ai_action_executed` + `ai_action_undone`. The last three are the `poll_reopened` read-back: the lobby poll was reopened and closed again through the app, so the feed reads `closed → reopened → closed` in that order. That sequence is the point — before `poll_reopened` existed, the middle row was missing and the ledger kept asserting an outcome the community had set aside. |
| Fixture rows behind those entries | a draft-then-published document with no file; a three-vote poll (votes inserted with the admin token, before the permission fix below), now closed again after the reopen read-back; a second, OPEN poll ("Should the bike room get a second rack?") created through the app on 2026-08-20 to verify `POST /api/org/polls/create` — it is deliberately left open so the fixture has one poll in each state; a `payment_expenses` row for $2,400.75; a `payment_requests` row for $450.25 marked paid; two `ai_actions` rows, one executed and undone. All of them exist to give the ledger something true to point at — none is real community data. |
| Public page | `maintenance_mode: true`, so a stranger who guesses the slug gets the maintenance screen, not a fake community |
| Queued export | **built 2026-08-25** — the row requested 2026-08-20 16:07 sat `queued` for five days and went `queued → running → ready` in ten seconds once §3b's two faults were fixed. `transition-test-shareable-export-2026-08-25.zip`, 18,975 bytes, `expires_at` 2026-09-01, filed in the top-level `Data exports` folder. It was the cheapest available proof that the worker works, and it earned its keep. Queue another the same way if you need to re-prove the path. |
| AI (Phase 6) | all twelve ledger entries are embedded into `ai_ledger_chunks` (`pnpm run backfill:ledger-embeddings -- --apply --org=transition-test`), and the wallet was given a **3,000-credit test allowance** on 2026-08-20 because it had never been funded — that is a fixture balance, not a real one. The eleven owner-visible / one board-only split is what makes the retrieval boundary provable: see §3e. |

## 3e. The Anthropic account has no credit balance — every AI feature is dark

Found 2026-08-20 while verifying Phase 6. The key in `.env` authenticates fine;
the **account behind it is out of credit**, so the API refuses every completion:

```
400 invalid_request_error — Your credit balance is too low to access the
Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
```

This is not specific to "Ask the HOA". It is the same key `getAnthropic()` hands
to the staff chat, the composer's "Draft with AI", and the Phase 4 tool loop, so
**all of them are currently non-functional wherever this key is used** — locally
for certain, and on Vercel if it is the same key there.

Nothing in the app is wrong: the request reaches the provider and comes back
refused. `POST /api/ai/ask` now turns that into a 502 with a readable sentence
rather than passing the provider's billing message through to a member, which is
what it did the first time this surfaced.

- [ ] Top up the Anthropic account (Plans & Billing)
- [ ] Re-run the four Phase 6 verification questions on `/transition-test`
- [ ] Confirm which key Vercel holds, and whether it is the same account

### Also unverified: `VOYAGE_API_KEY` on Vercel

The document half of "Ask the HOA" and the whole ledger vector index depend on
it. It is set locally and the prod `ai_doc_chunks` / `ai_ledger_chunks` rows were
built from here. Without it in Vercel, deployed retrieval silently drops to the
lexical fallback — degraded, not broken, and invisible unless someone checks the
`retrieval.ledgerMode` field the ask route returns.

- [ ] Confirm `VOYAGE_API_KEY` in the Vercel environment
- [ ] Run `pnpm run create:ai-ledger-chunks` against any other Directus instance
      (already run against prod on 2026-08-20)

---

### A permission gap the fixture exposed — `hoa_poll_votes` — FIXED 2026-08-20

Creating a vote through the app as an **org admin** returned:

```
You don't have permission to access collection "hoa_poll_votes" or it does not exist.
```

Directus says "or it does not exist" for a missing permission as well as a
missing table, which is what made this look worse than it was on first reading.
The collection exists, and **HOA Member always had `create`** — members could
vote all along. The gap was the **HOA Admin** policy, which held only `read` and
`delete`. An admin is usually also a resident, and `PollCard` offers them the
same vote buttons as everyone else, so the click failed on a toast: the UI
offering an action the permissions refuse.

Fixed by adding one line to `scripts/create-polls-collections.ts` and re-running
`pnpm create:polls` against prod. The re-run PATCHed the ten existing rows with
byte-identical config and added exactly one: HOA Admin `create` on
`hoa_poll_votes`, with the member's own-vote validation rather than a blanket
grant. Verified on the fixture through the app's own client path — an admin can
cast their own vote (Directus fills `user` via `special: user-created`), and is
refused when voting as another user or into another community.

Admin `delete` stays org-wide where a member's is own-vote-only: moderating a
poll is an administrative act, and the tally the ledger records at close has to
be correctable before it is closed.

Still worth knowing: the **Property Manager** policy has no poll permissions at
all, so a PM cannot see polls. That is untouched here — it is a product question
(should a manager see community feedback?), not a bug report.

Re-seed a clean one, or remove it entirely:

```bash
pnpm tsx --env-file=.env scripts/seed-transition-test-org.ts --cleanup
pnpm tsx --env-file=.env scripts/seed-transition-test-org.ts
```

Deleting the org CASCADEs its members, vendors and audit rows; the script also
removes the billing account and its roster. Never point the script at a real slug.

- [ ] Delete the fixture before any public launch that lists communities.

---

## 4. Deploy & verify

- [ ] The code is on `main` — deploy it to Vercel (auto-deploy from `main`, or
      trigger a redeploy) **after** the storage schema fields exist (they do).
- [ ] After redeploy, spot-check on a real org:
  - [ ] **Files** (`/…/admin/files`): storage meter renders; upload shrinks + counts;
        copy-link / optimize / keep-vs-delete work.
  - [ ] **Add-on**: Settings → Subscription → Add-ons toggles (test mode + a
        subscribed org).
  - [ ] **Preferences**: account → Preferences → save the category matrix + digest.
  - [ ] **Digest**: on the droplet, `pnpm run digest:worker -- --dry-run`.
  - [ ] **Auth**: log out/in — the notification 401s should be gone (the login
        refresh-token fix takes effect on a fresh login).

---

## 5. Web push (VAPID)

Push is **built and deployed but inert** until a production VAPID pair exists —
`vapidPublicKey` empty ⇒ no browser can subscribe, `vapidPrivateKey` empty ⇒
nothing can be sent. The pair in the local `.env` is DEV-ONLY; production needs
its own. As of 2026-08-19 none of the three vars exist in Vercel production.

- [ ] Generate a pair and set all three vars. This pipes the values straight into
      Vercel so the private key never lands in your shell history:

      ```bash
      KEYS=$(npx --yes web-push generate-vapid-keys --json)
      echo "$KEYS" | jq -r .publicKey  | vercel env add NUXT_PUBLIC_VAPID_PUBLIC_KEY production
      echo "$KEYS" | jq -r .privateKey | vercel env add NUXT_VAPID_PRIVATE_KEY production
      printf 'mailto:support@hoaconnect.info' | vercel env add NUXT_VAPID_SUBJECT production
      ```

- [ ] **Redeploy.** Vercel env changes only reach the runtime on a NEW deployment
      — an existing build keeps the values it was deployed with.
- [ ] Verify the key is being served. `/api/user/push/config` is auth-gated (401
      when anonymous), so check it while logged in — in the browser console on
      app.hoaconnect.info:

      ```js
      await $fetch('/api/user/push/config')   // { enabled: true, publicKey: "B…" }
      ```

      `enabled: false` with an empty `publicKey` means the env vars didn't reach
      the runtime — you skipped the redeploy.
- [ ] **Verify delivery to a real device** — still unverified end to end. Subscribe
      from a phone (account → Preferences → the bell toggle), then trigger a
      notification and confirm it arrives. Subscribe, upsert-by-endpoint,
      unsubscribe and dead-endpoint prune were all verified live against prod
      Directus; only actual delivery to hardware is untested.

The public and private keys MUST come from the same generated pair — mixing pairs
fails silently at send time with a 401 from the push service.

---

## Quick env reference

| Variable | Where | Test | Prod | Notes |
|---|---|---|---|---|
| `STRIPE_PRICE_ADDON_STORAGE_100_TEST` | Vercel | ✅ | — | test add-on price id |
| `STRIPE_PRICE_ADDON_STORAGE_100_LIVE` | Vercel | — | ✅ | live add-on price id |
| `STRIPE_MODE` | Vercel | `test` | `live`/unset | picks test vs live |
| `STORAGE_MAX_FILE_MB`, `STORAGE_FREE_GB`, `IMAGE_*` | Vercel | optional | optional | defaults fine |
| `STORAGE_LOCAL_*` (s3 driver) | droplet (Directus) | n/a | ✅ | Spaces backend |
| `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN` | droplet (worker) | ✅ | ✅ | worker → Directus |
| `SENDGRID_API_KEY`, `FROM_EMAIL`, `FROM_NAME` | droplet (worker) | ✅ | ✅ | worker → SendGrid |
| `APP_URL`, `DIGEST_TZ`, `DEMO_ALLOW_EMAIL` | droplet (worker) | ✅ | ✅ | links / timezone / demo |
| `NUXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | ✅ | ✅ | web push — empty ⇒ nobody can subscribe |
| `NUXT_VAPID_PRIVATE_KEY` | Vercel | ✅ | ✅ | web push — server-only, never exposed |
| `NUXT_VAPID_SUBJECT` | Vercel | optional | optional | `mailto:` contact, defaults to support@ |
