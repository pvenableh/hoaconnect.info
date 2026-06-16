// GET /api/ai/credits?orgId=... — the org's AI-credit wallet summary for the
// composer meter + buy-credits UI. Auth-gated and restricted to comms-capable
// actors (the same surface that can spend the wallet).

import { CREDIT_PACKS } from "~~/shared/ai/credits";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  await requireOrgComposeAccess(event, orgId);

  const summary = await getWalletSummary(orgId);
  return {
    ...summary,
    lowBalance: summary.balanceCredits <= 1000, // ≈ one draft left
    aiConfigured: isAiConfigured(),
    packs: CREDIT_PACKS,
  };
});
