/**
 * GET /api/user/email-subscription?organizationId=…
 *
 * The signed-in member's email standing in ONE org: whether they get community
 * mail, and whether their address has bounced. Read off their own `hoa_members`
 * row — the filter is the session's user AND the org, so a caller can name any
 * org they like and only ever see themselves in it.
 *
 * Degrades like /api/user/app-prefs: `available: false` until the Phase 3a
 * fields exist (scripts/add-email-compliance-fields.ts). `member: false` when
 * the user has no active membership in that org (an app admin looking around).
 */

import { readItems } from "@directus/sdk";
import { emailComplianceSchema, MEMBER_EMAIL_STATE_FIELDS } from "../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw createError({ statusCode: 401, statusMessage: "Not authenticated" });

  const organizationId = getQuery(event).organizationId;
  if (typeof organizationId !== "string" || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: "organizationId is required" });
  }

  const directus = getTypedDirectus();
  try {
    const schema = await emailComplianceSchema(directus);
    if (!schema.members) return { available: false as const };
  } catch (e) {
    console.warn("[email-subscription] schema probe failed", (e as Error).message);
    return { available: false as const };
  }

  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: organizationId }, status: { _eq: "active" } },
      fields: ["id", "email", ...MEMBER_EMAIL_STATE_FIELDS],
      limit: 1,
    } as any)
  )) as any[];
  const m = rows?.[0];
  if (!m) return { available: true as const, member: false as const };

  return {
    available: true as const,
    member: true as const,
    email: m.email ?? null,
    communityOptOut: m.email_community_opt_out === true,
    communityOptOutAt: m.email_community_opt_out_at ?? null,
    communityOptOutSource: m.email_community_opt_out_source ?? null,
    bounced: m.email_bounced === true,
    bouncedAt: m.email_bounced_at ?? null,
    bouncedReason: m.email_bounced_reason ?? null,
  };
});
