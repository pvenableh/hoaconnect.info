/**
 * Where retired surfaces send people now — pure, so the decision is stated once
 * and can be asserted in a test rather than rediscovered per call site.
 *
 * The standalone Announcements page was retired in Phase 9, and `/announcements`
 * is now a bare redirect to the org home. That left every link to it — the bell
 * dropdown, the member portal, the notification resolver, the feed cards —
 * bouncing users back where they started. The content itself did not go away:
 *
 *  - PUBLISHED ANNOUNCEMENTS are the first source `useActivityFeed` reads, so
 *    they render as Building-feed cards with the full reaction + comment rail.
 *    Anything that means "show me community news" belongs there. The Building
 *    tab lives at the org root behind `?tab=building` on BOTH dashboards
 *    (admin and member), so this one path is role-neutral.
 *
 *  - SENT EMAILS are NOT in that feed — `useActivityFeed` never reads
 *    `hoa_emails`. Sending an email notification to the feed would land the
 *    reader on a list that provably doesn't hold the thing they clicked, so an
 *    email deep-links to its own web view instead. `/api/email/resolve` accepts
 *    the raw id as well as the friendly `web_slug`, and the notification always
 *    carries `metadata.emailId`, so the id form always resolves.
 *
 * Both are ORG-RELATIVE — wrap them in `buildOrgPath()` before navigating.
 */

/**
 * The Building feed: the live home of published announcements.
 *
 * Note the leading `/` — this is the org ROOT with a tab query, and
 * `buildOrgPath` collapses `/?…` onto the slug rather than emitting `/slug/?…`.
 */
export const BUILDING_FEED_PATH = "/?tab=building";

/**
 * The standalone web view for one sent email, or null when we have no id to
 * point at. Callers treat null as "no destination" and drop the CTA rather than
 * inventing a plausible-looking one — the notification sheet already tells the
 * reader the message is in their inbox.
 */
export function emailWebViewPath(emailId: string | null | undefined): string | null {
  return emailId ? `/announcements/email/${emailId}` : null;
}
