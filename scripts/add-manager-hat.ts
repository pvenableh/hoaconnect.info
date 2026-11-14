/**
 * Role-first UX, Phase 1a — the property-manager hat on the membership.
 *
 * Spec: docs/spec-role-context.md. Plan: docs/plan-role-first-ux.md §2.1.
 *
 * Adds three fields to `hoa_members`:
 *
 *   1. `is_manager` (boolean, default false)
 *      The manager HAT: identity only — badge, queue-first home, "Managed by"
 *      routing, assignment default. It never grants access. Until now the only
 *      way to be a manager was the Property Manager ROLE, so a manager who was
 *      made admin lost the identity. The hat lets a membership be both.
 *
 *   2. `manager_title` (string, nullable)
 *      "Accounting", "Maintenance" — a community can have several managers,
 *      each with a different job.
 *
 *   3. `manager_areas` (json, nullable)
 *      `{ [area]: { work: boolean, notify: boolean } }`, one entry per key in
 *      `AREAS` (core/shared/transition/grants.ts). `notify` decides who
 *      `resolveNotified()` addresses for an area. `work` is back-filled as a
 *      MIRROR of `manager_permissions`: every enforcement path and every writer
 *      still uses `manager_permissions`, and the RoleContext reads it, until one
 *      later change moves the writers and the readers together.
 *
 * Back-fill (so nobody loses access or identity):
 *   - every member with the Property Manager role, any status → `is_manager`
 *     true, and `manager_areas` built from their `manager_permissions` with
 *     every `notify` false (nobody is newly notified; the admin fallback is
 *     what happens today).
 *   - a row that already has `is_manager` true or a `manager_areas` value is
 *     left alone, so a re-run never overwrites an admin's later edits.
 *   - admins linked from a management vendor (`hoa_vendors.hoa_member`) are
 *     LISTED, not changed: whether an admin is also the community's manager is
 *     the account owner's call.
 *
 * Before this runs, the app reads `hoa_members` with `*` and resolves every
 * row as `source: "legacy"` (hat = Property Manager role, nobody notified).
 *
 * Idempotent: each field is created only when absent; the back-fill only
 * touches rows that still need it.
 *
 * Run with: pnpm add:manager-hat   (add --dry-run to report only)
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then run
 * `pnpm generate:types`.
 */
import { AREAS, MANAGER_GRANT_KEYS, normalizeGrants } from "../core/shared/transition/grants";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
// Same default as core/nuxt.config.ts `directusRolePropertyManager`.
const PM_ROLE =
  process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PROPERTY_MANAGER || "b3c5a96f-ca24-41f1-8c1f-5683db384844";

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
  if (response.status === 204) return null;
  return response.json();
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureField(field: string, body: Record<string, unknown>): Promise<void> {
  console.log(`\n👤 hoa_members.${field}`);
  if (await fieldExists("hoa_members", field)) {
    console.log(`   ⏭️  ${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) {
    console.log(`   🔎 would create ${field}`);
    return;
  }
  await directusFetch("/fields/hoa_members", { method: "POST", body: JSON.stringify({ field, ...body }) });
  console.log(`   ✅ Created ${field}`);
}

async function ensureFields(): Promise<void> {
  await ensureField("is_manager", {
    type: "boolean",
    // NOT NULL with a default: every existing row reads false, so the
    // RoleContext can tell "field present" (boolean) from "not yet" (undefined).
    schema: { is_nullable: false, default_value: false },
    meta: {
      interface: "boolean",
      special: ["cast-boolean"],
      width: "half",
      note: "The property-manager hat: identity only (badge, queue-first home, routing). Never grants access — that comes from admin or manager_permissions.",
    },
  });
  await ensureField("manager_title", {
    type: "string",
    schema: { is_nullable: true, default_value: null, max_length: 80 },
    meta: {
      interface: "input",
      width: "half",
      note: "What this manager does here, e.g. Accounting or Maintenance. Shown only with the manager hat.",
    },
  });
  await ensureField("manager_areas", {
    type: "json",
    schema: { is_nullable: true, default_value: null },
    meta: {
      interface: "input-code",
      options: { language: "json" },
      special: ["cast-json"],
      note: `Per area { work, notify }. Areas: ${AREAS.map((a) => a.key).join(", ")}. notify picks who is addressed for the area (admins when nobody). work mirrors manager_permissions until the cutover.`,
    },
  });
}

/** `{ [area]: { work, notify } }` from stored grants. Notify-only areas get work false. */
function areasFrom(stored: unknown): Record<string, { work: boolean; notify: boolean }> {
  const grants = normalizeGrants(stored as Record<string, unknown> | null);
  const grantable = new Set<string>(MANAGER_GRANT_KEYS);
  return Object.fromEntries(
    AREAS.map((a) => [a.key, { work: grantable.has(a.key) && grants[a.key as keyof typeof grants] === true, notify: false }])
  );
}

async function backfillManagers(): Promise<void> {
  console.log("\n🧢 Back-fill: Property Manager role → manager hat");
  const fieldsReady = (await fieldExists("hoa_members", "is_manager")) && (await fieldExists("hoa_members", "manager_areas"));
  const fields = fieldsReady
    ? "id,organization,status,manager_permissions,is_manager,manager_areas"
    : "id,organization,status,manager_permissions";
  const res = await directusFetch(
    `/items/hoa_members?filter[role][_eq]=${encodeURIComponent(PM_ROLE)}&fields=${fields}&limit=-1`
  );
  const rows: any[] = res?.data ?? [];
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const patch: Record<string, unknown> = {};
    if (row.is_manager !== true) patch.is_manager = true;
    if (row.manager_areas == null) patch.manager_areas = areasFrom(row.manager_permissions);
    if (!Object.keys(patch).length) {
      skipped++;
      continue;
    }
    const on = Object.entries(patch.manager_areas ?? {})
      .filter(([, v]) => (v as { work: boolean }).work)
      .map(([k]) => k);
    console.log(`   ${DRY_RUN ? "🔎 would set" : "✏️  set"} ${row.id} (${row.status}, org ${row.organization}) work: ${on.join(", ") || "none"}`);
    if (!DRY_RUN) {
      await directusFetch(`/items/hoa_members/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    }
    updated++;
  }
  console.log(`   ${rows.length} Property Manager members · ${updated} ${DRY_RUN ? "to update" : "updated"} · ${skipped} already done`);
}

async function listVendorLinkedAdmins(): Promise<void> {
  console.log("\n📇 Admins linked from a management vendor (listed only — not changed)");
  const res = await directusFetch(
    "/items/hoa_vendors?filter[category][_eq]=management&filter[status][_neq]=archived&fields=id,company,organization,hoa_member.id,hoa_member.role,hoa_member.status&limit=-1"
  );
  const linked = (res?.data ?? []).filter(
    (v: any) => v.hoa_member && v.hoa_member.role && v.hoa_member.role !== PM_ROLE && v.hoa_member.status === "active"
  );
  if (!linked.length) {
    console.log("   none");
    return;
  }
  for (const v of linked) {
    console.log(`   ${v.company ?? v.id} → member ${v.hoa_member.id} (org ${v.organization}): set is_manager by hand if they manage`);
  }
}

async function main(): Promise<void> {
  console.log(`🚀 add-manager-hat${DRY_RUN ? " (dry run — nothing is written)" : ""}`);
  console.log(`   Property Manager role: ${PM_ROLE}`);
  await ensureFields();
  await backfillManagers();
  await listVendorLinkedAdmins();
  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
