import {
  createDirectus,
  rest,
  authentication,
  staticToken,
  refresh,
} from "@directus/sdk";
import type { DirectusSchema } from "~/types/directus-schema";

/**
 * Get a typed Directus client with admin access
 * Uses static token for server-side operations
 */
export function getTypedDirectus() {
  const config = useRuntimeConfig();

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(config.directus.staticToken))
    .with(rest());

  return client;
}

/**
 * Get a Directus client with user authentication
 * Uses the session token from nuxt-auth-utils
 */
export async function getUserDirectus(event: any) {
  const config = useRuntimeConfig();
  const session = await getUserSession(event);

  // Access token from secure section
  const accessToken = getSessionAccessToken(session);

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: "No authentication token available",
    });
  }

  const client = createDirectus<DirectusSchema>(config.directus.url)
    .with(staticToken(accessToken))
    .with(rest());

  return client;
}

export const getPublicDirectus = () => {
  const config = useRuntimeConfig();

  return createDirectus<DirectusSchema>(config.directus.url).with(rest());
};
