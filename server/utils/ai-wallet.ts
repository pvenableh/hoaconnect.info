// Server-side AI-credit wallet + ledger operations. Thin DB layer over the
// pure math in shared/ai/credits.ts: get-or-create the per-org wallet, meter a
// completion's real token usage into a debit, and credit purchases/grants.
//
// The ai_transactions ledger is the append-only source of truth; the ai_wallets
// row carries the cached pool balances we read on the hot path. Debits spend
// the resetting allowance pool before the permanent purchased pool, and never
// drive a pool negative.
//
// getTypedDirectus (admin client) is auto-imported from server/utils/directus.ts.

import { createItem, readItems, updateItem } from "@directus/sdk";
import { creditsForUsage, marginForAccount, type TokenUsage } from "~~/shared/ai/credits";
import { shouldResetAllowance, nextResetISO } from "~~/shared/ai/allowance";
import type { AiWallet } from "~~/types/directus";

/** Read the org's wallet, creating an empty one on first use. */
export async function getOrCreateWallet(orgId: string): Promise<AiWallet> {
  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("ai_wallets", {
      filter: { organization: { _eq: orgId } },
      sort: ["date_created"],
      limit: 1,
    })
  )) as AiWallet[];
  if (rows?.[0]) return rows[0];

  return (await directus.request(
    createItem("ai_wallets", {
      organization: orgId,
      balance_credits: 0,
      allowance_credits: 0,
      purchased_credits: 0,
      included_credits: 0,
    } as any)
  )) as AiWallet;
}

/** Is this org a free/comped account? Drives at-cost (1×) AI metering. */
async function orgIsFreeAccount(orgId: string): Promise<boolean> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["is_free_account"],
        limit: 1,
      })
    )) as { is_free_account?: boolean | null }[];
    return rows?.[0]?.is_free_account === true;
  } catch {
    return false;
  }
}

/** Resolve the org's monthly AI-credit allowance from its subscription plan. */
async function resolvePlanIncludedCredits(orgId: string): Promise<number> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        // Typed client needs the nested-object field form (no dotted strings).
        fields: [{ subscription_plan: ["included_credits"] }],
        limit: 1,
      })
    )) as { subscription_plan?: { included_credits?: number } | null }[];
    return rows?.[0]?.subscription_plan?.included_credits ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Provision/refresh the plan allowance. On a wallet that's never been funded or
 * whose period has elapsed, the allowance pool is RESET to the plan's monthly
 * `included_credits` (leftover allowance does not roll over), the next reset
 * date is stamped, and a `grant` ledger row records the entitlement. The
 * permanent purchased pool is never touched. Returns the current wallet.
 *
 * NOTE: agency-billed orgs (billing_account set, own subscription_plan often
 * null) get 0 here for now — entitlement up to the agency account is a Phase-2
 * follow-up; those orgs can still buy packs.
 */
export async function ensurePlanAllowance(orgId: string): Promise<AiWallet> {
  const wallet = await getOrCreateWallet(orgId);
  const now = new Date();
  if (!shouldResetAllowance(wallet.period_resets_at ?? null, now)) return wallet;

  const included = await resolvePlanIncludedCredits(orgId);
  const purchased = wallet.purchased_credits ?? 0;
  const newBalance = included + purchased;
  const periodResetsAt = nextResetISO(now);

  const directus = getTypedDirectus();
  await directus.request(
    updateItem("ai_wallets", wallet.id, {
      allowance_credits: included,
      included_credits: included,
      period_resets_at: periodResetsAt,
      balance_credits: newBalance,
    } as any)
  );
  if (included > 0) {
    await directus.request(
      createItem("ai_transactions", {
        organization: orgId,
        type: "grant",
        credits: included,
      } as any)
    );
  }

  return {
    ...wallet,
    allowance_credits: included,
    included_credits: included,
    period_resets_at: periodResetsAt,
    balance_credits: newBalance,
  };
}

export interface WalletSummary {
  walletId: string;
  balanceCredits: number;
  allowanceCredits: number;
  purchasedCredits: number;
  includedCredits: number;
  periodResetsAt: string | null;
}

export async function getWalletSummary(orgId: string): Promise<WalletSummary> {
  // Provision/refresh the plan allowance on read so wallets self-fund on first
  // use and at each period boundary without a separate cron.
  const w = await ensurePlanAllowance(orgId);
  const allowance = w.allowance_credits ?? 0;
  const purchased = w.purchased_credits ?? 0;
  return {
    walletId: w.id,
    balanceCredits: allowance + purchased,
    allowanceCredits: allowance,
    purchasedCredits: purchased,
    includedCredits: w.included_credits ?? 0,
    periodResetsAt: w.period_resets_at ?? null,
  };
}

export type AiFeature = "draft" | "rewrite" | "summarize" | "ask" | "chat";

/**
 * Meter a completion's real token usage: compute credits (cost × margin),
 * debit the wallet allowance-first, and append a debit row carrying the token
 * channels. Pools are clamped at zero so an estimate-vs-actual overrun can't
 * drive the balance negative (deriveBalance() clamps identically, so the
 * ledger and the cached balance stay in agreement). Returns what was charged.
 */
export async function chargeForCompletion(opts: {
  orgId: string;
  userId?: string | null;
  usage: TokenUsage;
  model: string;
  feature: AiFeature;
}): Promise<{ credits: number; balanceCredits: number }> {
  const { orgId, userId, usage, model, feature } = opts;
  // Free/comped ("Hue") accounts meter AI at cost (1× margin); everyone else retail.
  const marginMultiplier = marginForAccount(await orgIsFreeAccount(orgId));
  const credits = creditsForUsage(usage, model, { marginMultiplier });
  const wallet = await getOrCreateWallet(orgId);
  const allowance = wallet.allowance_credits ?? 0;
  const purchased = wallet.purchased_credits ?? 0;

  if (credits <= 0) {
    return { credits: 0, balanceCredits: allowance + purchased };
  }

  const fromAllowance = Math.min(Math.max(0, allowance), credits);
  const fromPurchased = Math.min(Math.max(0, purchased), credits - fromAllowance);
  const newAllowance = allowance - fromAllowance;
  const newPurchased = purchased - fromPurchased;
  const newBalance = newAllowance + newPurchased;

  const directus = getTypedDirectus();
  await directus.request(
    updateItem("ai_wallets", wallet.id, {
      allowance_credits: newAllowance,
      purchased_credits: newPurchased,
      balance_credits: newBalance,
    } as any)
  );
  await directus.request(
    createItem("ai_transactions", {
      organization: orgId,
      type: "debit",
      credits,
      feature,
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      user: userId ?? null,
    } as any)
  );

  return { credits, balanceCredits: newBalance };
}

/**
 * Credit the wallet — a Stripe purchase/refund lands in the permanent purchased
 * pool; a grant (plan allowance / promo) in the resetting allowance pool.
 * Idempotent when a `stripeId` is supplied: if a transaction with that id
 * already exists the call is a no-op (so webhook retries don't double-credit).
 */
export async function creditWallet(opts: {
  orgId: string;
  kind: "purchase" | "grant" | "refund";
  credits: number;
  stripeId?: string | null;
  feature?: AiFeature | null;
}): Promise<{ credited: boolean; balanceCredits: number }> {
  const { orgId, kind, credits, stripeId, feature } = opts;
  const directus = getTypedDirectus();

  if (stripeId) {
    const existing = (await directus.request(
      readItems("ai_transactions", {
        filter: { stripe_id: { _eq: stripeId } },
        fields: ["id"],
        limit: 1,
      })
    )) as { id: string }[];
    if (existing?.length) {
      const summary = await getWalletSummary(orgId);
      return { credited: false, balanceCredits: summary.balanceCredits };
    }
  }

  const wallet = await getOrCreateWallet(orgId);
  const allowance = wallet.allowance_credits ?? 0;
  const purchased = wallet.purchased_credits ?? 0;
  const add = Math.max(0, credits);
  const newAllowance = kind === "grant" ? allowance + add : allowance;
  const newPurchased = kind === "grant" ? purchased : purchased + add;
  const newBalance = newAllowance + newPurchased;

  await directus.request(
    updateItem("ai_wallets", wallet.id, {
      allowance_credits: newAllowance,
      purchased_credits: newPurchased,
      balance_credits: newBalance,
    } as any)
  );
  await directus.request(
    createItem("ai_transactions", {
      organization: orgId,
      type: kind,
      credits: add,
      stripe_id: stripeId ?? null,
      feature: feature ?? null,
    } as any)
  );

  return { credited: true, balanceCredits: newBalance };
}
