// server/api/directus/items/[collection]/[...id].ts
import {
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  deleteItems,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const collection = getRouterParam(event, "collection");
  const id = getRouterParam(event, "id");

  if (!collection) {
    throw createError({
      statusCode: 400,
      statusMessage: "Collection parameter is required",
    });
  }

  // Get the authenticated Directus client
  const directus = await useDirectusServer();

  try {
    switch (method) {
      case "GET": {
        if (id) {
          // Get single item
          const query = getQuery(event);
          const fields = query.fields
            ? (query.fields as string).split(",")
            : ["*"];

          const item = await directus.request(
            readItem(collection as any, id, { fields })
          );

          return item;
        } else {
          // Get multiple items
          const query = getQuery(event);
          const options: any = {};

          if (query.fields)
            options.fields = (query.fields as string).split(",");
          if (query.filter) options.filter = JSON.parse(query.filter as string);
          if (query.sort) options.sort = (query.sort as string).split(",");
          if (query.limit) options.limit = parseInt(query.limit as string);
          if (query.offset) options.offset = parseInt(query.offset as string);
          if (query.page) options.page = parseInt(query.page as string);
          if (query.search) options.search = query.search as string;
          if (query.deep) options.deep = JSON.parse(query.deep as string);
          if (query.aggregate)
            options.aggregate = JSON.parse(query.aggregate as string);
          if (query.groupBy)
            options.groupBy = (query.groupBy as string).split(",");

          const items = await directus.request(
            readItems(collection as any, options)
          );

          return items;
        }
      }

      case "POST": {
        const body = await readBody(event);

        if (Array.isArray(body)) {
          // Create multiple items
          const items = await directus.request(
            createItems(collection as any, body)
          );
          return items;
        } else {
          // Create single item
          const item = await directus.request(
            createItem(collection as any, body)
          );
          return item;
        }
      }

      case "PATCH": {
        if (!id) {
          throw createError({
            statusCode: 400,
            statusMessage: "ID is required for update operation",
          });
        }

        const body = await readBody(event);
        const item = await directus.request(
          updateItem(collection as any, id, body)
        );

        return item;
      }

      case "DELETE": {
        if (id) {
          // Delete single item
          await directus.request(deleteItem(collection as any, id));
        } else {
          // Delete multiple items
          const body = await readBody(event);
          await directus.request(deleteItems(collection as any, body));
        }

        return { success: true };
      }

      default:
        throw createError({
          statusCode: 405,
          statusMessage: "Method not allowed",
        });
    }
  } catch (error: any) {
    console.error(`Directus API error:`, error);
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.message || "Directus API error",
    });
  }
});
