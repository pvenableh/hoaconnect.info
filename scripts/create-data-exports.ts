/**
 * Create `hoa_data_exports` — the job queue behind the Data Trust export
 * ("It's yours. Take it anytime.", VISION Pillar A).
 *
 * One row per export a board asks for. The row is the whole protocol: the app
 * writes it as `queued`, the droplet worker claims it, builds the archive, and
 * writes back the manifest and the file. Nothing about an export lives in
 * memory, which is the point — a board triggering an export mid-dispute must get
 * it whether or not they keep the tab open.
 *
 *   organization   — M2O hoa_organizations (required; CASCADE, an export of a
 *                    deleted org is meaningless)
 *   requested_by   — M2O directus_users (SET NULL: keep the record of the export
 *                    even if the person who asked for it later leaves)
 *   status         — queued → running → ready, or failed. `expired` is the
 *                    terminal state after the archive is purged.
 *   tier           — full (verbatim, for the board) | shareable (the variant
 *                    safe to hand an incoming manager)
 *   include_files  — whether the archive carries the files themselves. Opt-in
 *                    because org storage runs 5–250 GB.
 *   manifest       — the manifest.json the worker wrote, kept queryable so the
 *                    UI can show row counts without opening the zip
 *   file           — M2O directus_files, the archive itself (SET NULL so purging
 *                    the file leaves the audit row behind)
 *   size_bytes     — bigInteger, not integer: a files-included archive passes
 *                    2 GB routinely
 *   expires_at     — 7 days out. The worker purges past this and flips the row
 *                    to `expired`.
 *
 * NO role permissions are created, deliberately — the same call made for
 * `push_subscriptions`. Every read and write goes through /api/org/export/* with
 * the admin token, and those routes gate on HOA-Admin. These rows point at an
 * archive containing every member's contact details and the board's private
 * material; granting any role direct collection access would only add a way to
 * reach it that the server routes don't police.
 *
 * Run with: pnpm run create:data-exports
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Additive + idempotent: existing collection/fields/relations are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        {
          field: "id",
          type: "uuid",
          meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
          schema: { is_primary_key: true, has_auto_increment: false },
        },
      ],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, fieldConfig: Record<string, any>) {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>) {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("📦 Creating hoa_data_exports...\n");

  await createCollection("hoa_data_exports", {
    icon: "archive",
    note: "Data Trust export jobs. Written only by /api/org/export/* and the droplet worker.",
    display_template: "{{organization.name}} — {{tier}} ({{status}})",
    hidden: false,
    sort_field: "date_created",
    archive_field: "status",
    archive_value: "expired",
  });

  await createField("hoa_data_exports", "organization", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      required: true,
      width: "half",
      note: "The community whose data this archive contains.",
    },
    schema: { is_nullable: false },
  });

  await createField("hoa_data_exports", "requested_by", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      width: "half",
      note: "The admin who asked for it. Kept even if they later leave.",
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "status", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      required: true,
      note: "queued → running → ready | failed. `expired` once the archive is purged.",
      options: {
        choices: [
          { text: "Queued", value: "queued" },
          { text: "Running", value: "running" },
          { text: "Ready", value: "ready" },
          { text: "Failed", value: "failed" },
          { text: "Expired", value: "expired" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "queued", max_length: 20 },
  });

  await createField("hoa_data_exports", "tier", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      required: true,
      note: "full = verbatim, for the board. shareable = safe to hand an incoming manager.",
      options: {
        choices: [
          { text: "Full", value: "full" },
          { text: "Shareable", value: "shareable" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "full", max_length: 20 },
  });

  await createField("hoa_data_exports", "include_files", {
    type: "boolean",
    meta: {
      interface: "boolean",
      width: "half",
      note: "Whether documents and photos are in the archive, not just the records.",
    },
    schema: { is_nullable: false, default_value: false },
  });

  await createField("hoa_data_exports", "file", {
    type: "uuid",
    meta: {
      interface: "file",
      special: ["file"],
      width: "half",
      note: "The archive. Cleared when the export expires; the row survives.",
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "size_bytes", {
    type: "bigInteger",
    meta: {
      interface: "input",
      width: "half",
      readonly: true,
      note: "Archive size. bigInteger — a files-included export passes 2 GB routinely.",
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "manifest", {
    type: "json",
    meta: {
      interface: "input-code",
      width: "full",
      note: "The manifest.json the worker wrote — row counts per collection, what was withheld.",
      options: { language: "json" },
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "error", {
    type: "text",
    meta: {
      interface: "input-multiline",
      width: "full",
      note: "Why a failed export failed. Shown to the admin who requested it.",
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "expires_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      width: "half",
      readonly: true,
      note: "The worker purges the archive past this and flips status to `expired`.",
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "date_started", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", readonly: true },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "date_completed", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", readonly: true },
    schema: { is_nullable: true },
  });

  await createField("hoa_data_exports", "date_created", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      special: ["date-created"],
      readonly: true,
      hidden: true,
      width: "half",
    },
    schema: { is_nullable: true },
  });

  // CASCADE: an export of a deleted org has nothing to describe.
  await createRelation({
    collection: "hoa_data_exports",
    field: "organization",
    related_collection: "hoa_organizations",
    schema: { on_delete: "CASCADE" },
    meta: { sort_field: null },
  });

  // SET NULL: the record of "an export happened" outlives the requester.
  await createRelation({
    collection: "hoa_data_exports",
    field: "requested_by",
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
    meta: { sort_field: null },
  });

  // SET NULL: purging the archive must not delete the job row with it.
  await createRelation({
    collection: "hoa_data_exports",
    field: "file",
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
    meta: { sort_field: null },
  });

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
  console.log("   No role permissions were granted — /api/org/export/* uses the admin token");
  console.log("   and gates on HOA-Admin. These rows point at every member's PII.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
