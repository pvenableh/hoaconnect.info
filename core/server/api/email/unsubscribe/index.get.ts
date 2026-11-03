/**
 * GET /api/email/unsubscribe?token=… — what the unsubscribe page shows.
 *
 * No session: the token is the credential, and it only ever reveals the one
 * membership it names — the org's name, a masked address (so someone reading a
 * forwarded email knows whose subscription this is), and where the member
 * stands. Reading never changes anything; the page confirms with a POST.
 *
 * `{ valid: false }` for an unknown token, or before the fields exist (the page
 * explains and offers the portal); 503 when the read fails, so the page can say "try again" rather than
 * "this link is dead".
 */

import { emailComplianceSchema, findMemberByToken } from "../../../utils/email-compliance";
import { ESSENTIAL_MAIL_EXAMPLES } from "#core/shared/email/email-class";
import { buildPreferencesUrl, maskEmail } from "#core/shared/email/unsubscribe";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = typeof query.token === "string" ? query.token : null;

  const directus = getTypedDirectus();
  let member;
  try {
    // Before the Phase 3a fields exist no link can have been minted, so every
    // token names nobody — say that, rather than "try again".
    if (!(await emailComplianceSchema(directus)).members) return { valid: false as const };
    member = await findMemberByToken(directus, token);
  } catch (e) {
    console.warn("[unsubscribe] read failed:", (e as Error)?.message || e);
    throw createError({ statusCode: 503, statusMessage: "We couldn't load your email settings. Try again in a moment." });
  }
  if (!member) return { valid: false as const };

  const appUrl = (useRuntimeConfig().public.appUrl as string) || "";
  return {
    valid: true as const,
    org: { name: member.organization.name, slug: member.organization.slug },
    email: maskEmail(member.email),
    optedOut: member.email_community_opt_out,
    optedOutAt: member.email_community_opt_out_at,
    bounced: member.email_bounced,
    essential: [...ESSENTIAL_MAIL_EXAMPLES],
    preferencesUrl: buildPreferencesUrl(appUrl, member.organization.slug),
  };
});
