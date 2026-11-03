/**
 * POST /api/email/unsubscribe — the page's one tap.
 *
 * Body: `{ token, action: "unsubscribe" | "resubscribe" }`. No session; the
 * token names the membership. Unsubscribe is from community mail only and is
 * recorded with source `link`; resubscribe undoes it (the page's "changed your
 * mind?"). Both are idempotent. 404 for a token that names nobody; 503 when the
 * member can't be read or written.
 */

import { findMemberByToken, optOutOfCommunity, resubscribeToCommunity } from "../../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as { token?: unknown; action?: unknown } | null;
  const action = body?.action === "resubscribe" ? "resubscribe" : body?.action === "unsubscribe" ? "unsubscribe" : null;
  if (!action) throw createError({ statusCode: 400, statusMessage: "action must be unsubscribe or resubscribe" });

  const directus = getTypedDirectus();
  let member;
  try {
    member = await findMemberByToken(directus, body?.token);
  } catch (e) {
    console.warn("[unsubscribe] read failed:", (e as Error)?.message || e);
    throw createError({ statusCode: 503, statusMessage: "We couldn't update your email settings. Try again in a moment." });
  }
  if (!member) throw createError({ statusCode: 404, statusMessage: "This unsubscribe link is no longer valid." });

  try {
    if (action === "unsubscribe") await optOutOfCommunity(directus, member, "link");
    else await resubscribeToCommunity(directus, member);
  } catch (e) {
    console.warn("[unsubscribe] write failed:", (e as Error)?.message || e);
    throw createError({ statusCode: 503, statusMessage: "We couldn't update your email settings. Try again in a moment." });
  }
  return { ok: true, optedOut: action === "unsubscribe" };
});
