/**
 * The GitHub Actions workers' heartbeat: one `ops_job_heartbeats` row per job,
 * upserted over REST with the admin token (the Nitro side is
 * core/server/utils/job-heartbeat.ts; both write `heartbeatRow`'s shape).
 *
 * Never fails a run: a heartbeat that can't be written is a warning. Dry runs
 * aren't recorded. Usage, replacing `main().catch(...)`:
 *
 *   runWithHeartbeat("data-export", DRY_RUN, main).catch((err) => { ...; process.exit(1); });
 */
import { heartbeatRow, type OpsJobKey } from "../../core/shared/ops/jobs";

async function write(job: OpsJobKey, run: Parameters<typeof heartbeatRow>[1]): Promise<void> {
  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!url || !token) return;
  const { id, last_ok_at, ...rest } = heartbeatRow(job, run);
  const data = last_ok_at ? { ...rest, last_ok_at } : rest;
  const send = (method: string, path: string, body: object) =>
    fetch(`${url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    // A missing row answers 204, not an error: Directus updates nothing and
    // can't read the item back. Only a 200 means the row was there.
    const updated = await send("PATCH", `/items/ops_job_heartbeats/${id}`, data);
    if (updated.status === 200) return;
    const created = await send("POST", "/items/ops_job_heartbeats", { id, ...data });
    if (!created.ok) console.warn(`[job-heartbeat] ${job} not recorded: HTTP ${created.status}`);
  } catch (e: any) {
    console.warn(`[job-heartbeat] ${job} not recorded:`, e?.message ?? e);
  }
}

export async function runWithHeartbeat(job: OpsJobKey, dry: boolean, main: () => Promise<unknown>): Promise<void> {
  const startedAt = new Date();
  try {
    await main();
    if (!dry) await write(job, { startedAt, finishedAt: new Date(), ok: true });
  } catch (e) {
    if (!dry) await write(job, { startedAt, finishedAt: new Date(), ok: false, error: e });
    throw e;
  }
}
