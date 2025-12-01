// app/lib/directus.ts
// Client-side Directus helper for creating typed clients

import { createDirectus, rest, authentication, realtime } from "@directus/sdk";
import type { DirectusSchema } from "~/types/directus-schema";

/**
 * Create a typed Directus REST client
 * Use this for general API operations
 */
export function createDirectusClient(url: string) {
  return createDirectus<DirectusSchema>(url)
    .with(authentication("json"))
    .with(rest());
}

/**
 * Create a typed Directus client with realtime support
 * Use this for WebSocket subscriptions
 */
export function createDirectusRealtimeClient(url: string, websocketUrl: string) {
  return createDirectus<DirectusSchema>(url)
    .with(authentication("json"))
    .with(rest())
    .with(realtime({ url: websocketUrl }));
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

/**
 * Composable to get a Directus client with realtime support
 * Uses URLs from runtime config
 */
export function useDirectusRealtime() {
  const config = useRuntimeConfig();
  const url = config.public.directus?.url;
  const websocketUrl = config.public.directus?.websocketUrl;

  if (!url || !websocketUrl) {
    throw new Error(
      "Directus URLs not configured. Set DIRECTUS_URL and DIRECTUS_WEBSOCKET_URL in your .env file."
    );
  }

  return createDirectusRealtimeClient(url, websocketUrl);
}
