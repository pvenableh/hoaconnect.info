/**
 * Script to extend hoa_pets + hoa_vehicles for unit-attached, historically
 * accurate records (Phase 6, Track 1).
 *
 * Big idea: a pet/vehicle belongs to a UNIT (the persistent thing) and a
 * responsible MEMBER, over a TIME RANGE. On turnover we set end_date + archive
 * rather than deleting, so a unit's history is always answerable.
 *
 * Additive & non-destructive: keeps the existing `member_id` relation.
 * Adds to both collections:
 *   - organization M2O → hoa_organizations (on_delete CASCADE) — denormalized
 *     tenancy key, consistent with every other hoa_ collection. Org is also
 *     derivable via member/unit, but a direct field keeps tenant-scoped queries
 *     and permission filters simple and robust.
 *   - unit_id    M2O → hoa_units (on_delete SET NULL)
 *   - start_date timestamp (registration/residency window start)
 *   - end_date   timestamp (set on move-out instead of deleting)
 * Also widens hoa_pets.type beyond dog|cat (bird/reptile/other) and backfills
 * organization (from the member) + unit_id/start_date (from the member's PRIMARY
 * ACTIVE hoa_member_units row).
 *
 * Permissions are left untouched (additive fields inherit existing perms): admins
 * keep full org access; members keep read of their OWN records. The richer
 * "all records on a unit" view — admins/board see any unit, owners/tenants see
 * units they've occupied with temporal overlap — is enforced server-side
 * (server/api/hoa/units/records), not via row policies.
 *
 * Run with: pnpm run extend:pets-vehicles
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing fields/relations are skipped; backfill only touches rows
 * whose unit_id is still null.
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...fieldConfig }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("already has an associated relationship") || error.message.includes("409")) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

// Add organization, unit_id (M2O → hoa_units), start_date, end_date to a
// member-tied collection.
async function extendCollection(collection: string): Promise<void> {
  console.log(`\n📁 Extending ${collection}...`);

  await createField(collection, "organization", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
      note: "Tenancy (denormalized from member/unit)",
    },
  });
  await createRelation({
    collection,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await createField(collection, "unit_id", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{unit_number}}" },
      note: "The unit this record is tied to (persists across tenants)",
    },
  });
  await createRelation({
    collection,
    field: "unit_id",
    related_collection: "hoa_units",
    schema: { on_delete: "SET NULL" },
  });

  await createField(collection, "start_date", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half", note: "Registration / residency window start" },
  });
  await createField(collection, "end_date", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half", note: "Set on move-out instead of deleting" },
  });
}

// Widen hoa_pets.type to include more species (additive — keeps dog/cat).
const PET_TYPE_CHOICES = [
  { text: "Dog", value: "dog" },
  { text: "Cat", value: "cat" },
  { text: "Bird", value: "bird" },
  { text: "Reptile", value: "reptile" },
  { text: "Other", value: "other" },
];
async function widenPetType(): Promise<void> {
  console.log("\n🐾 Widening hoa_pets.type choices (dog/cat → +bird/reptile/other)...");
  try {
    await directusFetch(`/fields/hoa_pets/type`, {
      method: "PATCH",
      body: JSON.stringify({
        meta: { interface: "select-dropdown", display: "labels", options: { choices: PET_TYPE_CHOICES, allowOther: true } },
      }),
    });
    console.log("   ✅ Updated hoa_pets.type choices");
  } catch (error: any) {
    console.log(`   ⚠️  Could not widen hoa_pets.type: ${error.message}`);
  }
}

// ── Backfill ─────────────────────────────────────────────────────────────────
// For each pet/vehicle still missing organization or unit_id, look up the owning
// member's organization and their PRIMARY ACTIVE hoa_member_units row (primary,
// no end_date) and copy organization + unit_id + start_date. Safe to re-run:
// only fills nulls (org and unit are patched independently).
async function backfill(collection: string): Promise<void> {
  console.log(`\n🔁 Backfilling ${collection}.organization + unit_id from member...`);

  const rows: any[] = (
    await directusFetch(
      `/items/${collection}?fields=id,member_id,organization,unit_id&filter=${encodeURIComponent(
        JSON.stringify({ _or: [{ organization: { _null: true } }, { unit_id: { _null: true } }], member_id: { _nnull: true } })
      )}&limit=-1`
    )
  )?.data ?? [];

  if (!rows.length) {
    console.log("   ⏭️  Nothing to backfill (no rows with a member and a missing org/unit).");
    return;
  }

  // Cache member → { organization, unit_id, start_date }.
  const memberInfo = new Map<string, { organization: string | null; unit_id: string | null; start_date: string | null }>();
  let filled = 0;

  for (const row of rows) {
    const memberId = typeof row.member_id === "string" ? row.member_id : row.member_id?.id;
    if (!memberId) continue;

    if (!memberInfo.has(memberId)) {
      const member = (await directusFetch(`/items/hoa_members/${memberId}?fields=organization`))?.data;
      const org = member ? (typeof member.organization === "string" ? member.organization : member.organization?.id) : null;

      const mu: any[] = (
        await directusFetch(
          `/items/hoa_member_units?fields=unit_id,start_date,is_primary_unit&filter=${encodeURIComponent(
            JSON.stringify({ member_id: { _eq: memberId }, end_date: { _null: true } })
          )}&sort=${encodeURIComponent("-is_primary_unit,-start_date")}&limit=1`
        )
      )?.data ?? [];
      const best = mu[0];
      const unitId = best ? (typeof best.unit_id === "string" ? best.unit_id : best.unit_id?.id) : null;
      memberInfo.set(memberId, { organization: org ?? null, unit_id: unitId, start_date: best?.start_date ?? null });
    }

    const src = memberInfo.get(memberId)!;
    const patch: Record<string, any> = {};
    if (!row.organization && src.organization) patch.organization = src.organization;
    if (!row.unit_id && src.unit_id) {
      patch.unit_id = src.unit_id;
      if (src.start_date) patch.start_date = src.start_date;
    }
    if (!Object.keys(patch).length) continue;

    await directusFetch(`/items/${collection}/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    filled++;
  }
  console.log(`   ✅ Backfilled ${filled} of ${rows.length} ${collection} row(s).`);
}

async function main(): Promise<void> {
  console.log("🚀 Extending hoa_pets + hoa_vehicles (unit + date range)...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await extendCollection("hoa_pets");
    await extendCollection("hoa_vehicles");
    await widenPetType();
    await backfill("hoa_pets");
    await backfill("hoa_vehicles");
    console.log("\n✅ Pets/vehicles extension complete!");
    console.log("\n📌 Note: new fields inherit the existing fields:['*'] permissions.");
    console.log("📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
