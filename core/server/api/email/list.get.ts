import { readItems, aggregate } from "@directus/sdk";

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

  try {
    const directus = getTypedDirectus();

    // Build filter
    const filter: Record<string, any> = {
      organization: { _eq: organizationId },
    };

    if (status) {
      filter.status = { _eq: status };
    }

    // Get emails with pagination
    const emails = await directus.request(
      readItems("hoa_emails", {
        filter,
        fields: [
          "id",
          "status",
          "subject",
          "email_type",
          "date_created",
          "sent_at",
          "scheduled_at",
          "recipient_count",
          "delivered_count",
          "failed_count",
        ],
        sort: ["-date_created"],
        limit,
        offset: (page - 1) * limit,
      })
    );

    // Get total count for pagination
    const countResult = await directus.request(
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
