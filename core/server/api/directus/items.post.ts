// server/api/directus/items.post.ts
/**
 * Generic server API route for Directus items operations
 * Supports both authenticated and public requests
 *
 * Operations: list, get, create, update, delete, aggregate
 */

import {
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  deleteItems,
  aggregate as directusAggregate,
  type RegularCollections,
} from "@directus/sdk";
import type { Schema } from "#core/types/directus";

/**
 * Execute a Directus operation with automatic token refresh on expiration
 */
async function executeOperation(
  event: any,
  collection: string,
  operation: string,
  id?: string | number | (string | number)[],
  data?: Record<string, any>,
  query?: any,
  retryCount: number = 0
): Promise<any> {
  const session = await getUserSession(event);
  // Single concrete client type: a union of the user/public client shapes breaks
  // the SDK's contextual Schema inference inside request(), collapsing collection
  // names to never. The user client is structurally assignable to the public one.
  let directus: ReturnType<typeof getPublicDirectus>;

  if (session?.user) {
    // User is authenticated, use their token
    directus = await getUserDirectus(event, retryCount > 0);
  } else {
    // No authenticated user, use public client
    directus = getPublicDirectus();
  }

  try {
    switch (operation) {
      case "list":
        return await directus.request(
          readItems(collection as RegularCollections<Schema>, query || {})
        );

      case "get":
        if (!id) throw new Error("ID required for get operation");
        return await directus.request(
          readItem(collection as RegularCollections<Schema>, id as string | number, query || {})
        );

      case "create":
        if (!data) throw new Error("Data required for create operation");
        return await directus.request(
          createItem(collection as RegularCollections<Schema>, data, query)
        );

      case "update":
        if (!id) throw new Error("ID required for update operation");
        if (!data) throw new Error("Data required for update operation");
        return await directus.request(
          updateItem(collection as RegularCollections<Schema>, id as string | number, data, query)
        );

      case "delete":
        if (!id) throw new Error("ID required for delete operation");
        if (Array.isArray(id)) {
          await directus.request(deleteItems(collection as RegularCollections<Schema>, id as string[]));
          return { deleted: id.length };
        } else {
          await directus.request(deleteItem(collection as RegularCollections<Schema>, id as string | number));
          return { deleted: 1 };
        }

      case "aggregate":
        return await directus.request(
          directusAggregate(collection as RegularCollections<Schema>, {
            aggregate: query?.aggregate,
            groupBy: query?.groupBy,
            query: {
              filter: query?.filter,
            },
          })
        );

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error: any) {
    // Check if this is a token expiration error
    const isTokenExpired =
      error.message?.includes("Token expired") ||
      error.errors?.[0]?.extensions?.code === "TOKEN_EXPIRED" ||
      (error.response?.status === 401 && error.message?.includes("Token"));

    // Retry once with force refresh if token is expired
    if (isTokenExpired && retryCount === 0 && session?.user) {
      return executeOperation(event, collection, operation, id, data, query, retryCount + 1);
    }

    throw error;
  }
}

/** Collections whose rows feed doc/bylaw RAG retrieval. */
const RAG_SOURCE_COLLECTIONS = new Set(["hoa_governance", "hoa_documents"]);

/**
 * Re-index a governing-document write into ai_doc_chunks, FIRE-AND-FORGET: the
 * Directus write + its response are already done, so embedding happens out of
 * band and a failure can never break (or slow) the save. No-op unless RAG is
 * configured (VOYAGE_API_KEY present) and the collection is a RAG source.
 */
function maybeReindexRag(
  collection: string,
  operation: string,
  id: string | number | (string | number)[] | undefined,
  result: any
): void {
  if (!isRagConfigured() || !RAG_SOURCE_COLLECTIONS.has(collection)) return;
  const source = collection as "hoa_governance" | "hoa_documents";

  if (operation === "delete") {
    const ids = Array.isArray(id) ? id : id != null ? [id] : [];
    for (const one of ids) void removeItemChunks(source, String(one)).catch(() => {});
    return;
  }

  let ids: string[] = [];
  if (operation === "create") ids = result?.id != null ? [String(result.id)] : [];
  else if (operation === "update") ids = Array.isArray(id) ? id.map(String) : id != null ? [String(id)] : [];
  for (const one of ids) void ingestItem(source, one).catch(() => {});
}

/**
 * Directus SDK errors carry the useful detail in `errors[]` — `error.message` is
 * often just the generic "An unexpected error occurred." that Directus returns
 * for a 500. Flatten the upstream messages (plus their extension codes) so a
 * broken permission filter names itself instead of vanishing into a bare 500.
 */
function describeDirectusError(error: any): string | undefined {
  const errors = error?.errors ?? error?.data?.errors ?? error?.response?.errors;
  if (!Array.isArray(errors) || !errors.length) return undefined;
  return errors
    .map((e: any) => {
      const code = e?.extensions?.code;
      const field = e?.extensions?.field;
      const parts = [e?.message ?? "Unknown Directus error"];
      if (code) parts.push(`code=${code}`);
      if (field) parts.push(`field=${field}`);
      return parts.join(" ");
    })
    .join("; ");
}

export default defineEventHandler(async (event) => {
  let collection: string | undefined;
  let operation: string | undefined;

  try {
    const body = await readBody(event);
    collection = body.collection;
    operation = body.operation;
    const { id, data, query } = body;

    if (!collection || !operation) {
      throw createError({
        statusCode: 400,
        message: "Collection and operation are required",
      });
    }

    const result = await executeOperation(event, collection, operation, id, data, query);
    maybeReindexRag(collection, operation, id, result);
    return result;
  } catch (error: any) {
    const directusDetail = describeDirectusError(error);

    // Log detailed error info for debugging
    console.error("[/api/directus/items] Error:", {
      message: error.message,
      directusErrors: directusDetail,
      statusCode: error.statusCode,
      statusMessage: error.statusMessage,
      collection,
      operation,
    });

    // Check for auth-related errors
    if (error.statusCode === 401 || error.statusMessage?.includes('session')) {
      throw createError({
        statusCode: 401,
        message: error.statusMessage || "Authentication required - please log in again",
      });
    }

    // In dev, hand the upstream Directus message back to the client so a failing
    // widget call is debuggable from the network tab. In prod the response stays
    // generic (the detail is in the server log above).
    const message = error.message || "Failed to perform operation";
    throw createError({
      statusCode: error.statusCode || 500,
      message:
        import.meta.dev && directusDetail
          ? `${message} [${collection}.${operation}] ${directusDetail}`
          : message,
    });
  }
});
