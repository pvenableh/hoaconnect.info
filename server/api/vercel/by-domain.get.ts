// server/api/hoa/by-domain.get.ts
import { createDirectus, rest, readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const domain = query.domain as string;

  if (!domain) {
    throw createError({
      statusCode: 400,
      message: "Domain parameter required",
    });
  }

  const config = useRuntimeConfig();

  try {
    const directus = createDirectus(config.public.directusUrl).with(rest());

    const hoas = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          custom_domain: { _eq: domain },
          domain_verified: { _eq: true },
        },
        fields: ["*", "amenities.*", "settings.*", "subscription.*"],
        limit: 1,
      })
    );

    if (!hoas || hoas.length === 0) {
      throw createError({
        statusCode: 404,
        message: "No HOA found for this domain",
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
