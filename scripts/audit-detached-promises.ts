#!/usr/bin/env npx tsx
/**
 * Detached-promises audit — work started in a server handler and not awaited.
 *
 * Vercel freezes the function the moment the response is sent, so `void notify(…)`, a floating `.catch()` or a bare `waitUntil(` silently
 * never finishes. A RATCHET. Tag an intentional one `allow-detached-promise: <why it wins its race>`.
 *
 * Usage:
 *   pnpm audit:detached-promises           # report (always exits 0)
 *   pnpm audit:detached-promises --list    # every finding
 *   pnpm audit:detached-promises --check   # the gate — exits 1 above the baseline
 */
import { runFileAudit } from "./lib/audit-kit";
import { findDetachedPromises } from "./lib/audit-matchers";

/**
 * ⚠️ NEVER raise this — see scripts/lib/audit-kit.ts.
 *
 * 2026-11-05 (Phase 8) — measured **7**. 7: items.post ×2, change-requests decide/index, documents/publish, ai-actions, context-broker. Each is a real fire-and-forget that Vercel can freeze.
 *
 * 2026-11-05 (Phase 9) — **0**: six awaited (RAG reindex via allSettled, both change-request notifies, the AI comment's announceEvent), the context-broker SWR refresh tagged. A gate at 0 from here.
 */
const BASELINE = 0;

runFileAudit({
  name: "detached-promises",
  script: "audit-detached-promises.ts",
  baseline: BASELINE,
  globs: ["server/**/*.ts", "core/server/**/*.ts"],
  scan: (src) => findDetachedPromises(src),
  
  fix: [
    "`await` it (the response can wait a few ms), or move it onto a cron/queue.",
    "Tag an intentional one `allow-detached-promise: <why>`.",
  ],
});
