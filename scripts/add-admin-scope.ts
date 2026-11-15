/**
 * The scope fields on hoa_members — where a person is an admin or a manager,
 * as Directus permissions can read it (core/shared/roles/admin-scope.ts):
 *   admin_of           an active or pending HOA Admin membership
 *   manager_of         an active Property Manager membership
 *   communications_of  … with the communications grant
 *   inquiries_of       … with the inquiries grant
 *
 * 1. Creates each field: a plain uuid (not a relation), nullable, read-only.
 * 2. Back-fills them on every membership.
 * 3. Lists the people whose access changes once setup:permissions scopes the
 *    policies by them: a global HOA Admin or Property Manager with another
 *    kind of membership keeps member-level access there. Changes nothing.
 *
 * Order (docs/plan-role-first-ux.md, Session 6 log):
 *   pnpm add:admin-scope            this script (field + back-fill)
 *   deploy the app                  POST /api/internal/sync-admin-scope must exist
 *   pnpm create:admin-scope-flow    the Flow that keeps it current, and the nightly reconcile
 *   pnpm setup:permissions          scopes the HOA Admin policy by it; refuses while it is not back-filled
 *   pnpm generate:types
 *
 * Run with: pnpm add:admin-scope   (add --dry-run to report only)
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 * Idempotent: the field is created once; the back-fill writes only wrong rows.
 */
import { SCOPE_FIELDS, adminScopeOf, managerScopeOf, scopeChanges, type ScopeField, type ScopedMembershipWithGrants } from "../core/shared/roles/admin-scope";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
// Same default as core/nuxt.config.ts `directusRoleHoaAdmin`.
const HOA_ADMIN_ROLE = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_HOA_ADMIN || "38494e81-9b49-4c64-a197-fcb8097cd433";
// Same default as core/nuxt.config.ts `directusRolePropertyManager`.
const PM_ROLE = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PROPERTY_MANAGER || "b3c5a96f-ca24-41f1-8c1f-5683db384844";
const ROLES = { hoaAdmin: HOA_ADMIN_ROLE, propertyManager: PM_ROLE };

const FIELD_NOTES: Record<ScopeField, string> = {
  admin_of: "The organization on an active or pending HOA Admin membership, else null. Written only by /api/internal/sync-admin-scope; the HOA Admin policy scopes every rule with it.",
  manager_of: "The organization on an active Property Manager membership, else null. Written only by /api/internal/sync-admin-scope; the Property Manager policy scopes its rules with it.",
  communications_of: "manager_of when the manager holds the communications grant, else null. Scopes the manager's reads of emails and recipients.",
  inquiries_of: "manager_of when the manager holds the inquiries grant, else null. Scopes the manager's reads and edits of requests and internal comments.",
};

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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fieldExists(field: ScopeField): Promise<boolean> {
  try {
    await directusFetch(`/fields/hoa_members/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureFields(): Promise<Set<ScopeField>> {
  const present = new Set<ScopeField>();
  for (const field of SCOPE_FIELDS) {
    console.log(`\n👤 hoa_members.${field}`);
    if (await fieldExists(field)) {
      console.log("   ⏭️  already exists, skipping");
      present.add(field);
      continue;
    }
    if (DRY_RUN) {
      console.log(`   🔎 would create ${field} (uuid, nullable, read-only; not a relation)`);
      continue;
    }
    await directusFetch("/fields/hoa_members", {
      method: "POST",
      body: JSON.stringify({
        field,
        type: "uuid",
        schema: { is_nullable: true, default_value: null },
        meta: { interface: "input", readonly: true, hidden: true, width: "half", note: FIELD_NOTES[field] },
      }),
    });
    console.log(`   ✅ Created ${field}`);
    present.add(field);
  }
  return present;
}

async function backfill(present: Set<ScopeField>): Promise<void> {
  console.log("\n🧮 Back-fill");
  const res = await directusFetch("/items/hoa_members?fields=*&limit=-1");
  // A dry run compares every field, as if the missing ones existed and were null.
  const rows: ScopedMembershipWithGrants[] = (res?.data ?? []).map((r: ScopedMembershipWithGrants) =>
    DRY_RUN ? { ...Object.fromEntries(SCOPE_FIELDS.filter((f) => !present.has(f)).map((f) => [f, null])), ...r } : r
  );
  const changes = scopeChanges(rows, ROLES);
  for (const c of changes) {
    console.log(`   ${DRY_RUN ? "🔎 would set" : "✏️  set"} ${c.id} → ${JSON.stringify(c.patch)}`);
    if (!DRY_RUN) await directusFetch(`/items/hoa_members/${c.id}`, { method: "PATCH", body: JSON.stringify(c.patch) });
  }
  const admins = rows.filter((r) => adminScopeOf(r, HOA_ADMIN_ROLE)).length;
  const managers = rows.filter((r) => managerScopeOf(r, PM_ROLE)).length;
  console.log(`   ${rows.length} memberships · ${admins} administer · ${managers} manage · ${changes.length} ${DRY_RUN ? "to write" : "written"}`);
}

async function reportNarrowed(): Promise<void> {
  const res = await directusFetch("/items/hoa_members?fields=id,user,role,status,organization.name&limit=-1");
  const rows: any[] = res?.data ?? [];
  for (const [label, roleId, scopeOf] of [
    ["HOA Admin", HOA_ADMIN_ROLE, adminScopeOf],
    ["Property Manager", PM_ROLE, managerScopeOf],
  ] as const) {
    console.log(`\n🔐 Global ${label}s with another kind of membership (listed only — not changed)`);
    const users = (await directusFetch(`/users?filter[role][_eq]=${roleId}&fields=id&limit=-1`))?.data ?? [];
    const ids = new Set(users.map((u: { id: string }) => u.id));
    // Their own row, not of that kind, and still live: there the policy stops reaching.
    const ofKind = (m: any) => scopeOf({ id: m.id, role: m.role, status: m.status, organization: "x" }, roleId) !== null;
    const affected = rows.filter((m) => ids.has(m.user) && !ofKind(m) && m.status !== "archived");
    if (!affected.length) console.log(`   none (${ids.size} users hold the global ${label} role)`);
    for (const m of affected) {
      console.log(`   user ${m.user} in ${m.organization?.name ?? "?"} (${m.status}): ${label.toLowerCase()}-level → member-level once the policy is scoped`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`🚀 add-admin-scope${DRY_RUN ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${new URL(DIRECTUS_URL!).host} · HOA Admin role ${HOA_ADMIN_ROLE} · Property Manager role ${PM_ROLE}`);
  const present = await ensureFields();
  await backfill(present);
  await reportNarrowed();
  console.log(`\n✅ Done${DRY_RUN ? " (dry run)" : ""}. Next: deploy the app, then pnpm create:admin-scope-flow, then pnpm setup:permissions, then pnpm generate:types`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
