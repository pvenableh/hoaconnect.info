// server/utils/directus-update.ts

/**
 * Helper to update any Directus collection without TypeScript errors
 * This bypasses the SDK's strict typing by making a direct REST API call
 */
export const updateDirectusItem = async (
  collection: string,
  id: string | number,
  data: Record<string, any>
) => {
  const config = useRuntimeConfig();

  const directusUrl = config.directus.url;
  const adminToken = config.directus.staticToken;

  const response = await $fetch(`${directusUrl}/items/${collection}/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: data,
  });

  return response;
};
