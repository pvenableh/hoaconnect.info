// server/api/hoa/by-slug.get.ts
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const slug = query.slug as string;

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "Slug parameter required",
    });
  }

  try {
    const directus = getTypedDirectus();

    const hoas = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          slug: { _eq: slug },
          status: { _in: ["active", "published"] },
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

    if (!hoas || hoas.length === 0) {
      throw createError({
        statusCode: 404,
        message: "No HOA found for this slug",
      });
    }

    return hoas[0];
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to fetch HOA",
    });
  }
});
