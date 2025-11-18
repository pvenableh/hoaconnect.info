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
    if (requireAuth && !loggedIn.value) {
      throw new Error("Authentication required");
    }

    const { data, error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "list",
        query,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to fetch items");
    }

    return data.value;
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

    const { data, error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "get",
        id,
        query,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to fetch item");
    }

    return data.value;
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

    const { data: result, error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "create",
        data,
        query,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to create item");
    }

    return result.value;
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

    const { data: result, error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "update",
        id,
        data,
        query,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to update item");
    }

    return result.value;
  };

  /**
   * Delete item(s)
   */
  const remove = async (id: string | number | (string | number)[]) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const { error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "delete",
        id,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to delete item");
    }

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

    const { data, error } = await useFetch("/api/directus/items", {
      method: "POST",
      body: {
        collection,
        operation: "aggregate",
        query,
      },
    });

    if (error.value) {
      throw new Error(error.value.message || "Failed to aggregate data");
    }

    return data.value;
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
