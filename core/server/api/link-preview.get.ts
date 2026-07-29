// GET /api/link-preview?url=… — Open Graph metadata for a URL, so channel
// messages can render rich link cards. Auth-gated (logged-in staff only) and
// SSRF-guarded (http/https public hosts only) since it fetches an arbitrary URL
// server-side. Best-effort: any failure returns a null-filled preview rather
// than erroring, so the client just skips the card. Ported from Earnest's
// link-preview route, hardened for HOA Connect.

/** Reject obvious non-public hosts to blunt SSRF (literal private/loopback). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "::") return true;
  if (h === "169.254.169.254") return true; // cloud metadata
  // IPv4 private / loopback / link-local ranges
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  return false;
}

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
  if (isBlockedHost(parsed.hostname)) {
    // Not an error the UI needs to see — just no preview.
    return EMPTY(url);
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "HOAConnect-LinkPreview/1.0", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return EMPTY(url);

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
