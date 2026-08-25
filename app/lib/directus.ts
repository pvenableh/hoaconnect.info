// app/lib/directus.ts
// Client-side Directus helper for creating typed clients

import { createDirectus, rest, authentication } from "@directus/sdk";
import type { Schema } from "#core/types/directus";

/**
 * Create a typed Directus REST client
 * Use this for general API operations
 */
export function createDirectusClient(url: string) {
  return createDirectus<Schema>(url)
    .with(authentication("json"))
    .with(rest());
}

/**
 * Composable to get the default Directus client
 * Uses the URL from runtime config
 */
export function useDirectus() {
  const config = useRuntimeConfig();
  const url = config.public.directus?.url;

  if (!url) {
    throw new Error(
      "Directus URL not configured. Set DIRECTUS_URL in your .env file."
    );
  }

  return createDirectusClient(url);
}
