/**
 * `ops_job_heartbeats`: when each scheduled job last ran (docs/plan-operator-console.md
 * §5, Phase 4). One row per job, keyed by the job's name (core/shared/ops/jobs.ts),
 * upserted by the job at the end of every real run:
 *
 *   id               — the job key, e.g. "reminders" (string primary key)
 *   last_started_at  — when the last run started
 *   last_finished_at — when it ended
 *   last_status      — ok | error
 *   last_error       — the error, cut to 500 characters, when it failed
 *   last_summary     — counts the job reports (sent, expired, …), no personal data
 *   last_via         — cron | app-admin | manual
 *   last_ok_at       — the last run that succeeded, kept across failing runs
 *
 * Written by core/server/utils/job-heartbeat.ts (Vercel crons) and
 * scripts/lib/job-heartbeat.ts (GitHub Actions workers); read by GET /api/ops/health.
 * No role gets access: both use the admin token. Not an audit log: rows are
 * overwritten on every run, by design.
 *
 * Read-only by default:
 *   pnpm run create:ops-job-heartbeats            # look
 *   pnpm run create:ops-job-heartbeats -- --apply # create (hosted Directus: Peter's yes first)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");
const C = "ops_job_heartbeats";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const FIELDS = [
  { field: "last_started_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true }, schema: { is_nullable: true } },
  { field: "last_finished_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true }, schema: { is_nullable: true } },
  { field: "last_status", type: "string", meta: { interface: "input", width: "half", readonly: true }, schema: { is_nullable: true, max_length: 16 } },
  { field: "last_via", type: "string", meta: { interface: "input", width: "half", readonly: true }, schema: { is_nullable: true, max_length: 32 } },
  { field: "last_ok_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true }, schema: { is_nullable: true } },
  { field: "last_error", type: "text", meta: { interface: "input-multiline", width: "full", readonly: true }, schema: { is_nullable: true } },
  { field: "last_summary", type: "json", meta: { interface: "input-code", width: "full", readonly: true, options: { language: "json" } }, schema: { is_nullable: true } },
];

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);
  const exists = !!(await directusFetch(`/collections/${C}`))?.data;
  const have = new Set<string>(
    exists ? (((await directusFetch(`/fields/${C}`))?.data ?? []) as Array<{ field: string }>).map((f) => f.field) : []
  );
  const missing = FIELDS.filter((f) => !have.has(f.field));
  console.log(`Collection ${C}: ${exists ? "exists" : "missing"}`);
  console.log(`Fields missing: ${missing.length ? missing.map((f) => f.field).join(", ") : "none"}`);
  if (exists) {
    const rows = ((await directusFetch(`/items/${C}?fields=id,last_status&limit=-1`))?.data ?? []) as Array<{ id: string; last_status: string }>;
    console.log(`Rows: ${rows.length}${rows.length ? ` (${rows.map((r) => `${r.id}:${r.last_status}`).join(", ")})` : ""}`);
  }
  if (!APPLY) {
    if (!exists || missing.length) console.log("\nNothing written. Run with --apply to create what's missing.");
    return;
  }

  if (!exists) {
    await directusFetch("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: C,
        meta: {
          icon: "monitor_heart",
          note: "When each scheduled job last ran. One row per job, overwritten each run. Written by the jobs; read by /ops/health.",
          display_template: "{{id}} · {{last_status}} · {{last_finished_at}}",
          hidden: false,
        },
        schema: { name: C },
        fields: [
          {
            field: "id",
            type: "string",
            meta: { interface: "input", readonly: true, note: "The job key (core/shared/ops/jobs.ts)." },
            schema: { is_primary_key: true, has_auto_increment: false, max_length: 64 },
          },
        ],
      }),
    });
    console.log(`Created collection ${C}`);
  }
  for (const f of missing) {
    await directusFetch(`/fields/${C}`, { method: "POST", body: JSON.stringify(f) });
    console.log(`Created field ${f.field}`);
  }
  const perms = ((await directusFetch(`/permissions?filter=${encodeURIComponent(JSON.stringify({ collection: { _eq: C } }))}&limit=-1&fields=id`))?.data ?? []) as unknown[];
  console.log(`\nRole permissions on ${C}: ${perms.length} (expected 0).`);
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
