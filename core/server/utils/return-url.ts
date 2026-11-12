/**
 * Where an outside flow (the Stripe billing portal) may send someone back to.
 * SERVER ONLY.
 *
 * Only the app itself: the configured app origin, or the origin the request
 * came from when it is one we serve (`safeRequestOrigin` — the app host, the
 * main domain or a verified custom domain). A path is taken relative to that
 * origin. Anything else — another site, `//evil.example`, `javascript:` — falls
 * back to the default, so a returnUrl can't turn a Stripe page into a redirect
 * to a lookalike. Until 2026-11-12 the portal routes passed any URL through.
 */
import type { H3Event } from "h3";

export async function safeReturnUrl(event: H3Event, returnUrl: unknown, fallbackPath: string): Promise<string> {
  const appOrigin = originOf(String(useRuntimeConfig().public.appUrl || ""));
  const fallback = `${appOrigin}${fallbackPath}`;
  if (typeof returnUrl !== "string" || !returnUrl.trim()) return fallback;

  const requestOrigin = originOf(await safeRequestOrigin(event));
  let url: URL;
  try {
    url = new URL(returnUrl, `${requestOrigin || appOrigin}/`);
  } catch {
    return fallback;
  }
  const allowed = [appOrigin, requestOrigin].filter(Boolean);
  return allowed.includes(url.origin) ? url.toString() : fallback;
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
