/**
 * Stream a Directus file to the browser with the app's token, once the caller
 * has decided the viewer may have it. Shared by the asset proxy
 * (`/api/directus/assets/:id`) and the routes that serve a file by what it is
 * attached to (a lease request's document).
 */
import type { H3Event } from "h3";

/** The only query params forwarded upstream — an allow-list, not a filter. */
const TRANSFORM_KEYS = ["width", "height", "fit", "quality", "format", "key", "download"] as const;

export async function streamDirectusFile(
  event: H3Event,
  file: { id: string; filename_download?: string | null },
  opts: { transforms?: boolean } = {}
) {
  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;

  const params = new URLSearchParams();
  if (opts.transforms !== false) {
    const incoming = getQuery(event);
    for (const key of TRANSFORM_KEYS) {
      const value = incoming[key];
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, String(value));
      }
    }
  }
  const qs = params.toString();

  const upstream = await fetch(`${url}/assets/${file.id}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw createError({ statusCode: 502, statusMessage: "Could not read the file." });
  }

  const contentType = upstream.headers.get("content-type");
  if (contentType) setResponseHeader(event, "Content-Type", contentType);
  const length = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(length) && length > 0) setResponseHeader(event, "Content-Length", length);
  if (file.filename_download) {
    setResponseHeader(event, "Content-Disposition", `inline; filename="${file.filename_download.replace(/"/g, "")}"`);
  }
  // A shared cache must never hold one member's document for the next visitor.
  setResponseHeader(event, "Cache-Control", "private, no-store");

  return sendStream(event, upstream.body as unknown as ReadableStream);
}
