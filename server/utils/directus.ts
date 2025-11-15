// server/utils/directus.ts
import {
  createDirectus,
  rest,
  authentication,
  staticToken,
} from "@directus/sdk";
import type { H3Event } from "h3";

// Create a server-side Directus client with admin token
export const directusServer = createDirectus(process.env.DIRECTUS_URL!)
  .with(staticToken(process.env.DIRECTUS_ADMIN_TOKEN!))
  .with(rest());

// Create authenticated Directus client based on user session
export const useDirectusServer = async (event?: H3Event) => {
  const config = useRuntimeConfig();

  // If no event context, return admin client
  if (!event) {
    return directusServer;
  }

  // Try to get user session
  const session = await getUserSession(event);

  if (!session?.directusAccessToken) {
    // Return admin client for unauthenticated requests
    // You may want to throw an error here instead depending on your needs
    return directusServer;
  }

  // Create user-specific client with their token
  return createDirectus(config.public.directusUrl)
    .with(staticToken(session.directusAccessToken))
    .with(rest());
};
