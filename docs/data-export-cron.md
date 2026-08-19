# Data Trust export — droplet worker

The "take your data" button in **Settings → Your data** only queues a row. The
archive is built by a **standalone worker on the DigitalOcean droplet** (where
Directus lives), not in the Vercel app.

Script: `scripts/data-export-worker.ts` (`pnpm run export:worker`).

Two things force it out of a serverless function, and both are about the promise
being made. Org storage quotas run 5–250 GB, so an archive can take minutes and
hundreds of megabytes of scratch disk. And "the board can trigger an export
mid-dispute" only means something if the export finishes after they close the
tab — the Settings page says *"you can close this page — we'll keep going"*, and
this worker is what makes that true.

## What one run does

1. **Purges** archives past `expires_at` (7 days): deletes the file, sets the row
   to `expired`, keeps the row. The row is the audit trail, and it is what the
   Settings tab shows to explain a download link that is gone.
2. **Releases stale jobs** — anything left `running` for more than 6 hours by a
   killed process is marked `failed`. Without this one crash wedges an org
   forever: the queue route refuses a new export while one is in flight.
3. **Builds** up to `--max` (default 3) queued jobs, oldest first, then writes
   the manifest onto the row and drops a bell notification for the admin who
   asked.

A run takes a pid lock in the work dir, so an overlapping cron tick exits
immediately rather than building the same job twice.

## What lands in the archive

```
README.txt          plain-English, written for a board member a year from now
manifest.json       schema_version 1 — the contract the Phase 4 transition wizard reads
data/*.json         one file per collection, verbatim (shareable tier nulls the
                    redacted fields and says so in the manifest)
csv/members.csv     the three projections…
csv/units.csv
csv/requests.csv
csv/ledger.csv      …and the derived one: every money movement with a running
                    balance, from the same pure module the Finances tab renders
files/…             the org's documents and photos, in their folder structure
                    (only when the requester ticked "include files")
```

Which collections appear, and what the `shareable` tier withholds, is decided in
`core/shared/export/collections.ts` — not here. The worker only walks that map.

## One-time setup on the droplet

1. Check the repo out (or reuse the existing checkout used by the digest worker)
   and `pnpm install` — **not** `--prod`; the worker runs through `tsx` and uses
   `archiver`, both devDependencies.

2. Provide env (a `.env` at the repo root, or exported in the cron):

   | var | purpose |
   |---|---|
   | `DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN` | admin Directus access |
   | `APP_URL` | the deep link in the "your export is ready" notification, e.g. `https://app.hoaconnect.info` |
   | `EXPORT_WORK_DIR` | staging directory (default the system temp dir). A files-included export needs free disk for the staged records **plus** the finished zip |
   | `EXPORT_FOLDER_NAME` | Directus folder finished archives go in (default `Data exports`) |
   | `NUXT_PUBLIC_BUILD_ID` | optional; recorded in the manifest as the build that produced the archive |

3. Add a crontab entry (`crontab -e`) — every five minutes is plenty, since the
   run exits in under a second when the queue is empty:

   ```bash
   # HOA Connect — Data Trust export worker
   */5 * * * * cd /path/to/hoaconnect && /usr/local/bin/pnpm run export:worker >> /var/log/hoa-export.log 2>&1
   ```

   Cron has a minimal PATH, so use absolute paths (`which pnpm`) or source a
   profile that sets up fnm/pnpm — the same caveat as the digest worker.

   > **The droplet's checkout is still pre-flatten.** As of 2026-08-19 the
   > droplet has the old `apps/app` layout, so this worker does not exist there
   > yet. Fix that first — `git pull`, then `pnpm install` from the single root
   > `package.json` — exactly as described in `notification-digest-cron.md`. Do
   > NOT regenerate `pnpm-lock.yaml` to work around an install hiccup; that has
   > taken production down before.

## Test

```bash
cd /path/to/hoaconnect
pnpm run export:worker -- --dry-run     # lists the queue and what would be purged, writes nothing
pnpm run export:worker                  # do the work
```

Other flags: `--job <id>` builds one specific row (queued or running only),
`--purge-only` expires old archives and builds nothing, `--max <n>` bounds one
run, `--keep-temp` leaves the staging directory and the zip behind so you can
open them.

## Notes

- **Archives are stored outside every org folder**, in a top-level `Data exports`
  folder. Org storage usage is the sum of `filesize` across the org's folder
  subtree, so filing an archive inside it would charge a community quota for
  asking for its own data — and the next export would then contain the previous
  one.
- **The download never hands out a Directus asset URL.** `/api/org/export/:id/download`
  proxies the file after re-checking the requester's admin access on the
  export's own org, and re-checks expiry, because between an archive expiring
  and the next purge run the file still exists.
- **`pnpm generate:types` after any schema change**, then run the test suite:
  `tests/shared/export-collections.test.ts` fails when a new collection is
  neither exported nor explicitly excluded, and `export-csv-fields.test.ts`
  fails when a CSV column names a field the schema no longer has. Both failure
  modes are silent in production — an incomplete archive still looks valid.
- A "your export is ready" **bell notification** goes to the requester. It is
  written directly rather than through `notifyUsers` (Nitro-only) and
  deliberately ignores the per-category preferences: it is the receipt for
  something that person just asked for by hand. Email/push for it would be a
  reasonable follow-up.
