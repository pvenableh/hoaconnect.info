// GET /api/hoa/by-domain?host=<host>
// Resolve a verified custom domain → its organization (id + slug). Used by the
// client domain-detector middleware to give a custom host its org context, and
// by anything else that needs Host → org from the browser.
//
// Goes through the cached resolver: this fires on essentially every navigation
// on a custom domain, so it must not be a Directus round-trip each time.
import { resolveOrgForHost } from "../../utils/host-resolver";

export default defineEventHandler(async (event) => {
  const host = (getQuery(event).host as string) || getRequestHost(event) || "";
  const org = await resolveOrgForHost(host);
  if (!org) return null;
  return { id: org.id, slug: org.slug, name: org.name };
});
