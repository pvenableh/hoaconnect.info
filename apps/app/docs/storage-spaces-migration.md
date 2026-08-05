# Migrating Directus file storage to DigitalOcean Spaces

This moves Directus's file storage from the droplet's **local disk** to a
**DigitalOcean Spaces** bucket (S3-compatible). It is a **Directus configuration
change on the server** — no HOA Connect app code changes. The app keeps serving
files through Directus at `/assets/<uuid>`, so nothing in the Files manager, the
quota meter, or the optimizer is affected.

> ⚠️ **Operator task.** This must be run against the live Directus instance on the
> droplet (its `.env` / compose file + object migration with `rclone`). It cannot
> be done from the app repo. Do a snapshot/backup of the droplet first, and run
> the migration during a low-traffic window.

---

## Why "keep the location name `local`"

Every `directus_files` row has a `storage` column naming the storage location it
lives in (default `local`). If you **reuse the location name `local`** but point
that driver at Spaces, existing rows keep resolving with **no database change**.

If you instead create a **new** location name (e.g. `spaces`), you must also
`UPDATE directus_files SET storage = 'spaces'` for every existing row and set
`spaces` as the default upload location — more steps, more risk. The steps below
use the reuse-`local` approach.

---

## 1. Create the Spaces bucket

1. In DigitalOcean → **Spaces** → create a bucket (e.g. `hoaconnect-files`) in a
   region close to the droplet (e.g. `nyc3`). Keep it **private** (Restrict File
   Listing on).
2. **API → Spaces Keys** → generate an access key + secret. Store them in the
   password manager.

Endpoint for a region `nyc3` is `https://nyc3.digitaloceanspaces.com`
(the bucket is addressed as a path/subdomain by the S3 driver).

---

## 2. Point Directus's `local` location at Spaces

In the Directus server env (droplet `.env` or the compose `environment:` block),
set the `local` location to the S3 driver against Spaces:

```bash
STORAGE_LOCATIONS="local"          # keep the name "local" — existing rows resolve unchanged
STORAGE_LOCAL_DRIVER="s3"
STORAGE_LOCAL_KEY="<DO Spaces access key>"
STORAGE_LOCAL_SECRET="<DO Spaces secret>"
STORAGE_LOCAL_BUCKET="hoaconnect-files"
STORAGE_LOCAL_REGION="nyc3"
STORAGE_LOCAL_ENDPOINT="https://nyc3.digitaloceanspaces.com"
STORAGE_LOCAL_ACL="private"        # Directus serves bytes via its own /assets proxy
# Some Directus/aws-sdk versions want this for non-AWS S3:
STORAGE_LOCAL_FORCE_PATH_STYLE="true"
```

Do **not** restart Directus yet — migrate the objects first (step 3), or new
lookups will 404 until the bytes are in the bucket.

---

## 3. Migrate existing objects (keys must match `filename_disk`)

Directus stores each object under the key in `directus_files.filename_disk`
(a UUID + extension, at the bucket root — no folder prefix by default). The
Spaces keys must match **exactly**, or old `/assets/<id>` requests 404.

Find the current local uploads directory (commonly `/directus/uploads` in the
container, or the host path bind-mounted to it), then sync it to the bucket root
preserving keys.

### Using `rclone` (recommended)

```bash
# One-time: configure a Spaces remote
rclone config create dospaces s3 \
  provider=DigitalOcean \
  access_key_id=<DO Spaces access key> \
  secret_access_key=<DO Spaces secret> \
  endpoint=nyc3.digitaloceanspaces.com \
  acl=private

# Dry run — verify the file list + that keys land at the bucket ROOT (no prefix)
rclone copy /path/to/directus/uploads dospaces:hoaconnect-files --dry-run -P

# Real copy
rclone copy /path/to/directus/uploads dospaces:hoaconnect-files -P

# Verify counts match
rclone size /path/to/directus/uploads
rclone size dospaces:hoaconnect-files
```

`s3cmd sync /path/to/directus/uploads/ s3://hoaconnect-files/` works too — the
critical requirement either way is **keys at the bucket root with no added
prefix**, matching `filename_disk`.

---

## 4. Restart Directus and verify

Restart Directus so it picks up the new `local` driver, then verify:

- [ ] **Old file** — open an existing file in the Files manager (`/…/admin/files`).
      It should load from Spaces via `/assets/<id>`.
- [ ] **New upload** — upload a file; confirm the object appears in the Spaces
      bucket and the file opens.
- [ ] **Image transforms** — a thumbnail (`/assets/<id>?width=320&height=320&fit=cover`)
      renders (Directus reads from Spaces, transforms, and caches).
- [ ] **Private ACL** — hitting the raw Spaces object URL directly is **denied**
      (403); only Directus's `/assets` proxy returns bytes.
- [ ] **Download** — the download action (`/assets/<id>?download`) returns the file.

Once verified, the local uploads directory can be archived/removed after a grace
period (keep the droplet snapshot until you're confident).

---

## Rollback

Revert the `STORAGE_LOCAL_*` env back to the local driver
(`STORAGE_LOCAL_DRIVER="local"` + the original root path) and restart. Because we
never renamed the location or touched `directus_files.storage`, the rows resolve
against the local disk again with no DB change. The objects you copied to Spaces
are harmless to leave in place.
