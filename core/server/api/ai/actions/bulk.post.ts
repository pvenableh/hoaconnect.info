/**
 * POST /api/ai/actions/bulk — approve or reject several pending proposals in one
 * gesture, when the review queue has filled up with small internal work.
 *
 * ── The one thing this endpoint must not become ─────────────────────────────
 * A second approval lane. Every id here goes through `decideAiAction()` — the
 * same function `[id]/approve.post.ts` calls, one row at a time — so the pending
 * guard, the org check, the executor dispatch, the failure marking and the
 * community ledger entry are all the *same code*. Nothing about "several at
 * once" changes what an approval means or what it is allowed to do.
 *
 * That matters most for outbound actions. Approving a `send_email` here is a
 * human saying yes, exactly as it is on the card, and it is attributed to them.
 * What bulk cannot do — because it does not implement approval, it delegates it
 * — is auto-approve. `shouldAutoApprove()` lives in `proposeAction()` and is
 * never consulted on this path; there is no tier, no trust dial, and no batch
 * size at which an unreviewed outbound proposal executes from here.
 *
 * Body: { orgId, ids: string[], decision: 'approve' | 'reject' }
 *
 * Per-row results, never a whole-batch failure: one row that is already
 * resolved, belongs to another community, or whose executor throws is reported
 * as that row's outcome while the rest proceed. A batch that half-worked must
 * say so precisely — reporting a 500 for twelve rows when one failed is how
 * people re-run things and double-execute them.
 */

import { decideAiAction } from "#core/server/utils/ai-actions";

/** Enough for a full review queue, small enough that the request stays bounded. */
const MAX_BATCH = 200;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    ids?: unknown;
    decision?: string;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw createError({ statusCode: 400, message: "decision must be 'approve' or 'reject'" });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw createError({ statusCode: 400, message: "ids must be a non-empty array" });
  }

  // De-dupe: a repeated id would 409 against itself on the second pass and read
  // as a failure the caller cannot explain.
  const ids = Array.from(new Set(body.ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
  if (ids.length === 0) {
    throw createError({ statusCode: 400, message: "ids must contain at least one valid id" });
  }
  if (ids.length > MAX_BATCH) {
    throw createError({ statusCode: 400, message: `Too many ids (max ${MAX_BATCH} per batch)` });
  }

  await requireOrgComposeAccess(event, orgId);

  const results: Array<{ id: string; status: string; result?: any; error?: string }> = [];
  let approved = 0;
  let rejected = 0;
  let failed = 0;

  // Sequential on purpose: the executors write to Directus, and a predictable
  // order makes a partially-applied batch readable afterwards.
  for (const id of ids) {
    try {
      const res = await decideAiAction({
        id,
        decision,
        userId,
        orgId,
        // Identical to the single-row routes: a row from another community is a
        // 404, not a 403 — the caller learns nothing about what exists elsewhere.
        verifyOrg: (rowOrg: string) => {
          if (rowOrg !== orgId) throw createError({ statusCode: 404, message: "Action not found" });
        },
      });
      results.push({ id, status: res.status, result: res.result });
      if (res.status === "executed") approved++;
      else rejected++;
    } catch (err: any) {
      failed++;
      results.push({ id, status: "failed", error: err?.message || "Failed" });
    }
  }

  return { results, approved, rejected, failed };
});
