// server/api/hoa/find.get.ts
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { slug } = getQuery(event);

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "Slug is required",
    });
  }

  const directus = getTypedDirectus();

  try {
    const organizations = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          _and: [
            { slug: { _eq: slug as string } },
            { status: { _in: ["active", "published"] } },
          ],
        },
        fields: [
          "*",
          {
            invitations: ["*"],
            amenities: ["*"],
            subscription: ["*"],
            subscription_plan: ["*"],
            logo: ["*"],
            settings: ["*", { logo: ["*"], icon: ["*"] }],
            hero: ["*", { background_image: ["*"], foreground_image: ["*"] }],
          },
        ],
        limit: 1,
      })
    );

    if (!organizations || organizations.length === 0) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    return organizations[0];
  } catch (error: any) {
    // If it's already a createError, rethrow it
    if (error.statusCode) {
      throw error;
    }

    // Otherwise wrap it
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to find organization",
    });
  }
});
