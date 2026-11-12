import { readItems } from "@directus/sdk";
import type { HoaEmail } from "#core/types/directus";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a friendly web-view reference to a concrete email id.
 *
 * Used by the public page /{org-slug}/announcements/email/{ref}, where `ref` is
 * either the email's web_slug (pretty) or its id (always-unique fallback). The
 * org slug scopes the lookup so web_slugs only need to be unique per-org.
 *
 * Public for SENT emails (viewable on the web by their link). A draft resolves
 * only for the people who can send in the community's name, and is otherwise
 * "not found" — `web_slug` comes from the subject, so a draft's is guessable.
 */
export default defineEventHandler(async (event) => {
  const { org, ref } = getQuery(event) as { org?: string; ref?: string };

  if (!org || !ref) {
    throw createError({ statusCode: 400, message: "org and ref are required" });
  }

  const directus = getTypedDirectus();

  // Match either web_slug or (when it looks like one) the id, scoped to the org.
  const idOr = UUID_RE.test(ref) ? [{ id: { _eq: ref } }] : [];

  const emails = (await directus.request(
    readItems("hoa_emails", {
      filter: {
        organization: { slug: { _eq: org } },
        status: { _in: ["sent", "draft"] },
        _or: [{ web_slug: { _eq: ref } }, ...idOr],
      },
      fields: ["id", "subject", "web_slug", "status", "organization"],
      limit: 1,
    })
  )) as Array<Pick<HoaEmail, "id" | "subject" | "web_slug" | "status" | "organization">>;

  const email = emails[0];
  if (!email) {
    throw createError({ statusCode: 404, message: "Email not found" });
  }
  if (email.status === "draft") {
    const orgId = typeof email.organization === "string" ? email.organization : (email.organization as { id?: string } | null)?.id;
    const allowed = orgId
      ? await requireAdminOrManagerGrant(event, orgId, "communications").then(() => true, () => false)
      : false;
    if (!allowed) throw createError({ statusCode: 404, message: "Email not found" });
  }

  return { id: email.id, subject: email.subject };
});
