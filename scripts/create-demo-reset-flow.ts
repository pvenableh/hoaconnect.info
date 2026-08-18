/**
 * Create a nightly Directus scheduled flow that resets the public "try the app"
 * demo orgs to a clean baseline (POST /api/demo/reset). Mirrors
 * create-member-count-flow.ts.
 *
 * Run with: pnpm run create:demo-reset-flow
 * Prerequisites in .env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, APP_URL, CRON_SECRET.
 * Idempotent: skips if a flow with the same name already exists.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APP_URL = process.env.APP_URL || process.env.NUXT_PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!APP_URL) {
  console.error("❌ Missing APP_URL (or NUXT_PUBLIC_APP_URL)");
  process.exit(1);
}
if (!CRON_SECRET) {
  console.warn("⚠️  CRON_SECRET not set — the flow will call the endpoint without the header (route will 401).");
}

const FLOW_NAME = "Demo Reset (nightly)";
const CRON = "0 4 * * *"; // 04:00 daily (offset from other nightly flows)

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  console.log(`🌙 Creating nightly demo-reset flow ("${FLOW_NAME}", ${CRON})\n`);

  const existing = await df(
    `/flows?filter[name][_eq]=${encodeURIComponent(FLOW_NAME)}&fields=id&limit=1`
  );
  if (existing?.data?.length) {
    console.log("   ⏭️  Flow already exists, skipping.");
    return;
  }

  const flowRes = await df("/flows", {
    method: "POST",
    body: JSON.stringify({
      name: FLOW_NAME,
      icon: "restart_alt",
      color: "#6366f1",
      status: "active",
      trigger: "schedule",
      accountability: null,
      options: { cron: CRON },
    }),
  });
  const flowId = flowRes.data.id;

  const opRes = await df("/operations", {
    method: "POST",
    body: JSON.stringify({
      flow: flowId,
      type: "request",
      name: "POST demo/reset",
      key: "post_demo_reset",
      position_x: 19,
      position_y: 1,
      options: {
        method: "POST",
        url: `${APP_URL!.replace(/\/$/, "")}/api/demo/reset`,
        headers: CRON_SECRET ? [{ header: "x-cron-secret", value: CRON_SECRET }] : [],
        body: "{}",
      },
    }),
  });

  await df(`/flows/${flowId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: opRes.data.id }),
  });

  console.log(`   ✅ Created flow ${flowId} → POST ${APP_URL}/api/demo/reset`);
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
