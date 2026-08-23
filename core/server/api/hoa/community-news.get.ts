// server/api/hoa/community-news.get.ts
//
// The sent emails a MEMBER is allowed to see, for the resident dashboard and the
// Building feed.
//
// The rule, stated once and enforced here:
//
//     visibility = 'public'   OR   the member is one of its recipients
//
// This has to be a server route rather than a client-side Directus filter. The
// HOA Member policy cannot read `hoa_emails` or `hoa_email_recipients` at all —
// only HOA Admin and Property Manager can — so a member's own token would get
// nothing. More importantly, a filter the CLIENT sends is a filter the client
// can change; the whole point of the rule is that a resident cannot see a notice
// written for another unit. So it runs with the service token, and the caller's
// identity comes from their session, not from a query parameter.
//
// Fails closed at every step: no session, not a member of this org, or any
// lookup error all return an empty list rather than falling back to "show
// everything".
import { readItems } from "@directus/sdk";
import type { HoaOrganization } from "#core/types/directus";

export interface CommunityNewsItem {
  id: string;
  subject: string;
  subtitle: string | null;
  sent_at: string | null;
  urgent: boolean;
  /** Present when the email has a public web view to link to. */
  web_slug: string | null;
  /** True when this one reached the member personally rather than the community. */
  personal: boolean;
}

export default defineEventHandler(async (event): Promise<CommunityNewsItem[]> => {
  const { slug, limit } = getQuery(event);
  if (!slug) throw createError({ statusCode: 400, message: "slug is required" });

  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) return [];

  const directus = getTypedDirectus();

  try {
    const orgs = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          slug: { _eq: slug as string },
          status: {
            _in: ["active", "published"] as string[] as NonNullable<HoaOrganization["status"]>[],
          },
        },
        fields: ["id"],
        limit: 1,
      })
    );
    const orgId = (orgs?.[0] as any)?.id;
    if (!orgId) return [];

    // Membership is the gate. A signed-in user who does not belong to this
    // community gets nothing, public or otherwise.
    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: userId },
          organization: { _eq: orgId },
          status: { _eq: "active" },
        },
        fields: ["id"],
        limit: 1,
      })
    );
    const memberId = (members?.[0] as any)?.id;
    if (!memberId) return [];

    // Which emails reached this member personally.
    const recipientRows = await directus.request(
      readItems("hoa_email_recipients", {
        filter: { member: { _eq: memberId } },
        fields: ["email"],
        limit: -1,
      })
    );
    const personalIds = Array.from(
      new Set(
        (recipientRows || [])
          .map((r: any) => (typeof r.email === "object" ? r.email?.id : r.email))
          .filter(Boolean)
      )
    ) as string[];

    // Explicitly 'public', never merely "not private". A row with no visibility
    // set predates the field and stays out of the feed until someone says
    // otherwise — the failure mode of forgetting is then invisibility, not a
    // leak. New emails carry the column default of 'public', so this costs
    // nothing going forward.
    const audience: any[] = [{ visibility: { _eq: "public" } }];
    if (personalIds.length) audience.push({ id: { _in: personalIds } });

    const n = Math.min(Number(limit) || 20, 50);
    const rows = await directus.request(
      readItems("hoa_emails", {
        filter: {
          _and: [
            { organization: { _eq: orgId } },
            { status: { _eq: "sent" } },
            { _or: audience },
          ],
        } as any,
        fields: ["id", "subject", "subtitle", "sent_at", "urgent", "web_slug"],
        sort: ["-sent_at"],
        limit: n,
      })
    );

    const personal = new Set(personalIds);
    return (rows || []).map((e: any) => ({
      id: String(e.id),
      subject: e.subject,
      subtitle: e.subtitle ?? null,
      sent_at: e.sent_at ?? null,
      urgent: e.urgent === true,
      web_slug: e.web_slug ?? null,
      personal: personal.has(String(e.id)),
    }));
  } catch (error: any) {
    console.error("[community-news] lookup failed:", error?.message || error);
    return [];
  }
});
