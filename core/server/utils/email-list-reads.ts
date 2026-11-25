/**
 * The reads behind GET /api/email/list, as batch specs.
 *
 * The route read a page of the community's emails and then counted them for
 * the pagination: two requests one after another, after the access check's.
 * Directus serves requests in turn (~40ms of CPU each), so both go as one
 * batch, read once the caller has passed the route's access check (a refusal
 * reads nothing, email-read-gates.test.ts).
 */
import type { BatchSpec } from "./directus-graphql";

export type EmailListKey = "el_emails" | "el_total";

export const EMAIL_LIST_FIELDS = [
  "id",
  "status",
  "subject",
  "email_type",
  "date_created",
  "sent_at",
  "scheduled_at",
  "recipient_count",
  "delivered_count",
  "failed_count",
] as const;

/** The community's emails (optionally of one status) as the route filtered them. */
export function emailListFilter(orgId: string, status?: string): Record<string, any> {
  const filter: Record<string, any> = { organization: { _eq: orgId } };
  if (status) filter.status = { _eq: status };
  return filter;
}

/** One page of the emails, newest first, and their count. */
export function emailListSpecs(filter: Record<string, any>, page: number, limit: number): Record<EmailListKey, BatchSpec> {
  return {
    el_emails: {
      collection: "hoa_emails",
      filter,
      fields: EMAIL_LIST_FIELDS,
      sort: ["-date_created"],
      limit,
      offset: (page - 1) * limit,
    },
    el_total: { collection: "hoa_emails", count: "*", filter },
  };
}
