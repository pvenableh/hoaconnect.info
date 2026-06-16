// GET /api/domains/ask?domain=<host>
// Caddy on-demand TLS gate. Caddy calls this before issuing a Let's Encrypt cert
// for an incoming host; we return 200 only if that host is a *verified* custom
// domain, so we can't be tricked into minting certs for arbitrary domains.
import { resolveOrgByDomain } from "../../utils/domains";

export default defineEventHandler(async (event) => {
  const domain = (getQuery(event).domain as string) || "";
  if (!domain) {
    throw createError({ statusCode: 400, message: "domain required" });
  }
  const directus = getTypedDirectus();
  const org = await resolveOrgByDomain(directus, domain);
  if (!org) {
    // 404 → Caddy refuses to obtain a certificate for this host.
    throw createError({ statusCode: 404, message: "Domain not configured" });
  }
  return "ok";
});
