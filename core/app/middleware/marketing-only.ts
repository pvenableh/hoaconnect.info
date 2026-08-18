// middleware/marketing-only.ts
// Confines the platform marketing pages to the marketing host.
//
// They live as ordinary top-level routes (`/property-managers`, `/experimental`),
// which means they would otherwise be reachable on every host we serve —
// including a community's own custom domain, where a HOA Connect sales page has
// no business appearing. Named (not global): only the marketing pages opt in.
import { isMarketingHost } from "#core/shared/domains/host";

export default defineNuxtRouteMiddleware(() => {
  const host = import.meta.client
    ? window.location.host
    : useRequestURL({ xForwardedHost: true }).host;
  const mainDomain = useRuntimeConfig().public.mainDomain as string | undefined;
  if (isMarketingHost(host, mainDomain)) return;

  // Not the marketing host — this page does not exist here. 404 rather than
  // redirect, so a customer's domain never advertises the platform.
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
});
