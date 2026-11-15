/**
 * Two Directus Flows that keep hoa_members.admin_of current
 * (core/shared/roles/admin-scope.ts), in the member-count flow's pattern:
 *
 *   "Admin scope sync"       event (action) on hoa_members create and update →
 *                            POST /api/internal/sync-admin-scope with the trigger
 *                            (its `key` or `keys`). Role and status are edited on
 *                            the client as well as by server routes, so only a
 *                            Directus-side hook sees every writer.
 *   "Admin scope reconcile"  nightly → the same route with { all: true }.
 *
 * The route writes only rows that are wrong, so the Flow's echo of that write
 * ends at once. If a call fails, the row keeps its old value until the next
 * write or the nightly run: a new admin waits for admin access; a removed
 * admin keeps it at most a day. setup:permissions refuses to scope the policy
 * while any row is wrong.
 *
 * Run AFTER the app with /api/internal/sync-admin-scope is deployed.
 * Run with: pnpm create:admin-scope-flow   (add --dry-run to report only)
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, APP_URL (or NUXT_PUBLIC_APP_URL), CRON_SECRET.
 * Idempotent: a flow with the same name is left as it is.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APP_URL = (process.env.APP_URL || process.env.NUXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN || !APP_URL || !CRON_SECRET) {
  console.error("❌ Needs DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, APP_URL (or NUXT_PUBLIC_APP_URL) and CRON_SECRET.");
  console.error("   CRON_SECRET is required: the route refuses a call without it.");
  process.exit(1);
}

// https for any real host: the site answers http with a redirect, and the
// sync should not depend on how the Flow's client follows one.
const BASE = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(APP_URL) ? APP_URL : APP_URL.replace(/^http:\/\//, "https://");
const ENDPOINT = `${BASE}/api/internal/sync-admin-scope`;

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const requestOp = (body: string) => ({
  type: "request",
  name: "POST sync-admin-scope",
  key: "post_sync_admin_scope",
  position_x: 19,
  position_y: 1,
  options: {
    method: "POST",
    url: ENDPOINT,
    headers: [
      { header: "x-cron-secret", value: CRON_SECRET },
      { header: "Content-Type", value: "application/json" },
    ],
    body,
  },
});

async function ensureFlow(name: string, flow: Record<string, unknown>, body: string): Promise<void> {
  const existing = await df(`/flows?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,status&limit=1`);
  if (existing?.data?.length) {
    console.log(`   ⏭️  "${name}" already exists (${existing.data[0].status}), leaving it`);
    return;
  }
  if (DRY_RUN) {
    console.log(`   🔎 would create "${name}" (${flow.trigger}) → POST ${ENDPOINT} with ${body === "{{$trigger}}" ? "the trigger" : body}`);
    return;
  }
  const created = await df("/flows", { method: "POST", body: JSON.stringify({ name, status: "active", accountability: null, ...flow }) });
  const op = await df("/operations", { method: "POST", body: JSON.stringify({ flow: created.data.id, ...requestOp(body) }) });
  await df(`/flows/${created.data.id}`, { method: "PATCH", body: JSON.stringify({ operation: op.data.id }) });
  console.log(`   ✅ Created "${name}" → POST ${ENDPOINT}`);
}

async function main(): Promise<void> {
  console.log(`🚀 create-admin-scope-flow${DRY_RUN ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${new URL(DIRECTUS_URL!).host} → ${new URL(APP_URL).host}`);

  // The whole trigger, raw: Directus renders a lone {{ }} as the value itself,
  // so the route receives { event, payload, key | keys, collection }.
  await ensureFlow(
    "Admin scope sync",
    {
      icon: "admin_panel_settings",
      color: "#6366f1",
      trigger: "event",
      options: { type: "action", scope: ["items.create", "items.update"], collections: ["hoa_members"] },
    },
    "{{$trigger}}"
  );
  await ensureFlow(
    "Admin scope reconcile (nightly)",
    { icon: "admin_panel_settings", color: "#6366f1", trigger: "schedule", options: { cron: "30 2 * * *" } },
    JSON.stringify({ all: true })
  );
  console.log(`\n✅ Done${DRY_RUN ? " (dry run)" : ""}. Next: pnpm setup:permissions:audit, then pnpm setup:permissions`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
