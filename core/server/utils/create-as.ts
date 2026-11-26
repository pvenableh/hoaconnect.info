/**
 * Create a row with the app's token, authored as the person who acted.
 *
 * Every hoa_* collection's `user_created` carries Directus's `user-created`
 * special, so a create made with the app's token stores the token's own user,
 * whatever the payload says. That author is read: who a notification names and
 * leaves out (core/shared/notifications/events.ts), who hears that a send
 * paused (email-send-health.ts), who asked for a milestone's approval. So the
 * author is set in a second write, which Directus keeps.
 *
 * The second write is best-effort: the row exists and the caller's work is
 * done, so a failure is logged, never thrown. With no user (a system write)
 * there is no second write.
 */
import type { H3Event } from "h3";
import * as sdk from "@directus/sdk";

type Client = { request: (op: any) => Promise<any> };

// The collection is a runtime string, so the builders are used untyped, as in email-resend-draft.ts.
// Looked up at call time, so a test's partial mock of the SDK still loads this file.
const createItem = (...a: unknown[]) => (sdk as any).createItem(...a);
const createItems = (...a: unknown[]) => (sdk as any).createItems(...a);
const updateItem = (...a: unknown[]) => (sdk as any).updateItem(...a);
const updateItems = (...a: unknown[]) => (sdk as any).updateItems(...a);
type Row = Record<string, unknown>;

interface Options {
  /** The read-back query (fields), as createItem takes it; also used for the author write. */
  query?: Record<string, unknown>;
  /** The Directus client; the app's by default. */
  client?: Client;
}

const withoutAuthor = ({ user_created: _ignored, ...rest }: Row) => rest;

/** One row, authored as `userId`. Returns the row as read back after the author write. */
export async function createAs<T = any>(collection: string, row: Row, userId: string | null | undefined, opts: Options = {}): Promise<T> {
  const directus = opts.client ?? getTypedDirectus();
  const created = await directus.request(createItem(collection, withoutAuthor(row), opts.query));
  const id = (created as { id?: string | number } | null)?.id;
  if (!userId || id == null) return created as T;
  try {
    const authored = await directus.request(updateItem(collection, id, { user_created: userId }, opts.query));
    // The created row, with what the author write read back laid over it.
    return (authored && typeof authored === "object" ? { ...(created as object), ...authored } : created) as T;
  } catch (e) {
    console.warn(`[create-as] ${collection}/${id}: author not set:`, e);
    return created as T;
  }
}

/** Several rows of one collection, authored as `userId`, in one create and one author write. */
export async function createManyAs<T = any>(collection: string, rows: Row[], userId: string | null | undefined, opts: Options = {}): Promise<T[]> {
  if (!rows.length) return [];
  const directus = opts.client ?? getTypedDirectus();
  const created = ((await directus.request(createItems(collection, rows.map(withoutAuthor), opts.query))) ?? []) as T[];
  const ids = (created as Array<{ id?: string | number }>).map((r) => r?.id).filter((id) => id != null);
  if (!userId || !ids.length) return created;
  try {
    const authored = await directus.request(updateItems(collection, ids, { user_created: userId }, opts.query));
    return Array.isArray(authored) && authored.length === created.length ? authored : created;
  } catch (e) {
    console.warn(`[create-as] ${collection} (${ids.length} rows): author not set:`, e);
    return created;
  }
}

/** One row, authored as the signed-in caller of `event`. */
export async function createAsCaller<T = any>(event: H3Event, collection: string, row: Row, opts: Options = {}): Promise<T> {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  return createAs<T>(collection, row, userId, opts);
}
