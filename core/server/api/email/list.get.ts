import { readItems, aggregate } from "@directus/sdk";
import { EMAIL_LIST_FIELDS, emailListFilter, emailListSpecs } from "#core/server/utils/email-list-reads";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);

  const organizationId = query.organizationId as string;
  const status = query.status as string | undefined;
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 20;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "organizationId is required",
    });
  }

  // The same gate as sending. Until 2026-11-12 any signed-in user could list
  // any community's emails (subjects, dates, counts) by its id.
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  const filter = emailListFilter(organizationId, status);

  // The page and its count go as one request (email-list-reads.ts), after the
  // gate: a refusal reads nothing. A failed batch reads one by one as before,
  // failing the same way.
  const batched = await Promise.resolve()
    .then(() => readItemsBatch(emailListSpecs(filter, page, limit)))
    .catch(() => null);

  try {
    const directus = getTypedDirectus();

    // Get emails with pagination
    const emails = batched
      ? batched.el_emails
      : await directus.request(
          readItems("hoa_emails", {
            filter,
            fields: [...EMAIL_LIST_FIELDS],
            sort: ["-date_created"],
            limit,
            offset: (page - 1) * limit,
          })
        );

    // Get total count for pagination
    const countResult = batched
      ? batched.el_total
      : await directus.request(
          aggregate("hoa_emails", {
            aggregate: { count: "*" },
            query: { filter },
          })
        );

    const total = countResult[0]?.count || 0;

    return {
      success: true,
      emails,
      pagination: {
        page,
        limit,
        total: typeof total === "string" ? parseInt(total) : total,
        totalPages: Math.ceil((typeof total === "string" ? parseInt(total) : total) / limit),
      },
    };
  } catch (error: any) {
    console.error("Email list error:", error);
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to fetch emails",
    });
  }
});
