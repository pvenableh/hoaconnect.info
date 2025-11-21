// server/api/directus/items.post.ts

/**
 * Server API route for Directus items operations
 * Supports both authenticated and public requests
 */

import {
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  deleteItems,
  aggregate as directusAggregate,
  type DirectusClient, // ← ADDED
  type RestClient, // ← ADDED
  type StaticTokenClient,
} from "@directus/sdk";
import type {
  DirectusCollections,
  DirectusSchema,
} from "~/types/directus-schema";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { collection: collectionName, operation, id, data, query } = body;

    console.log("[/api/directus/items] Request received");
    console.log("[/api/directus/items] Collection:", collectionName);
    console.log("[/api/directus/items] Operation:", operation);
    console.log("[/api/directus/items] Query:", JSON.stringify(query, null, 2));

    if (!collectionName || !operation) {
      throw createError({
        statusCode: 400,
        message: "Collection and operation are required",
      });
    }

    // Cast collection name to DirectusCollections type
    const collection = collectionName as DirectusCollections;

    // Check if user is authenticated
    const session = await getUserSession(event);
    console.log("[/api/directus/items] Session exists:", !!session);
    console.log("[/api/directus/items] User exists:", !!session?.user);
    console.log("[/api/directus/items] User ID:", session?.user?.id);

    let directus: DirectusClient<DirectusSchema> & RestClient<DirectusSchema>;

    if (session?.user) {
      // User is authenticated, use their token
      console.log("[/api/directus/items] Using authenticated client");
      directus = await getUserDirectus(event);
    } else {
      // No authenticated user, use public client
      console.log("[/api/directus/items] Using public client");
      directus = getPublicDirectus();
    }

    // Handle different operations using native SDK methods
    switch (operation) {
      case "list":
        console.log("[/api/directus/items] Calling readItems with collection:", collection);
        console.log("[/api/directus/items] readItems query:", JSON.stringify(query, null, 2));

        try {
          const result = await directus.request(readItems(collection, query || {}));

          console.log("[/api/directus/items] readItems SUCCESS");
          console.log("[/api/directus/items] Result is array:", Array.isArray(result));
          console.log("[/api/directus/items] Result length:", result?.length);
          console.log("[/api/directus/items] First item (if exists):", result?.[0] ? JSON.stringify(result[0], null, 2) : 'N/A');

          return result;
        } catch (readError: any) {
          console.error("[/api/directus/items] readItems FAILED");
          console.error("[/api/directus/items] Error:", readError);
          console.error("[/api/directus/items] Error message:", readError.message);
          console.error("[/api/directus/items] Error response:", readError.response);
          console.error("[/api/directus/items] Error errors:", readError.errors);
          throw readError;
        }

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

        // Handle single or multiple deletions
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
    console.error("[/api/directus/items] Error occurred:", error);
    console.error("[/api/directus/items] Error message:", error.message);
    console.error("[/api/directus/items] Error statusCode:", error.statusCode);
    console.error("[/api/directus/items] Error stack:", error.stack);
    console.error("[/api/directus/items] Full error object:", JSON.stringify(error, null, 2));

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform operation",
    });
  }
});
