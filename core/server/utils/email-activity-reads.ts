/**
 * The reads behind GET /api/email/dashboard-activity, as batch specs.
 *
 * The route read the community's emails of the last seven days, then those
 * emails' recipients and activity by the emails' ids: three requests one
 * after another, after the access check's. Directus serves requests in turn
 * (~40ms of CPU each), so the recipients and activity now name the same
 * emails through a relational filter (the email's community and creation
 * date) and all three go as one batch, read once the caller has passed the
 * route's access check.
 */
import type { BatchSpec } from "./directus-graphql";

export type EmailActivityKey = "ea_emails" | "ea_recipients" | "ea_activity";

/** The route's three reads, for emails of `orgId` created at or after `sinceIso`. */
export function emailActivitySpecs(orgId: string, sinceIso: string): Record<EmailActivityKey, BatchSpec> {
  const emails = { organization: { _eq: orgId }, date_created: { _gte: sinceIso } };
  return {
    ea_emails: {
      collection: "hoa_emails",
      filter: emails,
      fields: ["id", "status", "recipient_count", "delivered_count", "sent_at", "date_created"],
      limit: -1,
    },
    ea_recipients: {
      collection: "hoa_email_recipients",
      filter: { email: emails },
      fields: ["id", "email", "status", "sent_at"],
      limit: -1,
    },
    ea_activity: {
      collection: "hoa_email_activity",
      filter: { email_recipient: { email: emails } },
      fields: ["id", "event", "date_created", "event_timestamp"],
      limit: -1,
    },
  };
}
