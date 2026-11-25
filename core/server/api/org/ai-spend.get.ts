// GET /api/org/ai-spend?orgId=...&days=30
//
// Admins-only view of AI credit spend for the org: the current wallet balance
// plus per-user debit totals over a window, derived from the append-only
// ai_transactions ledger. For oversight, not caps — there are no per-user
// limits at launch. Property managers and members get 403.
//
// getTypedDirectus + checkAdminAccess are auto-imported from server/utils.

import { readItems } from "@directus/sdk";
import { shouldResetAllowance } from "#core/shared/ai/allowance";
import { walletSummaryOf } from "#core/server/utils/ai-wallet";
import { aiSpendSpecs, spendTotals, type DebitRow } from "#core/server/utils/ai-spend";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // The wallet, the window's debit rows and the caller's memberships as ONE
  // request (ai-spend.ts); the admin check then answers from that standing and
  // refuses before any row is used. A failed batch reads one by one as before.
  const batched = await batchWithAccessSnapshot(event, orgId, aiSpendSpecs(orgId, since), "base").catch(() => null);

  // Admins only — spend visibility is an oversight surface.
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({ statusCode: 403, message: "Not authorized to view AI spend" });
  }

  // The wallet summary. A wallet that is missing or due its allowance reset
  // goes through getWalletSummary, which creates or refreshes it on read.
  const read = batched?.sp_wallet[0];
  const wallet =
    read && !shouldResetAllowance(read.period_resets_at ?? null, new Date()) ? walletSummaryOf(read) : await getWalletSummary(orgId);

  // Debit rows in the window, with the acting user resolved. Declared as a
  // loose record so the date range operator typechecks (mirrors activity.get).
  const filter: Record<string, any> = {
    organization: { _eq: orgId },
    type: { _eq: "debit" },
    date_created: { _gte: since },
  };

  const rows = (batched?.sp_debits ??
    (await getTypedDirectus().request(
      readItems("ai_transactions", {
        filter,
        fields: [
          "credits",
          "feature",
          "model",
          "date_created",
          { user: ["id", "first_name", "last_name", "email"] },
        ],
        sort: ["-date_created"],
        limit: -1,
      })
    ))) as DebitRow[];

  return {
    scope: "all" as const,
    days,
    wallet,
    ...spendTotals(rows),
  };
});
