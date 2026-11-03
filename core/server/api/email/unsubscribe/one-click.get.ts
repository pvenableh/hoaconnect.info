/**
 * GET /api/email/unsubscribe/one-click — a person, not a mailbox provider.
 *
 * Someone who opens the `List-Unsubscribe` URL in a browser lands on the
 * unsubscribe page with the same token, where one tap confirms. A GET never
 * unsubscribes: link scanners and previewers fetch URLs in mail, and an
 * unsubscribe triggered by a security scanner is one the member never asked for.
 */

import { unsubscribeQuery, isUnsubscribeToken } from "#core/shared/email/unsubscribe";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const token = typeof query.token === "string" && isUnsubscribeToken(query.token) ? query.token : null;
  const emailId = typeof query.e === "string" ? query.e : null;
  return sendRedirect(event, token ? `/unsubscribe?${unsubscribeQuery(token, emailId)}` : "/unsubscribe", 302);
});
