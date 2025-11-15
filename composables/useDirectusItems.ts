// composables/useDirectusItems.ts
import {
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  deleteItems,
  aggregate,
} from "@directus/sdk";
import type { DirectusClient } from "@directus/sdk";
import type { ID } from "@directus/sdk";

interface ItemsOptions {
  fields?: string[];
  filter?: any;
  sort?: string[];
  limit?: number;
  offset?: number;
  page?: number;
  search?: string;
  deep?: any;
}

export const useDirectusItems = () => {
  const { user } = useDirectusAuth();

  /**
   * Add organization filter for multi-tenancy
   */
  const addOrgFilter = (filter: any = {}) => {
    if (!user.value?.organization) {
      return filter;
    }

    return {
      ...filter,
      organization: {
        _eq: user.value.organization,
      },
    };
  };

  /**
   * Fetch multiple items from a collection
   */
  const fetchItems = async <T = any>(
    collection: string,
    options: ItemsOptions = {}
  ): Promise<T[]> => {
    try {
      // Apply multi-tenancy filter for HOA collections
      const filter = collection.startsWith("hoa_")
        ? addOrgFilter(options.filter)
        : options.filter;

      const response = await $fetch(`/api/directus/items/${collection}`, {
        method: "GET",
        query: {
          fields: options.fields,
          filter,
          sort: options.sort,
          limit: options.limit,
          offset: options.offset,
          page: options.page,
          search: options.search,
          deep: options.deep,
        },
      });

      return response as T[];
    } catch (error: any) {
      console.error(`Failed to fetch ${collection}:`, error);
      throw error;
    }
  };

  /**
   * Fetch a single item from a collection
   */
  const fetchItem = async <T = any>(
    collection: string,
    id: ID,
    options: { fields?: string[] } = {}
  ): Promise<T> => {
    try {
      const response = await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: "GET",
        query: {
          fields: options.fields,
        },
      });

      return response as T;
    } catch (error: any) {
      console.error(`Failed to fetch ${collection}/${id}:`, error);
      throw error;
    }
  };

  /**
   * Create a new item in a collection
   */
  const createItem = async <T = any>(
    collection: string,
    data: Partial<T>
  ): Promise<T> => {
    try {
      // Add organization for HOA collections
      if (collection.startsWith("hoa_") && user.value?.organization) {
        data = {
          ...data,
          organization: user.value.organization as any,
        };
      }

      const response = await $fetch(`/api/directus/items/${collection}`, {
        method: "POST",
        body: data,
      });

      return response as T;
    } catch (error: any) {
      console.error(`Failed to create ${collection}:`, error);
      throw error;
    }
  };

  /**
   * Update an existing item
   */
  const updateItem = async <T = any>(
    collection: string,
    id: ID,
    data: Partial<T>
  ): Promise<T> => {
    try {
      const response = await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: "PATCH",
        body: data,
      });

      return response as T;
    } catch (error: any) {
      console.error(`Failed to update ${collection}/${id}:`, error);
      throw error;
    }
  };

  /**
   * Delete an item
   */
  const deleteItem = async (collection: string, id: ID): Promise<void> => {
    try {
      await $fetch(`/api/directus/items/${collection}/${id}`, {
        method: "DELETE",
      });
    } catch (error: any) {
      console.error(`Failed to delete ${collection}/${id}:`, error);
      throw error;
    }
  };

  /**
   * Delete multiple items
   */
  const deleteItems = async (collection: string, ids: ID[]): Promise<void> => {
    try {
      await $fetch(`/api/directus/items/${collection}`, {
        method: "DELETE",
        body: ids,
      });
    } catch (error: any) {
      console.error(`Failed to delete multiple ${collection}:`, error);
      throw error;
    }
  };

  /**
   * Aggregate data from a collection
   */
  const aggregateItems = async (
    collection: string,
    options: {
      aggregate?: Record<string, string[]>;
      groupBy?: string[];
      filter?: any;
    } = {}
  ): Promise<any> => {
    try {
      const filter = collection.startsWith("hoa_")
        ? addOrgFilter(options.filter)
        : options.filter;

      const response = await $fetch(`/api/directus/items/${collection}`, {
        method: "GET",
        query: {
          aggregate: options.aggregate,
          groupBy: options.groupBy,
          filter,
        },
      });

      return response;
    } catch (error: any) {
      console.error(`Failed to aggregate ${collection}:`, error);
      throw error;
    }
  };

  return {
    fetchItems,
    fetchItem,
    createItem,
    updateItem,
    deleteItem,
    deleteItems,
    aggregate: aggregateItems,

    // Aliases for convenience
    list: fetchItems,
    get: fetchItem,
    create: createItem,
    update: updateItem,
    remove: deleteItem,
    removeMany: deleteItems,
  };
};
