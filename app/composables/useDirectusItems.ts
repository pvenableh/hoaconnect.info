import type { QueryFilter } from "@directus/sdk";
import type { DirectusCollections, DirectusSchema, DirectusItem } from "~/types/directus-schema";

interface ItemsQuery<T extends DirectusCollections> {
  fields?: string[];
  filter?: QueryFilter<DirectusSchema, DirectusItem<T>>;
  sort?: string[];
  limit?: number;
  offset?: number;
  page?: number;
  search?: string;
  deep?: Record<string, any>;
  aggregate?: Record<string, string[]>;
  groupBy?: string[];
}

export const useDirectusItems = <T extends DirectusCollections>(
  collection: T,
  options: { requireAuth?: boolean } = {}
) => {
  const { requireAuth = true } = options;
  const { loggedIn } = useUserSession();

  /**
   * List items from collection
   */
  const list = async (query: ItemsQuery<T> = {}) => {
    console.log(`[useDirectusItems:${collection}] list() called`);
    console.log(`[useDirectusItems:${collection}] requireAuth:`, requireAuth);
    console.log(`[useDirectusItems:${collection}] loggedIn:`, loggedIn.value);
    console.log(`[useDirectusItems:${collection}] query:`, JSON.stringify(query, null, 2));

    if (requireAuth && !loggedIn.value) {
      console.error(`[useDirectusItems:${collection}] Authentication required but user not logged in`);
      throw new Error("Authentication required");
    }

    try {
      const requestBody = {
        collection,
        operation: "list",
        query,
      };

      console.log(`[useDirectusItems:${collection}] Calling /api/directus/items with:`, JSON.stringify(requestBody, null, 2));

      const result = await $fetch("/api/directus/items", {
        method: "POST",
        body: requestBody,
      });

      console.log(`[useDirectusItems:${collection}] API response:`, result);
      console.log(`[useDirectusItems:${collection}] Response is array:`, Array.isArray(result));
      console.log(`[useDirectusItems:${collection}] Response length:`, result?.length);

      return result;
    } catch (error: any) {
      console.error(`[useDirectusItems:${collection}] Error calling API:`, error);
      console.error(`[useDirectusItems:${collection}] Error details:`, {
        message: error.message,
        statusCode: error.statusCode,
        data: error.data,
      });
      throw error;
    }
  };

  /**
   * Get single item by ID
   */
  const get = async (
    id: string | number,
    query: Pick<ItemsQuery<T>, "fields" | "deep"> = {}
  ) => {
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "get",
        id,
        query,
      },
    });
  };

  /**
   * Create new item
   */
  const create = async (
    data: Record<string, any>,
    query: Pick<ItemsQuery<T>, "fields"> = {}
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "create",
        data,
        query,
      },
    });
  };

  /**
   * Update existing item
   */
  const update = async (
    id: string | number,
    data: Record<string, any>,
    query: Pick<ItemsQuery<T>, "fields"> = {}
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "update",
        id,
        data,
        query,
      },
    });
  };

  /**
   * Delete item(s)
   */
  const remove = async (id: string | number | (string | number)[]) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "delete",
        id,
      },
    });

    return true;
  };

  /**
   * Aggregate data
   */
  const aggregate = async (
    query: Pick<ItemsQuery<T>, "aggregate" | "groupBy" | "filter">
  ) => {
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "aggregate",
        query,
      },
    });
  };

  /**
   * Count items
   */
  const count = async (filter?: QueryFilter<DirectusSchema, DirectusItem<T>>) => {
    const result = await aggregate({
      aggregate: { count: ["*"] },
      filter,
    });

    return result?.[0]?.count || 0;
  };

  return {
    list,
    get,
    create,
    update,
    remove,
    delete: remove, // Alias
    aggregate,
    count,
  };
};
