/**
 * GET /api/org/ai-spend's reads in one request.
 *
 * The route checked the caller's standing, read (or provisioned) the wallet,
 * then read the window's debit rows: three requests in three rounds.
 * `aiSpendSpecs` names the wallet read (walletSpec, as /api/ai/credits reads
 * it) and the debit rows (the same filter, fields and sort) as one batch,
 * which rides with the caller's memberships (batchWithAccessSnapshot). Keys
 * are prefixed `sp_` so they can share a batch.
 */
import type { BatchSpec } from "./directus-graphql";
import { walletSpec } from "./ai-wallet";

export type AiSpendKey = "sp_wallet" | "sp_debits";

/** The debit rows' fields: the amount, what it was for, and the acting user. */
const DEBIT_FIELDS = ["credits", "feature", "model", "date_created", "user.id", "user.first_name", "user.last_name", "user.email"];

/** The wallet and the debit rows since `since`, newest first. */
export function aiSpendSpecs(orgId: string, since: string): Record<AiSpendKey, BatchSpec> {
  return {
    sp_wallet: walletSpec(orgId),
    sp_debits: {
      collection: "ai_transactions",
      filter: { organization: { _eq: orgId }, type: { _eq: "debit" }, date_created: { _gte: since } },
      fields: DEBIT_FIELDS,
      sort: ["-date_created"],
      limit: -1,
    },
  };
}

export interface SpendUser {
  userId: string | null;
  name: string;
  email: string | null;
  credits: number;
  calls: number;
}

export interface DebitRow {
  credits?: number | string | null;
  feature?: string | null;
  model?: string | null;
  user?: { id?: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
}

/** The debit rows as totals, per feature and per user (most credits first). Pure. */
export function spendTotals(rows: readonly DebitRow[]): {
  totals: { credits: number; calls: number };
  byFeature: Record<string, number>;
  users: SpendUser[];
} {
  const byUser = new Map<string, SpendUser>();
  const byFeature: Record<string, number> = {};
  let totalCredits = 0;
  let totalCalls = 0;

  for (const r of rows) {
    const credits = Math.max(0, Number(r.credits) || 0);
    totalCredits += credits;
    totalCalls += 1;

    const feature = r.feature || "other";
    byFeature[feature] = (byFeature[feature] || 0) + credits;

    const u = r.user;
    const key = u?.id || "unknown";
    const existing = byUser.get(key);
    if (existing) {
      existing.credits += credits;
      existing.calls += 1;
    } else {
      const name =
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.email || (u?.id ? "Unknown user" : "System");
      byUser.set(key, { userId: u?.id ?? null, name, email: u?.email ?? null, credits, calls: 1 });
    }
  }

  const users = [...byUser.values()].sort((a, b) => b.credits - a.credits);
  return { totals: { credits: totalCredits, calls: totalCalls }, byFeature, users };
}
