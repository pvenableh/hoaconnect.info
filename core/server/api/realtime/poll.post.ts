// POST /api/realtime/poll — what the shared realtime manager asks instead of
// holding a WebSocket to Directus. The browser used to fetch the user's own
// Directus access token (`/api/websocket/token`) to open that socket, and with
// it could call Directus directly, past every app route; it no longer gets one.
//
// Body: { subscriptions: [{ uid, collection, query: { fields, filter, sort } }] }.
// Each query runs with the caller's Directus token on the server, so Directus
// applies exactly the permissions a socket subscription had. Answers
// { results: { [uid]: { rows, complete } | { error } } }; `complete` is false
// when the row cap was reached (see core/shared/realtime/diff.ts).
import { readItems, readNotifications } from "@directus/sdk";
import { POLL_ROW_LIMIT, pollQuery } from "#core/shared/realtime/diff";

const MAX_SUBSCRIPTIONS = 40;
const COLLECTION = /^[a-z][a-z0-9_]*$/;
/** System collections a subscriber may poll. Everything else of Directus's own is refused. */
const SYSTEM = new Set(["directus_notifications"]);

type PollResult = { rows: unknown[]; complete: boolean } | { error: string };

const isExpired = (error: any) =>
  error?.errors?.[0]?.extensions?.code === "TOKEN_EXPIRED" || /token expired/i.test(String(error?.message ?? ""));

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = (await readBody(event)) ?? {};
  const subscriptions = (Array.isArray(body.subscriptions) ? body.subscriptions : []).slice(0, MAX_SUBSCRIPTIONS);

  let directus = await getUserDirectus(event);
  const read = (collection: string, query: Record<string, unknown>) =>
    directus.request(collection === "directus_notifications" ? readNotifications(query as never) : readItems(collection as never, query as never));

  const results: Record<string, PollResult> = {};
  let refreshed = false;
  for (const sub of subscriptions) {
    const uid = typeof sub?.uid === "string" ? sub.uid.slice(0, 200) : "";
    const collection = typeof sub?.collection === "string" ? sub.collection : "";
    if (!uid) continue;
    if (!COLLECTION.test(collection) || (collection.startsWith("directus_") && !SYSTEM.has(collection))) {
      results[uid] = { error: "This collection cannot be watched" };
      continue;
    }
    const query = pollQuery(sub.query);
    try {
      let rows: unknown[];
      try {
        rows = ((await read(collection, query)) as unknown[]) ?? [];
      } catch (error) {
        // An access token that ran out mid-session: refresh once, then retry.
        if (!isExpired(error) || refreshed) throw error;
        refreshed = true;
        directus = await getUserDirectus(event, true);
        rows = ((await read(collection, query)) as unknown[]) ?? [];
      }
      results[uid] = { rows, complete: rows.length < POLL_ROW_LIMIT };
    } catch {
      results[uid] = { error: "Could not read" };
    }
  }
  return { results };
});
