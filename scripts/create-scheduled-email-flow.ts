/**
 * Phase 9 (Stage C) — create a Directus scheduled Flow that drives the email
 * scheduler. Every 5 minutes the Flow POSTs to the app's process-scheduled
 * endpoint, which sends any due scheduled emails.
 *
 * Idempotent by flow name. Run with: pnpm run create:scheduled-flow
 *
 * Required env:
 * - DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin)
 * - APP_URL: public base URL of the Nuxt app the Directus instance can reach
 *   (e.g. https://app.hoaconnect.info) — NOT localhost, which Directus can't hit.
 * - CRON_SECRET: shared secret; must match the app's CRON_SECRET env so the
 *   endpoint authorizes the Flow.
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
  console.error("❌ Missing APP_URL (public URL of the Nuxt app, reachable from Directus).");
  process.exit(1);
}
if (!CRON_SECRET) {
  console.warn("⚠️  CRON_SECRET not set — the Flow will call the endpoint without a secret.");
  console.warn("    Set CRON_SECRET in this app's env AND here so the endpoint authorizes the Flow.");
}

const FLOW_NAME = "Email Scheduler (Phase 9)";
const CRON = "*/5 * * * *"; // every 5 minutes

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
  console.log("🚀 Creating Directus scheduled Flow for the email scheduler\n");

  // Idempotency: skip if a flow with this name already exists
  const existing = await df(
    `/flows?filter=${encodeURIComponent(JSON.stringify({ name: { _eq: FLOW_NAME } }))}&fields=id,name`
  );
  if (existing?.data?.length) {
    console.log(`   ⏭️  Flow "${FLOW_NAME}" already exists (${existing.data[0].id}). Skipping.`);
    return;
  }

  // 1) Create the schedule-triggered flow
  const flowRes = await df("/flows", {
    method: "POST",
    body: JSON.stringify({
      name: FLOW_NAME,
      icon: "schedule_send",
      color: "#3b82f6",
      status: "active",
      trigger: "schedule",
      accountability: null,
      options: { cron: CRON },
    }),
  });
  const flowId = flowRes.data.id;
  console.log(`   ✅ Created flow ${flowId} (cron ${CRON})`);

  // 2) Create the request operation that POSTs to the scheduler endpoint
  const opRes = await df("/operations", {
    method: "POST",
    body: JSON.stringify({
      flow: flowId,
      type: "request",
      name: "POST process-scheduled",
      key: "post_process_scheduled",
      position_x: 19,
      position_y: 1,
      options: {
        method: "POST",
        url: `${APP_URL}/api/email/process-scheduled`,
        headers: CRON_SECRET ? [{ header: "x-cron-secret", value: CRON_SECRET }] : [],
        body: "{}",
      },
    }),
  });
  const opId = opRes.data.id;
  console.log(`   ✅ Created request operation ${opId} → ${APP_URL}/api/email/process-scheduled`);

  // 3) Point the flow at its first operation
  await df(`/flows/${flowId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: opId }),
  });
  console.log(`   ✅ Linked operation as the flow's entry point`);

  console.log("\n✅ Scheduled Flow is active. It will POST every 5 minutes.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
