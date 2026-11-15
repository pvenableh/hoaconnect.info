/**
 * hoa_members.admin_of — where a person is an admin, as Directus permissions
 * can read it (core/shared/roles/admin-scope.ts).
 *
 * 1. Creates the field: a plain uuid (not a relation), nullable, read-only.
 * 2. Back-fills it on every membership: the organization on an active or
 *    pending HOA Admin membership, null on every other.
 * 3. Lists the people whose access changes once setup:permissions scopes the
 *    HOA Admin policy by it: a global HOA Admin with a non-admin membership
 *    keeps member-level access there instead of admin-level. Changes nothing.
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
import { adminScopeChanges, adminScopeOf, type ScopedMembership } from "../core/shared/roles/admin-scope";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
// Same default as core/nuxt.config.ts `directusRoleHoaAdmin`.
const HOA_ADMIN_ROLE = process.env.NUXT_PUBLIC_DIRECTUS_ROLE_HOA_ADMIN || "38494e81-9b49-4c64-a197-fcb8097cd433";

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

async function fieldExists(): Promise<boolean> {
  try {
    await directusFetch("/fields/hoa_members/admin_of");
    return true;
  } catch {
    return false;
  }
}

async function ensureField(): Promise<boolean> {
  console.log("\n👤 hoa_members.admin_of");
  if (await fieldExists()) {
    console.log("   ⏭️  already exists, skipping");
    return true;
  }
  if (DRY_RUN) {
    console.log("   🔎 would create admin_of (uuid, nullable, read-only; not a relation)");
    return false;
  }
  await directusFetch("/fields/hoa_members", {
    method: "POST",
    body: JSON.stringify({
      field: "admin_of",
      type: "uuid",
      schema: { is_nullable: true, default_value: null },
      meta: {
        interface: "input",
        readonly: true,
        hidden: true,
        width: "half",
        note: "The organization on an active or pending HOA Admin membership, else null. Written only by /api/internal/sync-admin-scope; the HOA Admin policy scopes every rule with it.",
      },
    }),
  });
  console.log("   ✅ Created admin_of");
  return true;
}

async function backfill(hasField: boolean): Promise<void> {
  console.log("\n🧮 Back-fill");
  const fields = hasField ? "id,user,role,status,organization,admin_of" : "id,user,role,status,organization";
  const res = await directusFetch(`/items/hoa_members?fields=${fields}&limit=-1`);
  const rows: (ScopedMembership & { user?: string })[] = res?.data ?? [];
  const changes = adminScopeChanges(rows, HOA_ADMIN_ROLE);
  for (const c of changes) {
    console.log(`   ${DRY_RUN ? "🔎 would set" : "✏️  set"} ${c.id} → ${c.admin_of ?? "null"}`);
    if (!DRY_RUN) await directusFetch(`/items/hoa_members/${c.id}`, { method: "PATCH", body: JSON.stringify({ admin_of: c.admin_of }) });
  }
  const admins = rows.filter((r) => adminScopeOf(r, HOA_ADMIN_ROLE)).length;
  console.log(`   ${rows.length} memberships · ${admins} administer a community · ${changes.length} ${DRY_RUN ? "to write" : "written"}`);
}

async function reportNarrowed(): Promise<void> {
  console.log("\n🔐 Global HOA Admins with a non-admin membership (listed only — not changed)");
  const users = (await directusFetch(`/users?filter[role][_eq]=${HOA_ADMIN_ROLE}&fields=id&limit=-1`))?.data ?? [];
  const ids = new Set(users.map((u: { id: string }) => u.id));
  const res = await directusFetch("/items/hoa_members?fields=id,user,role,status,organization.name&limit=-1");
  // Their own row, not an admin one, and still live: there the policy stops granting admin.
  const isAdminRow = (m: any) => adminScopeOf({ id: m.id, role: m.role, status: m.status, organization: "x" }, HOA_ADMIN_ROLE) !== null;
  const affected = (res?.data ?? []).filter((m: any) => ids.has(m.user) && !isAdminRow(m) && m.status !== "archived");
  if (!affected.length) {
    console.log(`   none (${ids.size} users hold the global HOA Admin role)`);
    return;
  }
  for (const m of affected) {
    console.log(`   user ${m.user} in ${m.organization?.name ?? "?"} (${m.status}): admin-level → member-level once the policy is scoped`);
  }
}

async function main(): Promise<void> {
  console.log(`🚀 add-admin-scope${DRY_RUN ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${new URL(DIRECTUS_URL!).host} · HOA Admin role ${HOA_ADMIN_ROLE}`);
  const hasField = await ensureField();
  await backfill(hasField);
  await reportNarrowed();
  console.log(`\n✅ Done${DRY_RUN ? " (dry run)" : ""}. Next: deploy the app, then pnpm create:admin-scope-flow, then pnpm setup:permissions, then pnpm generate:types`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
