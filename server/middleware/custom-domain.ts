// server/middleware/custom-domain.ts
// Routes a verified custom/APEX domain's ROOT to the owning org's public page.
// Scoped intentionally to "/" only — API, assets, and app routes are left
// untouched, so this can't break existing slug/main-domain routing. Deeper
// slug-less routing under a custom domain (so the whole app works at the apex
// without a slug in the URL) is a deliberate follow-up.
import { resolveOrgByDomain, isMainDomainHost } from "../utils/domains";

const cache = new Map<string, { slug: string | null; exp: number }>();
const TTL = 60_000; // 1 min — keeps DNS/domain changes reasonably fresh

export default defineEventHandler(async (event) => {
  const url = event.node.req.url || "/";

  // Only the public root (with or without a query string).
  if (url !== "/" && !url.startsWith("/?")) return;

  const host = getRequestHost(event);
  const config = useRuntimeConfig();
  if (isMainDomainHost(host, config.public.mainDomain as string)) return;

  const key = (host || "").toLowerCase();
  const now = Date.now();
  let entry = cache.get(key);
  if (!entry || entry.exp < now) {
    try {
      const directus = getTypedDirectus();
      const org = await resolveOrgByDomain(directus, host);
      entry = { slug: org?.slug ?? null, exp: now + TTL };
    } catch {
      entry = { slug: null, exp: now + TTL };
    }
    cache.set(key, entry);
  }
  if (!entry.slug) return;

  // Serve the org's public landing page at the apex root.
  const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  event.node.req.url = `/${entry.slug}${qs}`;
});
