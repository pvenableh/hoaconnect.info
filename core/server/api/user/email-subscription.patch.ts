/**
 * PATCH /api/user/email-subscription — `{ organizationId, communityOptOut }`.
 *
 * The member's own switch for community mail in one org, from the Email section
 * of their household page. The row written is the session user's membership in
 * that org; nothing in the body can name another. Recorded with source `link`
 * (the member's own action, as on the unsubscribe page). 503 until the Phase 3a
 * fields exist, so the switch reverts and says so instead of pretending.
 */

import { readItems } from "@directus/sdk";
import { emailComplianceSchema, optOutOfCommunity, resubscribeToCommunity } from "../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw createError({ statusCode: 401, statusMessage: "Not authenticated" });

  const body = (await readBody(event).catch(() => null)) as { organizationId?: unknown; communityOptOut?: unknown } | null;
  const organizationId = body?.organizationId;
  if (typeof organizationId !== "string" || !organizationId || typeof body?.communityOptOut !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "organizationId and communityOptOut (boolean) are required" });
  }

  const directus = getTypedDirectus();
  let ready = false;
  try {
    ready = (await emailComplianceSchema(directus)).members;
  } catch (e) {
    console.warn("[email-subscription] schema probe failed", (e as Error).message);
  }
  if (!ready) throw createError({ statusCode: 503, statusMessage: "Email preferences aren't available yet." });

  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: organizationId }, status: { _eq: "active" } },
      fields: ["id", "email_community_opt_out"],
      limit: 1,
    } as any)
  )) as unknown as Array<{ id: string; email_community_opt_out?: boolean | null }>;
  const member = rows?.[0];
  if (!member) throw createError({ statusCode: 404, statusMessage: "You're not a member of this community." });

  if (body.communityOptOut) await optOutOfCommunity(directus, member, "link");
  else await resubscribeToCommunity(directus, member);
  return { ok: true, communityOptOut: body.communityOptOut };
});
