// HOA Connect's scheduled jobs, as the operator console's health page knows
// them (docs/plan-operator-console.md §5, Phase 4).
//
// Two systems run them (docs/go-live-checklist.md §3): Vercel Cron calls four
// routes; GitHub Actions runs three worker scripts that need the repo. Each
// records a heartbeat (`ops_job_heartbeats`, one row per job) when it runs, so
// "when did it last run" has an answer even when a run found nothing to do.

export type OpsJobKey =
  | "ai-notices"
  | "ai-actions-expire"
  | "email-continue-sends"
  | "reminders"
  | "notification-digest"
  | "data-export"
  | "billing-worker";

export interface OpsJob {
  key: OpsJobKey;
  label: string;
  runner: "vercel" | "github";
  /** Cron expression, UTC. */
  schedule: string;
  /** How often it should run, for "overdue". */
  everyMinutes: number;
  /** The route Vercel calls, or the workflow GitHub runs. */
  source: string;
}

export const OPS_JOBS: readonly OpsJob[] = [
  { key: "email-continue-sends", label: "Email send queue", runner: "vercel", schedule: "* * * * *", everyMinutes: 1, source: "/api/email/cron/continue-sends" },
  { key: "reminders", label: "Reminders", runner: "vercel", schedule: "5 * * * *", everyMinutes: 60, source: "/api/reminders/run" },
  { key: "ai-notices", label: "AI notices sweep", runner: "vercel", schedule: "10 7 * * *", everyMinutes: 1440, source: "/api/ai/notices/check" },
  { key: "ai-actions-expire", label: "Stale AI proposals", runner: "vercel", schedule: "40 7 * * 0", everyMinutes: 10080, source: "/api/ai/actions/expire-stale" },
  { key: "notification-digest", label: "Notification digests", runner: "github", schedule: "7 * * * *", everyMinutes: 60, source: ".github/workflows/notification-digest.yml" },
  { key: "data-export", label: "Data exports", runner: "github", schedule: "23 * * * *", everyMinutes: 60, source: ".github/workflows/data-export.yml" },
  { key: "billing-worker", label: "Dues billing", runner: "github", schedule: "15 10 * * *", everyMinutes: 1440, source: ".github/workflows/billing-worker.yml" },
];

export const OPS_JOB_KEYS = OPS_JOBS.map((j) => j.key);

export function isOpsJobKey(v: unknown): v is OpsJobKey {
  return typeof v === "string" && (OPS_JOB_KEYS as string[]).includes(v);
}

/**
 * Overdue once two runs have been missed, plus slack for a slow runner
 * (GitHub's scheduled workflows start late by minutes as a matter of course).
 */
export function jobOverdue(job: Pick<OpsJob, "everyMinutes" | "runner">, lastAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastAt) return true;
  const slackMinutes = job.runner === "github" ? 30 : 5;
  const allowedMs = (job.everyMinutes * 2 + slackMinutes) * 60_000;
  return now.getTime() - new Date(lastAt).getTime() > allowedMs;
}

export interface JobHeartbeatRow {
  /** The job key. */
  id: OpsJobKey;
  last_started_at: string;
  last_finished_at: string | null;
  last_status: "ok" | "error";
  last_error: string | null;
  last_summary: Record<string, unknown> | null;
  last_via: string | null;
  last_ok_at: string | null;
}

/**
 * The row to write for one run. Pure, so the Nitro writer and the worker
 * scripts write the same shape. `last_ok_at` keeps the last success across a
 * failing run (null here means "leave it as it is").
 */
export function heartbeatRow(
  job: OpsJobKey,
  run: { startedAt: Date; finishedAt: Date; ok: boolean; error?: unknown; summary?: Record<string, unknown> | null; via?: string | null }
): JobHeartbeatRow {
  const finished = run.finishedAt.toISOString();
  const error = run.ok ? null : String((run.error as { message?: string })?.message ?? run.error ?? "failed").slice(0, 500);
  return {
    id: job,
    last_started_at: run.startedAt.toISOString(),
    last_finished_at: finished,
    last_status: run.ok ? "ok" : "error",
    last_error: error,
    last_summary: run.summary ?? null,
    last_via: run.via ?? null,
    last_ok_at: run.ok ? finished : null,
  };
}
