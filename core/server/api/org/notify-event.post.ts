/**
 * POST /api/org/notify-event
 *
 * The server moment that client-written rows don't otherwise have.
 *
 * Announcements, meetings, mentions and comments are created straight from the
 * browser through the Directus proxy. That works, and it is why several of the
 * ten collections the bell aggregates never produced a notification: there was
 * no server-side hook where a fan-out could hang. This route is that hook. The
 * client says only "hoa_meetings/<id> was updated"; everything a member ends up
 * reading — the copy, the category, the recipients — is derived server-side from
 * the row we re-read for ourselves (`core/shared/notifications/events.ts`).
 *
 * That asymmetry is the whole security model. A caller cannot choose who hears
 * about something, what it says, or which community it is branded as. What they
 * CAN do is point at a row, so the two checks here are:
 *
 *   1. they are signed in, and
 *   2. they are an active member of the org that owns the row.
 *
 * The org is taken from the row, not from the body, so (2) cannot be satisfied
 * by naming a community the caller belongs to while pointing at a row from one
 * they don't — `announceEvent` compares the two and refuses on mismatch.
 *
 * Fire-and-forget from the client: every "nothing to say" outcome (a draft
 * comment, an unpublished meeting, a republish that already fired) returns 200
 * with `ok:false` and a reason rather than an error, because those are the
 * normal cases and a red console line for each would train people to ignore it.
 *
 * Body: { collection, action: "create"|"update", itemId }
 */

import { isNotifiableCollection } from "#core/shared/notifications/events";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const collection = String(body?.collection || "").trim();
  const itemId = String(body?.itemId || "").trim();
  const action = body?.action === "update" ? "update" : "create";

  if (!collection || !itemId) {
    throw createError({ statusCode: 400, statusMessage: "collection and itemId are required" });
  }
  if (!isNotifiableCollection(collection)) {
    // An explicit allow-list rather than "whatever the resolver understands":
    // a new collection becomes announceable when someone writes its plan, not
    // when someone guesses its name.
    throw createError({ statusCode: 400, statusMessage: "collection is not notifiable" });
  }

  return await announceEvent({
    collection,
    action,
    itemId,
    // Called with the org read off the ROW, so membership is always checked
    // against the community that actually owns the item.
    authorize: async (orgId) => (await checkMembership(event, orgId)).isMember,
    actorId: (session.user as { id?: string } | undefined)?.id ?? null,
    origin: await safeRequestOrigin(event),
  });
});
