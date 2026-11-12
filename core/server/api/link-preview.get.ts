// GET /api/link-preview?url=… — Open Graph metadata for a URL, so channel
// messages can render rich link cards. Auth-gated (logged-in staff only) and
// SSRF-guarded (http/https public hosts only) since it fetches an arbitrary URL
// server-side. Best-effort: any failure returns a null-filled preview rather
// than erroring, so the client just skips the card. Ported from Earnest's
// link-preview route, hardened for HOA Connect.
//
// The guard resolves the host and refuses any private/local/reserved address,
// and redirects are followed by hand with the check re-run on each hop
// (public-url.ts). Until 2026-11-12 it only compared the hostname's spelling and
// followed redirects blindly, so a public URL that redirected to 169.254.169.254
// (or a name resolving to 10.x) was fetched and its <title> returned.
import { fetchPublic, isPublicHttpUrl } from "#core/server/utils/public-url";

const EMPTY = (url: string) => ({ url, title: null, description: null, image: null, siteName: null });

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const url = String(getQuery(event).url || "");
  if (!url) throw createError({ statusCode: 400, message: "Missing url parameter" });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw createError({ statusCode: 400, message: "Invalid URL" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createError({ statusCode: 400, message: "Only http(s) URLs are supported" });
  }
  if (!(await isPublicHttpUrl(parsed))) {
    // Not an error the UI needs to see — just no preview.
    return EMPTY(url);
  }

  try {
    const response = await fetchPublic(url, {
      headers: { "User-Agent": "HOAConnect-LinkPreview/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response?.ok) return EMPTY(url);

    // Only parse HTML, and cap how much we read (previews live in the <head>).
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return EMPTY(url);
    const html = (await response.text()).slice(0, 250_000);

    const og = (property: string): string | null => {
      const m =
        html.match(new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, "i")) ||
        html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, "i"));
      return m?.[1] || null;
    };
    const meta = (name: string): string | null => {
      const m =
        html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
        html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"));
      return m?.[1] || null;
    };
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    return {
      url,
      title: og("title") || meta("title") || titleMatch?.[1]?.trim() || null,
      description: og("description") || meta("description") || null,
      image: og("image") || null,
      siteName: og("site_name") || null,
    };
  } catch {
    return EMPTY(url);
  }
});
