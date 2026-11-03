/**
 * GET /api/hoa/member-email-status?organizationId=…
 *
 * For the Members page: every member of the org whose mail is held back — a
 * bounced address, or an opt-out from community mail — with the reason, so the
 * page can draw a chip and offer Clear. Members in good standing are not listed.
 * Org admins only; the read is filtered to the org named, which the admin check
 * has just authorized.
 *
 * A separate route rather than more fields on the Members page's own read, so
 * that page keeps working before the Phase 3a fields exist: this answers
 * `available: false` until then.
 */

import { readItems } from "@directus/sdk";
import { emailComplianceSchema, MEMBER_EMAIL_STATE_FIELDS } from "../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  const organizationId = getQuery(event).organizationId;
  if (typeof organizationId !== "string" || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: "organizationId is required" });
  }
  await requireAdminAccess(event, organizationId);

  const directus = getTypedDirectus();
  try {
    if (!(await emailComplianceSchema(directus)).members) return { available: false as const, members: [] };
  } catch (e) {
    console.warn("[member-email-status] schema probe failed", (e as Error).message);
    return { available: false as const, members: [] };
  }

  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: {
        organization: { _eq: organizationId },
        _or: [{ email_bounced: { _eq: true } }, { email_community_opt_out: { _eq: true } }],
      },
      fields: ["id", ...MEMBER_EMAIL_STATE_FIELDS],
      limit: -1,
    } as any)
  )) as any[];

  return {
    available: true as const,
    members: (rows || []).map((r) => ({
      id: String(r.id),
      bounced: r.email_bounced === true,
      bouncedAt: r.email_bounced_at ?? null,
      bouncedReason: r.email_bounced_reason ?? null,
      optedOut: r.email_community_opt_out === true,
      optedOutAt: r.email_community_opt_out_at ?? null,
      optedOutSource: r.email_community_opt_out_source ?? null,
    })),
  };
});
