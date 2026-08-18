/**
 * Add the file-storage quota fields to `hoa_organizations`:
 *   - storage_used_bytes  (bigInteger, default 0) — cached usage counter,
 *     incremented on upload / decremented on delete, recomputed to self-heal.
 *   - storage_extra_bytes (bigInteger, default 0) — manual override that stacks
 *     on top of the plan limit (comps / one-off grants).
 *   - active_addons       (json)                  — enabled paid add-ons, keyed
 *     by add-on id, e.g. { "extra_storage_100": true }.
 *
 * The `folder` M2O (org root) already exists and is used by the storage system.
 *
 * Additive + idempotent against prod Directus — creates only missing fields,
 * never deletes.
 *
 * Run with: pnpm run setup:org-storage-fields
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
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
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
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

async function main() {
  console.log("📦 Adding storage quota fields to hoa_organizations…\n");

  await createField("hoa_organizations", "storage_used_bytes", {
    type: "bigInteger",
    meta: {
      interface: "input",
      readonly: true,
      width: "half",
      note: "Cached total file-storage usage (bytes). Maintained by the app; recomputed to self-heal.",
      group: null,
    },
    schema: { default_value: 0 },
  });

  await createField("hoa_organizations", "storage_extra_bytes", {
    type: "bigInteger",
    meta: {
      interface: "input",
      width: "half",
      note: "Manual extra storage grant (bytes), stacked on top of the plan limit. For comps / one-off grants.",
      group: null,
    },
    schema: { default_value: 0 },
  });

  await createField("hoa_organizations", "active_addons", {
    type: "json",
    meta: {
      interface: "input-code",
      options: { language: "json" },
      width: "full",
      note: 'Enabled paid add-ons keyed by id, e.g. { "extra_storage_100": true }.',
      group: null,
    },
    schema: {},
  });

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
