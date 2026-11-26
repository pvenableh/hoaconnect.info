/**
 * GET /api/org/communications/activity?orgId=&page= — the community's email
 * activity for the Activity page (docs/spec-delegation.md): the counts by
 * event, one page of events (newest first, with the member and the email
 * each concerns), and the sent emails for the filter. All in one request
 * with the caller's access snapshot.
 *
 * Who: admin, a property manager with the `communications` grant, or a helper
 * or committee holding it.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";
import type { BatchSpec } from "#core/server/utils/directus-graphql";

const PAGE_SIZE = 100;
const EVENTS = ["delivered", "open", "click", "bounce"] as const;

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const orgId = requireOrgId(q.orgId);
  const page = Math.max(0, Math.floor(Number(q.page) || 0));
  const org = { organization: { _eq: orgId } };

  const count = (filter: Record<string, unknown>): BatchSpec => ({ collection: "hoa_email_activity", count: "*", filter });
  const specs: Record<string, BatchSpec> = {
    activity: {
      collection: "hoa_email_activity",
      filter: org,
      fields: [
        "id", "event", "email", "clicked_url", "reason", "date_created",
        "member.id", "member.first_name", "member.last_name", "member.email",
        "email_recipient.id", "email_recipient.recipient_email", "email_recipient.email.id", "email_recipient.email.subject",
      ],
      sort: ["-date_created"],
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    ...(page === 0
      ? {
          emails: {
            collection: "hoa_emails",
            filter: { status: { _eq: "sent" }, ...org },
            fields: ["id", "subject", "status", "sent_at"],
            sort: ["-sent_at"],
            limit: 50,
          },
          total: count(org),
          ...Object.fromEntries(EVENTS.map((e) => [e, count({ ...org, event: { _eq: e } })])),
        }
      : {}),
  };

  const { rows } = await readForArea(event, orgId, "communications", specs);
  const n = (k: string) => Number(rows[k]?.[0]?.count ?? 0) || 0;
  return {
    activities: rows.activity,
    hasMore: (rows.activity?.length ?? 0) === PAGE_SIZE,
    pageSize: PAGE_SIZE,
    ...(page === 0
      ? { emails: rows.emails, counts: { total: n("total"), delivered: n("delivered"), open: n("open"), click: n("click"), bounce: n("bounce") } }
      : {}),
  };
});
