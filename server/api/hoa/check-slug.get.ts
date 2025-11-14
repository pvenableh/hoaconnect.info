// server/api/hoa/check-slug.get.ts
import { createDirectus, rest, readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const slug = query.slug as string;

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "Slug parameter required",
    });
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    return {
      available: false,
      message: "Slug must contain only lowercase letters, numbers, and hyphens",
    };
  }

  const config = useRuntimeConfig();

  try {
    const directus = createDirectus(config.public.directusUrl).with(rest());

    const organizations = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          slug: { _eq: slug },
        },
        fields: ["id"],
        limit: 1,
      })
    );

    const isAvailable = !organizations || organizations.length === 0;

    return {
      available: isAvailable,
      message: isAvailable
        ? "This slug is available"
        : "This slug is already taken",
    };
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to check slug availability",
    });
  }
});
