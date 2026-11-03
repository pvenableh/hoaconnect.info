/**
 * POST /api/email/unsubscribe/one-click?token=…&e=… — RFC 8058 one-click.
 *
 * The `List-Unsubscribe` target on every community send. Gmail, Yahoo and the
 * rest POST `List-Unsubscribe=One-Click` here with no session and no cookies,
 * so the token is the only credential, and what they expect back is a 200 with
 * nothing in it:
 *
 *   · no auth — the token names exactly one member of one org;
 *   · idempotent — a second POST (providers retry) finds them already out and
 *     writes nothing;
 *   · 200 with an empty body for an unknown or malformed token too: telling a
 *     caller which tokens exist would be an oracle, and there is nothing a
 *     mailbox provider can do with a 404;
 *   · 503 when the member can't be read or written, so the provider retries
 *     instead of being told it worked.
 *
 * The opt-out is from COMMUNITY mail only; essential mail (dues, meetings,
 * governance) still arrives, and the footer of that mail says so.
 */

import { findMemberByToken, optOutOfCommunity } from "../../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = typeof query.token === "string" ? query.token : null;
  const directus = getTypedDirectus();

  let member;
  try {
    member = await findMemberByToken(directus, token);
  } catch (e) {
    console.warn("[unsubscribe/one-click] read failed:", (e as Error)?.message || e);
    setResponseStatus(event, 503);
    return "";
  }

  if (member) {
    try {
      await optOutOfCommunity(directus, member, "one_click");
    } catch (e) {
      console.warn("[unsubscribe/one-click] write failed:", (e as Error)?.message || e);
      setResponseStatus(event, 503);
      return "";
    }
  }

  setResponseStatus(event, 200);
  setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return "";
});
