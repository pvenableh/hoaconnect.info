import { createDirectus, rest, staticToken } from "@directus/sdk";

/**
 * Get Directus client with admin token for server-side operations
 * This should only be used in server API routes
 */
export const getAdminDirectus = () => {
  const config = useRuntimeConfig();

  const directusUrl = config.directus.url;
  const adminToken = config.directus.staticToken;

  if (!directusUrl) {
    throw new Error("DIRECTUS_URL is not configured");
  }

  if (!adminToken) {
    throw new Error("DIRECTUS_STATIC_TOKEN is not configured");
  }

  // Create Directus client with admin token
  const client = createDirectus(directusUrl)
    .with(staticToken(adminToken))
    .with(rest());

  return client;
};
