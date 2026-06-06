// GET /api/hoa/by-domain?host=<host>
// Resolve a verified custom domain → its organization (id + slug). Used by the
// custom-domain server middleware to route an apex/custom host to the right org,
// and available to the client if needed. Returns null when unmatched.
import { resolveOrgByDomain } from "../../utils/domains";

export default defineEventHandler(async (event) => {
  const host = (getQuery(event).host as string) || getRequestHost(event) || "";
  const directus = getTypedDirectus();
  const org = await resolveOrgByDomain(directus, host);
  if (!org) return null;
  return { id: org.id, slug: org.slug, name: org.name };
});
