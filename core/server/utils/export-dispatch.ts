/**
 * Wake the Data Trust export builder the moment a job is queued.
 *
 * The builder is a GitHub Actions workflow (`.github/workflows/data-export.yml`).
 * It also runs on a schedule, but polling every few minutes to find an empty
 * queue is almost pure waste — a quiet tick still boots a runner, checks out the
 * repo and installs dependencies. So the schedule is the SAFETY NET (hourly:
 * purges, stale-job release, anything a dispatch missed) and this is the fast
 * path, which takes an export from "up to an hour" to "seconds".
 *
 * Deliberately best-effort and non-fatal. Every failure mode here — no token, a
 * revoked token, GitHub down, a network blip — costs latency and nothing else,
 * because the hourly run still builds the row. So this never throws and never
 * blocks the caller's response: a queue request that succeeded must not report
 * failure because a notification did.
 *
 * Setup: `GITHUB_DISPATCH_TOKEN` must be a fine-grained PAT scoped to this repo
 * with **Contents: Read and write** (what `POST /repos/{o}/{r}/dispatches`
 * requires). Unset it and the system degrades to the hourly schedule — which is
 * exactly how it behaved before this existed.
 */

const DEFAULT_REPO = "pvenableh/hoaconnect.info";
const EVENT_TYPE = "data-export-queued";

export async function requestExportBuild(exportId: string): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    // Not a fault. Say so precisely, so nobody reads this as the dispatch
    // breaking when it was never configured.
    console.info(
      `[export-dispatch] no GITHUB_DISPATCH_TOKEN — export ${exportId} will be built by the hourly run`
    );
    return;
  }

  const repo = process.env.GITHUB_DISPATCH_REPO || DEFAULT_REPO;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event_type: EVENT_TYPE,
        // Traceability only. The workflow deliberately does NOT build this id
        // specifically — it runs the queue normally, so the dispatch can never
        // disagree with what is actually waiting.
        client_payload: { exportId },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(
        `[export-dispatch] GitHub returned ${res.status} for export ${exportId} — falling back to the hourly run. ${detail.slice(0, 200)}`
      );
      return;
    }

    console.info(`[export-dispatch] build requested for export ${exportId}`);
  } catch (err) {
    console.warn(
      `[export-dispatch] dispatch failed for export ${exportId} — falling back to the hourly run:`,
      (err as Error)?.message || err
    );
  }
}
