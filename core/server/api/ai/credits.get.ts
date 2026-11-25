// GET /api/ai/credits?orgId=... — the org's AI-credit wallet summary for the
// composer meter + buy-credits UI. Auth-gated and restricted to comms-capable
// actors (the same surface that can spend the wallet).

import { CREDIT_PACKS } from "#core/shared/ai/credits";
import { shouldResetAllowance } from "#core/shared/ai/allowance";
import { walletSpec, walletSummaryOf } from "#core/server/utils/ai-wallet";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // The wallet and the caller's standing as ONE request (ai-wallet.ts); the
  // gate then answers from the cached standing and refuses before the wallet
  // is used. A wallet that is missing or due its allowance reset, or a failed
  // batch, goes through getWalletSummary as before, which creates or refreshes it.
  const batched = await batchWithAccessSnapshot(event, orgId, { cr_wallet: walletSpec(orgId) }).catch(() => null);
  await requireOrgComposeAccess(event, orgId);

  const wallet = batched?.cr_wallet[0];
  const summary =
    wallet && !shouldResetAllowance(wallet.period_resets_at ?? null, new Date())
      ? walletSummaryOf(wallet)
      : await getWalletSummary(orgId);
  return {
    ...summary,
    lowBalance: summary.balanceCredits <= 1000, // ≈ one draft left
    aiConfigured: isAiConfigured(),
    ragConfigured: isRagConfigured(), // drives the "Documents" awareness source
    packs: CREDIT_PACKS,
  };
});
