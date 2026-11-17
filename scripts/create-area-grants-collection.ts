/**
 * Delegation to members (docs/spec-delegation.md): one collection.
 *
 *   hoa_area_grants   one row per holder (a member or a team) per area, with
 *                     when it started and ended and who did each. Ended, never
 *                     deleted: switching an area off sets ends_at.
 *
 * No permissions here: scripts/setup-directus-permissions.ts gives no policy
 * any access (every read and write is a route under /api/org/area-grants,
 * admin only, with the admin token).
 *
 * Run with: pnpm create:area-grants   (add --dry-run to report only)
 * Then:     pnpm setup:permissions:audit (expect nothing to change), pnpm generate:types
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 * Idempotent: everything is created only when absent.
 */
import { HELPER_AREA_KEYS } from "../core/shared/roles/area-grants";
import { areaLabel } from "../core/shared/transition/grants";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const would = (what: string) => console.log(`   🔎 would ${what}`);

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
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function exists(endpoint: string): Promise<boolean> {
  try {
    await directusFetch(endpoint);
    return true;
  } catch {
    return false;
  }
}

/** Collections created in this run, so a dry run knows their fields are new too. */
const plannedCollections = new Set<string>();

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await exists(`/collections/${collection}`)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping`);
    return;
  }
  plannedCollections.add(collection);
  if (DRY_RUN) return would(`create collection ${collection}`);
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } },
      ],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, config: Record<string, any>): Promise<void> {
  if (!plannedCollections.has(collection) && (await exists(`/fields/${collection}/${field}`))) {
    console.log(`   ⏭️  ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`create field ${collection}.${field} (${config.type})`);
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...config }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(config: { collection: string; field: string; related_collection: string; meta?: any; schema?: any }): Promise<void> {
  const { collection, field, related_collection } = config;
  if (!plannedCollections.has(collection) && (await exists(`/relations/${collection}/${field}`))) {
    console.log(`   ⏭️  Relation ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`relate ${collection}.${field} → ${related_collection} (${config.schema?.on_delete ?? "NO ACTION"})`);
  await directusFetch("/relations", { method: "POST", body: JSON.stringify(config) });
  console.log(`   ✅ Related ${collection}.${field} → ${related_collection}`);
}

const choices = (list: readonly { key: string; label: string }[]) => list.map((c) => ({ text: c.label, value: c.key }));

const dropdown = (list: readonly { key: string; label: string }[], extra: Record<string, any> = {}) => ({
  interface: "select-dropdown",
  options: { choices: choices(list) },
  display: "labels",
  width: "half",
  ...extra,
});

async function addOrgField(collection: string): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection, field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });
}

async function addM2O(collection: string, field: string, related: string, note: string, oneField: string | null = null): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    schema: { is_nullable: true },
    meta: { interface: "select-dropdown-m2o", width: "half", note },
  });
  await createRelation({ collection, field, related_collection: related, meta: { one_field: oneField, sort_field: null }, schema: { on_delete: "SET NULL" } });
}

// ── hoa_area_grants ─────────────────────────────────────────────────────────

const END_REASONS = [
  { key: "revoked", label: "Revoked by an admin" },
  { key: "transition", label: "Ended by a management transition" },
] as const;

async function createAreaGrants(): Promise<void> {
  const c = "hoa_area_grants";
  console.log(`\n🔑 ${c}`);
  await createCollection(c, {
    collection: c,
    icon: "key",
    note: "Areas a member (helper) or a team (committee) may work on. Exactly one of member / team. Ended, never deleted. Read and written only through /api/org/area-grants.",
    hidden: true,
  });
  await addOrgField(c);
  await createField(c, "area", {
    type: "string",
    schema: { is_nullable: false },
    meta: dropdown(HELPER_AREA_KEYS.map((k) => ({ key: k, label: areaLabel(k) })), { required: true, note: "A key of HELPER_AREA_KEYS (core/shared/roles/area-grants.ts). Checked by the route." }),
  });
  await addM2O(c, "member", "hoa_members", "A member of this community (a helper). Exactly one of member / team.");
  await addM2O(c, "team", "hoa_teams", "A team of this community (a committee). Exactly one of member / team.");
  await createField(c, "starts_at", { type: "timestamp", schema: { is_nullable: false }, meta: { interface: "datetime", required: true, width: "half" } });
  await createField(c, "ends_at", { type: "timestamp", schema: { is_nullable: true }, meta: { interface: "datetime", width: "half", note: "Null while the grant is open. Exclusive: the grant stops at this instant." } });
  await addM2O(c, "granted_by", "directus_users", "The admin who opened the row");
  await addM2O(c, "ended_by", "directus_users", "The admin who ended it");
  await createField(c, "end_reason", { type: "string", schema: { is_nullable: true }, meta: dropdown(END_REASONS) });
  await createField(c, "holder_name", { type: "string", meta: { interface: "input", width: "half", readonly: true, note: "Frozen by the server when the row ends, so a departed holder still reads correctly." } });
  await createField(c, "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField(c, "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection: c, field: "user_created", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });
}

async function main(): Promise<void> {
  console.log(`🚀 Delegation to members${DRY_RUN ? " (dry run)" : ""}`);
  await createAreaGrants();
  console.log(DRY_RUN ? "\n✅ Dry run complete. Nothing was written." : "\n✅ Done. Next: pnpm setup:permissions:audit, then pnpm generate:types.");
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
