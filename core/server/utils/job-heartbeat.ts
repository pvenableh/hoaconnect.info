// A scheduled job says it ran: one `ops_job_heartbeats` row per job, upserted
// (docs/plan-operator-console.md §5, Phase 4). Read by GET /api/ops/health.
//
// Never throws and never slows a job down for long: a heartbeat that can't be
// written costs the health page one answer, not the job its run. Before the
// collection exists (`pnpm run create:ops-job-heartbeats`) every write would
// fail, so after one failure the writer rests for ten minutes rather than
// failing twice a minute on the email queue's tick.
import { createItem, updateItem } from "@directus/sdk";
import type { H3Event } from "h3";
import { heartbeatRow, type OpsJobKey } from "#core/shared/ops/jobs";
import { requireCronOrAppAdmin } from "./cron-auth";

const REST_MS = 10 * 60_000;
let restingUntil = 0;

/** Tests only. */
export function _resetJobHeartbeat(): void {
  restingUntil = 0;
}

/**
 * Upsert through any client: update the job's row, create it if there is none.
 *
 * Directus does not refuse an admin token's update of a missing item: it
 * answers 204, which the SDK returns as null. So "no row" is an empty answer,
 * not a throw (a throw still falls through to create, for other clients).
 */
export async function upsertHeartbeat(
  write: { update: (id: string, data: object) => Promise<unknown>; create: (data: object) => Promise<unknown> },
  row: ReturnType<typeof heartbeatRow>
): Promise<void> {
  const { id, last_ok_at, ...rest } = row;
  const data = last_ok_at ? { ...rest, last_ok_at } : rest;
  const updated = await write.update(id, data).catch(() => null);
  if (!updated) await write.create({ id, ...data });
}

export async function recordJobRun(
  job: OpsJobKey,
  run: { startedAt: Date; ok: boolean; error?: unknown; summary?: Record<string, unknown> | null; via?: string | null }
): Promise<void> {
  if (Date.now() < restingUntil) return;
  try {
    const directus = getTypedDirectus() as any;
    await upsertHeartbeat(
      {
        update: (id, data) => directus.request((updateItem as any)("ops_job_heartbeats", id, data)),
        create: (data) => directus.request((createItem as any)("ops_job_heartbeats", data)),
      },
      heartbeatRow(job, { ...run, finishedAt: new Date() })
    );
  } catch (e: any) {
    restingUntil = Date.now() + REST_MS;
    console.warn(`[job-heartbeat] ${job} not recorded:`, e?.message ?? e);
  }
}

/**
 * Run a job's work and record it. The job's own result and errors pass
 * through untouched; only a dry run (nothing written) goes unrecorded.
 */
export async function withJobHeartbeat<T>(
  job: OpsJobKey,
  opts: { via?: string | null; dry?: boolean; summarize?: (result: T) => Record<string, unknown> | null },
  work: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await work();
    if (!opts.dry) await recordJobRun(job, { startedAt, ok: true, via: opts.via, summary: opts.summarize?.(result) ?? null });
    return result;
  } catch (e) {
    if (!opts.dry) await recordJobRun(job, { startedAt, ok: false, error: e, via: opts.via });
    throw e;
  }
}

/** A dry run asked for in the body (`{ dryRun: true }`), as the AI crons take it. */
export const dryRunInBody = async (event: H3Event) =>
  ((await readBody(event).catch(() => null)) as { dryRun?: unknown } | null)?.dryRun === true;

/**
 * A cron route that records its runs. The caller is checked first (cron
 * secret or App Admin), so a stray request never writes a heartbeat, and a
 * dry run isn't recorded. The handler checks the caller again as before; the
 * second check is a header compare or a session read.
 */
export function cronJobHandler<T>(
  job: OpsJobKey,
  opts: {
    isDry?: (event: H3Event) => boolean | Promise<boolean>;
    summarize?: (result: T) => Record<string, unknown> | null;
    /**
     * For a route other callers may also use: who counts as a run (e.g. the
     * cron secret only). Null runs the handler unrecorded, with its own checks.
     * Default: the cron secret or an App Admin, refused otherwise.
     */
    recordWhen?: (event: H3Event) => string | null | Promise<string | null>;
  },
  handler: (event: H3Event) => Promise<T>
) {
  return defineEventHandler(async (event) => {
    const via = opts.recordWhen ? await opts.recordWhen(event) : await requireCronOrAppAdmin(event);
    if (!via) return handler(event);
    const dry = (await opts.isDry?.(event)) ?? false;
    return withJobHeartbeat(job, { via, dry, summarize: opts.summarize }, () => handler(event));
  });
}
