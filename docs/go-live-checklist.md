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

## 3. DigitalOcean droplet — the notification-digest worker — **full steps: [notification-digest-cron.md](notification-digest-cron.md)**

The daily/weekly digest runs as a **standalone worker on the droplet** (alongside
Directus + your other workers), talking directly to Directus + SendGrid. It is
idempotent-by-hour (sends each member at most once/day).

- [ ] Check out the repo on the droplet (or reuse the existing worker checkout),
      `pnpm install`.
- [ ] Provide the worker's env (a `.env` at the repo root, or exported in the cron):
  - [ ] `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN` (admin)
  - [ ] `SENDGRID_API_KEY`
  - [ ] `FROM_EMAIL` (platform sender), optional `FROM_NAME`
  - [ ] `APP_URL` (e.g. `https://app.hoaconnect.info` — for the dashboard link)
  - [ ] `DIGEST_TZ` (default `America/New_York`)
  - [ ] optional `DEMO_ALLOW_EMAIL=true` to let demo orgs actually send
- [ ] Dry run: from the repo root, `pnpm run digest:worker -- --dry-run` (sends nothing).
- [ ] Add the hourly crontab (absolute paths — cron has a minimal PATH):
      ```bash
      0 * * * * cd /path/to/hoaconnect && /usr/local/bin/pnpm run digest:worker >> /var/log/hoa-digest.log 2>&1
      ```

> Note: `CRON_SECRET` is **not** needed by the digest worker (it runs directly, not
> via an HTTP endpoint). `CRON_SECRET` is only for the scheduled-email Directus flow.

---

## 3b. The droplet's checkout is stale — refresh it before either worker runs

**This is the single item blocking two shipped features.** The droplet's checkout
predates the 2026-08 flatten, so it still has the `apps/app` layout: neither
`scripts/data-export-worker.ts` nor the current digest worker exists there, and
any crontab line ending in `/apps/app` points at a directory that is gone.

Until this is done, a board that clicks **Settings → Your data → Request export**
gets a row that sits at `queued` forever — while the UI (and now the public
[continuity guarantee](data-continuity-policy.md) at `/your-data`) promises the
archive will be built whether or not they keep the tab open. That promise is
live on the marketing site; this is what makes it true.

Run once, on the droplet (`admin.hoaconnect.info`):

```bash
cd /path/to/hoaconnect
git pull                                  # brings the flatten + both workers
pnpm install                              # ONE package.json now — no workspace
pnpm run digest:worker -- --dry-run       # must print a candidates= line
pnpm run export:worker -- --dry-run       # lists the queue, writes nothing
```

> **Never regenerate `pnpm-lock.yaml` to get past an install hiccup.** Deleting it
> floats every caret range and has produced duplicate `vue` / `unhead` copies —
> the exact shape that took a production deploy down before. Restore it from git
> and let `pnpm install` adapt.

Then fix both crontab lines (`crontab -e`) — drop any `/apps/app` suffix:

```bash
# HOA Connect — notification digest (hourly)
0 * * * * cd /path/to/hoaconnect && /usr/local/bin/pnpm run digest:worker >> /var/log/hoa-digest.log 2>&1

# HOA Connect — Data Trust export worker (every 5 min; exits in <1s when idle)
*/5 * * * * cd /path/to/hoaconnect && /usr/local/bin/pnpm run export:worker >> /var/log/hoa-export.log 2>&1
```

- [ ] `git pull` + `pnpm install` on the droplet
- [ ] Both dry runs succeed from the repo root
- [ ] Export worker env present: `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN`, `APP_URL`,
      optional `EXPORT_WORK_DIR` (needs disk for the staged records **plus** the
      finished zip) and `EXPORT_FOLDER_NAME` (default `Data exports`)
- [ ] Both crontab lines in place, `crontab -l` confirms, no `/apps/app` anywhere
- [ ] End-to-end: request an export in the app, confirm it flips
      `queued → running → ready` within ~5 minutes and the download works

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
