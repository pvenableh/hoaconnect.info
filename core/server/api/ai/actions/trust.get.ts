/**
 * GET /api/ai/actions/trust — how much this person has actually approved.
 *
 * Two numbers for the caller in one community: proposals they approved that
 * then executed cleanly, and proposals they rejected. From those,
 * `core/shared/ai/trust.ts` decides whether to suggest the association raise
 * its dial — a *suggestion*, rendered next to the dial, never an action. This
 * endpoint writes nothing.
 *
 * The counts are per PERSON (`approved_by`) while the dial is per ORG, which is
 * the whole point: an act of the assistant is an act of the association, but the
 * history that earns more latitude belongs to whoever has been sitting there
 * saying yes. See the module comment in `core/shared/ai/trust.ts`.
 *
 * Auto-approved runs are invisible here by construction — `decideAiAction`
 * leaves `approved_by` null when the trust dial ran an action rather than a
 * person, so a tier-2 org cannot bootstrap itself to tier 3 on its own
 * automation.
 *
 * Fails soft to zeros: a dial that renders is worth more than an exact count,
 * and zeros produce no nudge, which is the safe direction to fail in.
 */

import { aggregate } from "@directus/sdk";
import { trustNudge } from "#core/shared/ai/trust";
import { getOrgAutonomyTier } from "#core/server/utils/ai-autonomy";

async function countActions(
  directus: any,
  orgId: string,
  userId: string,
  status: string
): Promise<number> {
  const res = (await directus.request(
    // `directus` is untyped here (the helper takes `any`), so the SDK cannot infer
    // the schema and refuses the collection name. The endpoint below passes the
    // typed client; this cast only re-states what that guarantees.
    (aggregate as any)("ai_actions", {
      aggregate: { count: "*" },
      query: {
        filter: {
          _and: [
            { organization: { _eq: orgId } },
            { approved_by: { _eq: userId } },
            { status: { _eq: status } },
          ],
        },
      },
    })
  )) as { count: number }[];
  return Number(res?.[0]?.count ?? 0);
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });

  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const tier = await getOrgAutonomyTier(orgId);

  try {
    const directus = getTypedDirectus();
    const [approved, rejected] = await Promise.all([
      countActions(directus, orgId, userId, "executed"),
      countActions(directus, orgId, userId, "rejected"),
    ]);
    return { approved, rejected, tier, nudge: trustNudge({ approved, rejected }, tier) };
  } catch (err: any) {
    console.warn("[ai/actions/trust] failed:", err?.message);
    const stats = { approved: 0, rejected: 0 };
    return { ...stats, tier, nudge: trustNudge(stats, tier) };
  }
});
