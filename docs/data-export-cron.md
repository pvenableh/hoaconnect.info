# Data Trust export — scheduled on GitHub Actions

The "take your data" button in **Settings → Your data** only queues a row. The
archive is built by a **scheduled GitHub Actions workflow**:
[`.github/workflows/data-export.yml`](../.github/workflows/data-export.yml),
every **15 minutes**.

Script: `scripts/data-export-worker.ts` (`pnpm run export:worker`).

Two things force this out of a serverless function, and both are about the
promise being made. Org storage quotas run 5–250 GB, so an archive can take
minutes and hundreds of megabytes of scratch disk. And "the board can trigger an
export mid-dispute" only means something if the export finishes after they close
the tab — the Settings page says *"you can close this page — we'll keep going"*,
and this worker is what makes that true.

> **This used to say "droplet worker", and it had never run once.**
>
> Two independent faults, both fixed on 2026-08-25:
>
> 1. **There was no machine.** The droplet runs three containers — postgis,
>    redis, directus — with no node service and no checkout, and `crontab -l`
>    returns "no crontab for root". It does not need one: the worker reaches
>    Directus over REST, so it only needs a runner with the repo, node and
>    scratch disk.
> 2. **The worker could not start anyway.** `9fedc37` (2026-08-20 14:36) added
>    `import … from "#core/shared/ledger/visibility"` to
>    `core/shared/export/collections.ts`. `#core` is a **Nuxt and vitest alias**
>    — `core/nuxt.config.ts:151`, `vitest.config.ts:16` — and there is no
>    `imports` map in `package.json`, so tests, typecheck and build all passed
>    while the standalone `tsx` script died on `ERR_PACKAGE_IMPORT_NOT_DEFINED`.
>    Fixed by making `core/shared`'s intra-package imports relative: shared code
>    that scripts import must not depend on a bundler alias.
>
> The `hoa_data_exports` row queued at 2026-08-20 16:07 was requested about
> ninety minutes *after* fault 2 landed. It built on 2026-08-25 at 15:39, in ten
> seconds, once both were fixed.

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

## What stops two runs colliding

The worker takes a pid lock in `EXPORT_WORK_DIR`, which guards **one machine**.
On ephemeral runners every run is a fresh machine, so that lock can never see a
sibling. What actually prevents overlap on Actions is the workflow's
`concurrency: { group: data-export-worker, cancel-in-progress: false }`. Keep
both: the lock still earns its place for laptop runs against prod.

The job's `timeout-minutes: 60` is deliberately well under the worker's own
6-hour stale-job release, so a run killed by the timeout is always reclaimed by
a later tick rather than wedging the org's queue.

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

## Setup

One repository secret beyond what the digest already needs:
`DIRECTUS_STATIC_TOKEN`. See
[notification-digest-cron.md](notification-digest-cron.md#setup) for the full
secret list and where to paste them.

The workflow pins the rest inline:

| var | value on the runner |
|---|---|
| `DIRECTUS_URL` | `https://admin.hoaconnect.info` |
| `APP_URL` | `https://app.hoaconnect.info` — the deep link in the "your export is ready" notification |
| `EXPORT_FOLDER_NAME` | `Data exports` |
| `EXPORT_WORK_DIR` | `${{ runner.temp }}/hoa-export` — the runner's work volume (~14 GB), not the smaller root filesystem the system temp dir sits on |
| `NUXT_PUBLIC_BUILD_ID` | `${{ github.sha }}`, recorded on the manifest as the build that produced the archive |

**The 14 GB runner disk is the one real ceiling of this arrangement.** A
files-included export of an org near the top of the 250 GB quota band will not
fit. Nothing close to that exists today. If one ever does, move *this* workflow
— not the digest — onto a machine with real disk; the worker itself needs no
change, only different env.

## Running it by hand

**From GitHub** — Actions → *data export worker* → **Run workflow**. `dry_run`
defaults to **true**; there is also a `job` input to build one specific
`hoa_data_exports` row.

**From a laptop**, against prod, with a `.env` at the repo root:

```bash
pnpm run export:worker -- --dry-run     # lists the queue and what would be purged, writes nothing
pnpm run export:worker                  # do the work
```

Other flags: `--job <id>` builds one specific row (queued or running only),
`--purge-only` expires old archives and builds nothing, `--max <n>` bounds one
run, `--keep-temp` leaves the staging directory and the zip behind so you can
open them.

> ⚠️ **A green dry run does not prove a real run works.** `--dry-run` skips the
> pid lock entirely, and the lock is the first thing to touch `EXPORT_WORK_DIR`.
> That is precisely how the missing-`mkdir` bug hid: dry runs were clean and the
> real run died on `ENOENT … hoa-data-export.lock`. `acquireLock()` now creates
> the work root itself, but the general lesson stands — when you change
> anything about the work dir, prove it with a real run.

## Notes

- **Archives are stored outside every org folder**, in a top-level `Data exports`
  folder. Org storage usage is the sum of `filesize` across the org's folder
  subtree, so filing an archive inside it would charge a community quota for
  asking for its own data — and the next export would then contain the previous
  one. Verified on the 2026-08-25 run: the finished file sits in `Data exports`
  with `parent: null`.
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
  something that person just asked for by hand. ⚠️ Writing a
  `directus_notifications` row **emails that person**, from inside Directus —
  one archive built is one mail sent, and no flag in this script suppresses it.
- `pnpm install` on the runner is deliberately **not** `--prod`: the worker runs
  through `tsx` and uses `archiver`, both devDependencies.
