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
} from "@directus/sdk";

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
  let directus;

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
        return await directus.request(readItems(collection, query || {}));

      case "get":
        if (!id) throw new Error("ID required for get operation");
        return await directus.request(readItem(collection, id, query || {}));

      case "create":
        if (!data) throw new Error("Data required for create operation");
        return await directus.request(createItem(collection, data, query));

      case "update":
        if (!id) throw new Error("ID required for update operation");
        if (!data) throw new Error("Data required for update operation");
        return await directus.request(updateItem(collection, id, data, query));

      case "delete":
        if (!id) throw new Error("ID required for delete operation");
        if (Array.isArray(id)) {
          await directus.request(deleteItems(collection, id));
          return { deleted: id.length };
        } else {
          await directus.request(deleteItem(collection, id));
          return { deleted: 1 };
        }

      case "aggregate":
        return await directus.request(
          directusAggregate(collection, {
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

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { collection, operation, id, data, query } = body;

    if (!collection || !operation) {
      throw createError({
        statusCode: 400,
        message: "Collection and operation are required",
      });
    }

    return await executeOperation(event, collection, operation, id, data, query);
  } catch (error: any) {
    console.error("[/api/directus/items] Error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform operation",
    });
  }
});
